import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, test } from 'vitest';
import { optimize } from '../build.js';
import { bundlers } from '../cases.js';

const helpers = `
export function used(x) { return x + 1; }
export function unused() { throw new Error('UNUSED_INTRINSIC'); }
export function make() { return { used, unused }; }
`;
const shapes = {
    'named-import': `import { used } from './helpers.mjs';
        export function create() { return { use: used }; }`,
    'factory-property': `import { make } from './helpers.mjs';
        export function create() { const ns = make(); return { use: ns.used }; }`,
    'factory-bound': `import { make } from './helpers.mjs';
        export function create() { const ns = make(); return { use: ns.used.bind(ns) }; }`,
};

test.concurrent.each(bundlers)('%s: isolate the factory property boundary', async (bundler) => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-factory-shapes-'));
    try {
        await writeFile(join(dir, 'helpers.mjs'), helpers);
        const reports = [];
        for (const [shape, source] of Object.entries(shapes)) {
            const entry = join(dir, `${shape}.mjs`);
            await writeFile(entry, source);
            const built = await optimize(entry, bundler);
            const bundle = join(dir, `${shape}-bundled.mjs`);
            await writeFile(bundle, built.code);
            const { create } = await import(pathToFileURL(bundle).href);
            assert.equal(create().use(17), 18);
            assert.equal(create().use(99), 100);
            const retainsUnused = built.code.includes('UNUSED_INTRINSIC');
            if (shape === 'named-import') {
                assert.isFalse(retainsUnused, 'direct named imports must retain operation-level elimination');
            }
            // A future optimizer may eliminate factory properties too. Record
            // that improvement instead of requiring the factory to stay larger.
            reports.push({ shape, bytes: Buffer.byteLength(built.code), retainsUnused, code: built.code });
        }
        const versions = Object.fromEntries(
            await Promise.all(
                ['rolldown', 'rollup', 'oxc-minify'].map(async (name) => [
                    name,
                    JSON.parse(
                        await readFile(
                            new URL('../../../node_modules/' + name + '/package.json', import.meta.url),
                            'utf8',
                        ),
                    ).version,
                ]),
            ),
        );
        const output = resolve(
            process.env.JCO_EXTERNAL_RUNTIME_INVESTIGATION_OUTPUT ??
                'bench/output/external-runtime-investigation-named',
        );
        await mkdir(output, { recursive: true });
        const archive = await mkdtemp(join(output, `shapes-${bundler}-`));
        await writeFile(
            join(archive, 'result.json'),
            JSON.stringify(
                {
                    schema: 1,
                    node: process.version,
                    versions,
                    bundler,
                    scope: 'Isolated optimizer shape probe; no runtime rewrite, accepted timing or full-runtime causal claim.',
                    reports,
                },
                null,
                2,
            ) + '\n',
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
