import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { assert, test } from 'vitest';
import { buildPair, installRuntime, optimize } from './build.js';
import { bundlers, resolutions, scenarios, importControls } from './cases.js';
import { measure } from './measure.js';
import { sourceHashes } from './provenance.js';
import { defaultRuntimeUrl } from '../../test/transpilation.js';

for (const bundler of bundlers) {
    for (const resolution of resolutions) {
        test(`${bundler}/${resolution}: unused exports are removed and used exports execute`, async () => {
            const dir = await mkdtemp(join(tmpdir(), 'jco-runtime-exports-'));
            try {
                await installRuntime(dir);
                for (const control of importControls) {
                    const specifier =
                        resolution === 'file'
                            ? new URL(control.suffix + '.js', defaultRuntimeUrl).href
                            : '@bytecodealliance/jco-cm-runtime/' + control.suffix;
                    for (const used of [false, true]) {
                        const entry = join(dir, `entry-${control.id}-${used}.mjs`);
                        await writeFile(
                            entry,
                            `import { ${control.names.join(', ')} } from ${JSON.stringify(specifier)};\n` +
                                (used
                                    ? control.setup + ` export function answer() { return ${control.answer}; }`
                                    : 'export const answer = 42;'),
                        );
                        const { code } = await optimize(entry, bundler);
                        const bundle = join(dir, `bundle-${control.id}-${used}.mjs`);
                        await writeFile(bundle, code);
                        const binding = await import(pathToFileURL(bundle).href);
                        assert.equal(used ? binding.answer() : binding.answer, 42);
                        if (!used) {
                            assert.isBelow(Buffer.byteLength(code), 100);
                        } else {
                            const trace = join(dir, `allocations-${control.id}.json`);
                            await exec(process.execPath, [
                                fileURLToPath(new URL('./trace.mjs', import.meta.url)),
                                pathToFileURL(bundle).href,
                                trace,
                            ]);
                            const allocations = JSON.parse(await readFile(trace, 'utf8'));
                            const expected = Object.fromEntries(
                                Object.keys(allocations).map((key) => [
                                    key,
                                    (control.allocations as Record<string, number>)[key] ?? 0,
                                ]),
                            );
                            assert.deepEqual(allocations, expected, `${control.id} initializes only selected storage`);
                        }
                    }
                }
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });
        for (const scenario of scenarios) {
            test(`${bundler}/${resolution}/${scenario.id}: matching inputs and known answers`, async () => {
                const pair = await buildPair(scenario.components, bundler, resolution);
                try {
                    assert.deepEqual(pair.inline.wasm, pair.external.wasm);
                    assert.deepEqual(pair.inline.fixtureDigests, pair.external.fixtureDigests);
                    const checked = await measure(pair, true);
                    assert.deepEqual(checked.verified, [...scenario.components]);
                    if (scenario.id === 'empty' || scenario.id === 'noise') {
                        assert.equal(
                            await readFile(pair.inline.bundle, 'utf8'),
                            await readFile(pair.external.bundle, 'utf8'),
                        );
                    }
                } finally {
                    await pair.cleanup();
                }
            });
        }
    }
}

test('coverage names the runtime API actually being measured', async () => {
    const coverage = JSON.parse(await readFile(new URL('./coverage.json', import.meta.url), 'utf8'));
    const runtime = await import(new URL('runtime.js', defaultRuntimeUrl).href);
    assert.equal(coverage.apiVersion, runtime.CM_RUNTIME_API_VERSION);
    assert.include(coverage.mapped, 'Resource(ResourceTableGet)');
    assert.equal(new Set(coverage.mapped).size, coverage.mapped.length);
});

test('source provenance detects changes to either runtime and nested family mappings', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-runtime-provenance-'));
    try {
        await mkdir(join(dir, 'ext'));
        const root = pathToFileURL(dir + '/');
        for (const name of ['runtime.rs', 'inline.rs', 'ext.rs', 'ext/resource.rs']) {
            await writeFile(join(dir, name), name);
        }
        const original = await sourceHashes(root);
        assert.deepEqual(Object.keys(original), ['ext.rs', 'ext/resource.rs', 'inline.rs', 'runtime.rs']);
        for (const name of Object.keys(original)) {
            await writeFile(join(dir, name), name + ' changed');
            assert.notEqual((await sourceHashes(root))[name], original[name]);
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
