import { readFile, readdir, writeFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rolldown } from 'rolldown';

/** Built output of the Component Model runtime package. */
const RUNTIME_DIST = new URL('../../jco-cm-runtime/dist/', import.meta.url);

/** Where js-component-bindgen keeps the runtime it bundles into generated bindings. */
const DESTINATION = new URL('../../../crates/js-component-bindgen/runtime/', import.meta.url);

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
 * With `--check`, compare against the committed files instead of writing them.
 */
async function main() {
    const check = process.argv.includes('--check');
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

    const stale = [];
    for (const [file, contents] of [
        ['runtime-all.js', code],
        ['runtime-export-map.tsv', exportMap.join('\n') + '\n'],
    ]) {
        const target = new URL(file, DESTINATION);
        const current = await readFile(target, 'utf8').catch(() => undefined);
        if (current?.replaceAll('\r\n', '\n') === contents) {
            // Leave current files untouched, so builds that embed them are not redone.
            continue;
        }
        if (check) {
            stale.push(fileURLToPath(target));
        } else {
            await writeFile(target, contents);
        }
    }
    if (stale.length > 0) {
        throw new Error(
            `out of date: ${stale.join(', ')}; regenerate with \`pnpm --filter @bytecodealliance/jco-transpile build:embedded-runtime\``,
        );
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
