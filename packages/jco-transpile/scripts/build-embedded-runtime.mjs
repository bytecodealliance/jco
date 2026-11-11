import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { rolldown } from 'rolldown';

/** Built output of the Component Model runtime package. */
const RUNTIME_DIST = new URL('../../jco-cm-runtime/dist/', import.meta.url);

/** Where js-component-bindgen keeps the runtime it bundles into generated bindings. */
const DESTINATION = new URL('../../../crates/js-component-bindgen/runtime/', import.meta.url);

/** The Component Model runtime package, whose sources the generated files come from. */
const RUNTIME_PACKAGE = new URL('../../jco-cm-runtime/', import.meta.url);

/** Paths in the runtime package that determine the generated code. */
const RUNTIME_SOURCES = ['src', 'package.json', 'tsconfig.build.json', 'tsconfig.json'];

/** Start of the first line of `runtime-all.js`, which names the runtime version it was built from. */
const VERSION_HEADER = '// @bytecodealliance/jco-cm-runtime@';

/** Start of the second line of `runtime-all.js`, which names the commit its sources come from. */
const COMMIT_HEADER = '// generated from commit ';

/**
 * Split `runtime-all.js` into the provenance its header records and the bundled code.
 *
 * @param {string} source - contents of `runtime-all.js`
 * @returns {{ version: string | null, commit: string | null, code: string }}
 */
function parseRuntime(source) {
    const lines = source.replaceAll('\r\n', '\n').split('\n');
    let version = null;
    let commit = null;
    if (lines[0]?.startsWith(VERSION_HEADER)) {
        version = lines.shift().slice(VERSION_HEADER.length);
    }
    if (lines[0]?.startsWith(COMMIT_HEADER)) {
        commit = lines.shift().slice(COMMIT_HEADER.length);
    }
    return { version, commit, code: lines.join('\n') };
}

/**
 * Name the commit that the runtime being generated comes from: the last one to
 * change the runtime's sources, which stays valid when the generating branch is
 * rebased. It is marked `-dirty` when those sources have changes not yet committed.
 *
 * @returns {Promise<string>} the commit hash, or `unknown` outside a git checkout
 */
async function runtimeCommit() {
    const run = promisify(execFile);
    const git = (...args) =>
        run('git', args, { cwd: fileURLToPath(RUNTIME_PACKAGE) }).then(({ stdout }) => stdout.trim());
    try {
        const commit = await git('log', '-1', '--format=%H', '--', ...RUNTIME_SOURCES);
        const changes = await git('status', '--porcelain', '--', ...RUNTIME_SOURCES);
        return `${commit || 'unknown'}${changes ? '-dirty' : ''}`;
    } catch {
        return 'unknown';
    }
}

/** Virtual module id of the entry point handed to the bundler. */
const ENTRY = 'runtime-entry';

/**
 * Read the runtime's built modules, keyed by a path that does not depend on
 * where the repository is checked out.
 *
 * @returns {Promise<Map<string, string>>} module source by virtual id
 */
async function readRuntimeModules() {
    const modules = new Map();
    for (const file of await readdir(RUNTIME_DIST, { recursive: true })) {
        if (!file.endsWith('.js')) {
            continue;
        }
        const source = await readFile(new URL(file.replaceAll('\\', '/'), RUNTIME_DIST), 'utf8');
        modules.set(`runtime/${file.replaceAll('\\', '/')}`, source.replaceAll('\r\n', '\n'));
    }
    return modules;
}

/**
 * Bundle `entry` and the runtime modules it reaches into a single ES module.
 *
 * @param {string} entry - source of the entry module
 * @param {Map<string, string>} modules - runtime module source by virtual id
 * @returns {Promise<import('rolldown').OutputChunk>} the bundled chunk
 */
async function bundle(entry, modules) {
    const build = await rolldown({
        input: ENTRY,
        platform: 'neutral',
        external: (id) => id.startsWith('node:'),
        plugins: [
            {
                name: 'embedded-runtime',
                resolveId(id, importer) {
                    if (id === ENTRY) {
                        return id;
                    }
                    const resolved = id.startsWith('.') ? posix.join(posix.dirname(importer), id) : id;
                    if (modules.has(resolved)) {
                        return { id: resolved, moduleSideEffects: false };
                    }
                },
                load(id) {
                    return id === ENTRY ? entry : modules.get(id);
                },
            },
        ],
    });

    try {
        const { output } = await build.generate({ format: 'esm', minify: false, codeSplitting: false });
        if (output.length !== 1 || output[0].type !== 'chunk') {
            throw new Error('expected the runtime to bundle into one chunk');
        }
        return output[0];
    } finally {
        await build.close();
    }
}

/**
 * Generate the runtime files that js-component-bindgen bundles into bindings:
 * - `runtime-all.js` exports every public runtime name under a unique alias;
 * - `runtime-export-map.tsv` maps `<subpath>:<export>` to that alias.
 *
 * `runtime-all.js` starts with two lines naming the runtime version it was built
 * from and the commit those sources were last changed in.
 *
 * Options:
 * - `--check` compares against the committed files instead of writing them,
 *   and fails when they are out of date;
 * - `--advisory` makes an out-of-date result a warning instead of a failure,
 *   since a crate release may deliberately ship an older runtime;
 * - `--result <path>` writes the outcome of a check as JSON to `path`.
 */
async function main() {
    const check = process.argv.includes('--check');
    const advisory = process.argv.includes('--advisory');
    const resultIndex = process.argv.indexOf('--result');
    const resultPath = resultIndex === -1 ? undefined : process.argv[resultIndex + 1];
    const manifest = JSON.parse(await readFile(new URL('../package.json', RUNTIME_DIST), 'utf8'));
    const modules = await readRuntimeModules();

    // Alias every export of every public subpath, so that names shared between
    // subpaths stay distinct in the single bundled module.
    const exportMap = [];
    const reexports = [];
    for (const [subpath, conditions] of Object.entries(manifest.exports)) {
        if (subpath === '.') {
            continue;
        }
        const id = `runtime/${conditions.default.slice('./dist/'.length)}`;
        const { exports } = await bundle(`export * from ${JSON.stringify(id)};`, modules);
        for (const name of exports.toSorted()) {
            const alias = `runtimeExport${exportMap.length}`;
            exportMap.push(`${subpath.slice(2)}:${name}\t${alias}`);
            reexports.push(`export { ${name} as ${alias} } from ${JSON.stringify(id)};`);
        }
    }
    const { code } = await bundle(reexports.join('\n'), modules);
    const header = `${VERSION_HEADER}${manifest.version}\n${COMMIT_HEADER}${await runtimeCommit()}\n`;

    const stale = [];
    for (const [file, contents, generated] of [
        ['runtime-all.js', header + code, code],
        ['runtime-export-map.tsv', exportMap.join('\n') + '\n'],
    ]) {
        const target = new URL(file, DESTINATION);
        const current = (await readFile(target, 'utf8').catch(() => undefined))?.replaceAll('\r\n', '\n');
        if (check) {
            // The header records provenance rather than content, so only the
            // generated code decides whether a file is out of date.
            const unchanged =
                generated === undefined ? current === contents : parseRuntime(current ?? '').code === generated;
            if (!unchanged) {
                stale.push(fileURLToPath(target));
            }
        } else if (current !== contents) {
            await writeFile(target, contents);
        }
    }
    if (resultPath) {
        const embedded = parseRuntime(await readFile(new URL('runtime-all.js', DESTINATION), 'utf8').catch(() => ''));
        await mkdir(dirname(resultPath), { recursive: true });
        await writeFile(
            resultPath,
            JSON.stringify({
                stale: stale.length > 0,
                embeddedVersion: embedded.version,
                embeddedCommit: embedded.commit,
                currentVersion: manifest.version,
            }),
        );
    }
    if (stale.length > 0) {
        const message = `the embedded runtime differs from packages/jco-cm-runtime: ${stale.join(', ')}; update it with \`cargo xtask update-embedded-runtime\``;
        if (!advisory) {
            throw new Error(message);
        }
        // GitHub Actions surfaces this as an annotation; elsewhere it is a plain warning.
        console.warn(process.env.GITHUB_ACTIONS ? `::warning title=Embedded runtime::${message}` : message);
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
