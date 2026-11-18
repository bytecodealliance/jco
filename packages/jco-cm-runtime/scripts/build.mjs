import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const exec = promisify(execFile);

/**
 * The statement labels that each profile removes.
 *
 * - `checked` removes diagnostics;
 * - `debug` keeps them, one module per source file.
 */
export const profiles = { checked: ['DEBUG'], debug: [] };

/** Where the package keeps each profile, relative to its output directory. */
const PACKAGE_LAYOUT = { checked: '.', debug: 'debug' };

/**
 * Compile the sources to one JavaScript module and declaration per source file.
 *
 * @param {string} staging - directory to compile into
 * @returns {Promise<void>}
 */
async function compile(staging) {
    const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
    await exec(process.execPath, [tsc, '-p', join(root, 'tsconfig.build.json'), '--outDir', staging]);
}

/**
 * Read a source map, with its sources as absolute paths.
 *
 * @param {string} path - the source map to read
 * @returns {Promise<{ sources: string[], sourceRoot?: string }>}
 */
async function readSourceMap(path) {
    const map = JSON.parse(await readFile(path, 'utf8'));
    map.sources = map.sources.map((source) => resolve(dirname(path), map.sourceRoot ?? '', source));
    map.sourceRoot = '';
    return map;
}

/**
 * Make the absolute sources of a source map relative to where the map will be.
 *
 * @param {{ sources: string[] }} map - a source map with absolute sources
 * @param {string} destination - final path of the source map
 * @returns {{ sources: string[] }}
 */
function relocateSourceMap(map, destination) {
    map.sources = map.sources.map((source) => relative(dirname(destination), source).replaceAll('\\', '/'));
    return map;
}

/**
 * Copy the files of `from` whose relative path matches `pattern` into `to`.
 *
 * @param {string} from - directory to copy from
 * @param {string} to - directory to copy into
 * @param {RegExp} pattern - which files to copy
 * @param {string} destination - final directory, used to relocate source maps
 * @returns {Promise<void>}
 */
async function copyMatching(from, to, pattern, destination) {
    for (const name of await readdir(from, { recursive: true })) {
        if (pattern.test(name)) {
            const path = join(to, name);
            await mkdir(dirname(path), { recursive: true });
            if (name.endsWith('.map')) {
                const map = await readSourceMap(join(from, name));
                await writeFile(path, JSON.stringify(relocateSourceMap(map, join(destination, name))));
            } else {
                await cp(join(from, name), path);
            }
        }
    }
}

/**
 * Write one profile of the compiled runtime into `outDir`.
 *
 * The `debug` profile is the compiled modules as they are. The `checked` profile is
 * bundled, one module per public entry point with shared chunks, after its labels are removed.
 *
 * @param {string} compiled - directory holding the compiled modules
 * @param {keyof typeof profiles} profile - which statements to keep
 * @param {string} outDir - directory to write into
 * @param {string} destination - final location of these modules
 * @returns {Promise<void>}
 */
async function emit(compiled, profile, outDir, destination) {
    if (profile === 'debug') {
        await copyMatching(compiled, outDir, /\.js(?:\.map)?$/, destination);
        return;
    }

    const { rolldown } = await import('rolldown');
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const input = Object.fromEntries(
        Object.entries(manifest.exports)
            // Entries below `debug` select the debug profile of the same modules.
            .filter(([name]) => !/^\.\/debug(\/|$)/.test(name))
            .map(([name, target]) => [
                name === '.' ? 'index' : name.slice(2),
                join(compiled, target.default.slice('./dist/'.length)),
            ]),
    );
    const bundle = await rolldown({
        input,
        platform: 'neutral',
        external: [/^node:/],
        // Remove labels while they still exist, before tree shaking and minification.
        transform: { dropLabels: profiles[profile] },
        plugins: [
            {
                // Carry each compiled module's source map, so that the bundle maps to the sources.
                name: 'compiled-source-maps',
                async load(id) {
                    return { code: await readFile(id, 'utf8'), map: await readSourceMap(`${id}.map`) };
                },
            },
        ],
    });

    try {
        const { output } = await bundle.generate({
            dir: outDir,
            format: 'esm',
            minify: true,
            sourcemap: true,
            entryFileNames: '[name].js',
            chunkFileNames: 'chunks/[name]-[hash].js',
        });
        for (const item of output) {
            const path = join(outDir, item.fileName);
            await mkdir(dirname(path), { recursive: true });
            if (item.type === 'chunk') {
                await writeFile(path, item.code);
            } else if (item.fileName.endsWith('.map')) {
                // The bundler writes sources relative to `outDir`, which is not where the map will be.
                const map = JSON.parse(item.source);
                map.sources = map.sources.map((source) => resolve(dirname(path), source));
                await writeFile(path, JSON.stringify(relocateSourceMap(map, join(destination, item.fileName))));
            } else {
                await writeFile(path, item.source);
            }
        }
    } finally {
        await bundle.close();
    }
}

/**
 * Build the runtime.
 *
 * Without a profile, this builds the package: the `checked` profile at the top of
 * `outDir`, where the package's entry points are, with the `debug`
 * profile in a directory of its own. With a profile, only that profile is built,
 * at the top of `outDir`. Declarations are written at the top either way.
 *
 * @param {object} [options]
 * @param {keyof typeof profiles} [options.profile] - the single profile to build
 * @param {string} [options.outDir] - directory to replace with the build
 * @returns {Promise<void>}
 */
export async function build({ profile, outDir = join(root, 'dist') } = {}) {
    if (profile !== undefined && !Object.hasOwn(profiles, profile)) {
        throw new Error(`unknown runtime profile: ${profile}`);
    }
    outDir = resolve(outDir);
    const staging = await mkdtemp(join(root, '.runtime-build-'));

    try {
        const compiled = join(staging, 'compiled');
        await compile(compiled);

        // Build beside the destination first, so that it is never left half replaced.
        const pending = join(staging, 'out');
        const layout = profile === undefined ? PACKAGE_LAYOUT : { [profile]: '.' };
        for (const [name, directory] of Object.entries(layout)) {
            await emit(compiled, name, join(pending, directory), join(outDir, directory));
        }
        await copyMatching(compiled, pending, /\.d\.ts(?:\.map)?$/, outDir);

        await rm(outDir, { recursive: true, force: true });
        await cp(pending, outDir, { recursive: true });
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { values } = parseArgs({
        options: {
            profile: { type: 'string' },
            'out-dir': { type: 'string', default: join(root, 'dist') },
        },
    });
    await build({ profile: values.profile, outDir: values['out-dir'] });
}
