import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { posix } from 'node:path';
import { rolldown } from 'rolldown';

const runtime = new URL('../../jco-cm-runtime/dist/', import.meta.url);
const destination = new URL('../../../crates/js-component-bindgen/runtime/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('../package.json', runtime), 'utf8'));
const sources = new Map();
for (const file of await readdir(runtime, { recursive: true })) {
    if (file.endsWith('.js')) {
        sources.set(
            `runtime/${file.replaceAll('\\', '/')}`,
            (await readFile(new URL(file, runtime), 'utf8')).replaceAll('\r\n', '\n'),
        );
    }
}

/** Bundle virtual runtime modules without embedding filesystem-specific paths. */
async function bundle(entry) {
    const build = await rolldown({
        input: 'runtime-entry',
        platform: 'neutral',
        external: (id) => id.startsWith('node:'),
        plugins: [
            {
                name: 'embedded-runtime',
                resolveId(id, importer) {
                    if (id === 'runtime-entry') {
                        return id;
                    }
                    const resolved = id.startsWith('.') ? posix.join(posix.dirname(importer), id) : id;
                    if (sources.has(resolved)) {
                        return { id: resolved, moduleSideEffects: false };
                    }
                },
                load(id) {
                    return id === 'runtime-entry' ? entry : sources.get(id);
                },
            },
        ],
    });
    try {
        const { output } = await build.generate({ format: 'esm', minify: false, codeSplitting: false });
        if (output.length !== 1 || output[0].type !== 'chunk') {
            throw new Error('Expected one runtime chunk');
        }
        return output[0];
    } finally {
        await build.close();
    }
}

const exports = [];
const statements = [];
for (const [subpath, conditions] of Object.entries(manifest.exports)) {
    if (subpath === '.') {
        continue;
    }
    const id = `runtime/${conditions.default.slice('./dist/'.length)}`;
    const chunk = await bundle(`export * from ${JSON.stringify(id)};`);
    for (const name of chunk.exports.toSorted()) {
        const alias = `runtimeExport${exports.length}`;
        exports.push(`${subpath.slice(2)}:${name}\t${alias}`);
        statements.push(`export { ${name} as ${alias} } from ${JSON.stringify(id)};`);
    }
}
const chunk = await bundle(statements.join('\n'));
for (const [file, contents] of [
    ['runtime-all.js', chunk.code],
    ['runtime-export-map.tsv', exports.join('\n') + '\n'],
]) {
    const target = new URL(file, destination);
    if (process.argv.includes('--check')) {
        if ((await readFile(target, 'utf8')) !== contents) {
            throw new Error(`Regenerate ${fileURLToPath(target)} with build:embedded-runtime`);
        }
    } else {
        await writeFile(target, contents);
    }
}
