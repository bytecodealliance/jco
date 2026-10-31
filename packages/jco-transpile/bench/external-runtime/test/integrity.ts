import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assert, expect, test } from 'vitest';
import { measure } from '../measure.js';
import { parityLosses, processInterval, regressionLosses } from '../report.js';

const exec = promisify(execFile);

test.concurrent.each([0, 42])('rejects two equally wrong constant implementations (%s)', async (answer) => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-metrics-canary-'));
    try {
        const bundle = join(dir, 'stub.mjs');
        await writeFile(bundle, `export function create0() { return { add: { add: () => ${answer} } }; }`);
        const artifact = { dir, bundle, parts: ['adder'] as const, wasm: { bytes: 0, files: {} } };
        await expect(measure({ inline: artifact, external: artifact })).rejects.toThrow(/known answers|42|checksum/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent('rejects missing/nonfinite metrics and reports parity independently', () => {
    assert.throws(() => parityLosses({ inline: {}, external: {} }));
    assert.throws(() => parityLosses({ inline: { parse: 1 }, external: {} }));
    assert.throws(() => parityLosses({ inline: { parse: 1 }, external: { parse: NaN } }));
    assert.deepEqual(parityLosses({ inline: { raw: 100 }, external: { raw: 1000 } }), ['raw']);
    assert.deepEqual(
        regressionLosses(
            { inline: { raw: 100 }, external: { raw: 1000 } },
            { inline: { raw: 100 }, external: { raw: 1000 } },
            'size',
        ),
        [],
    );
    assert.isNotEmpty(
        regressionLosses(
            { inline: { raw: 2000 }, external: { raw: 2000 } },
            { inline: { raw: 1000 }, external: { raw: 1000 } },
            'size',
        ),
    );
    assert.throws(() => processInterval([1, 1, 1, NaN, 1]));
    assert.deepEqual(processInterval([1, 1, 1, 1, 1]).ci95, [1, 1]);
});

test.concurrent.each(['ci', 'filter'] as const)('refuses protected baseline recording (%s)', async (mode) => {
    const script = fileURLToPath(new URL('../../../scripts/bench-external-runtime.mjs', import.meta.url));
    await expect(
        exec(process.execPath, [script, '--record', ...(mode === 'filter' ? ['adder'] : [])], {
            env: { ...process.env, ...(mode === 'ci' ? { CI: '1' } : {}) },
        }),
    ).rejects.toThrow(/Recording is disabled|without filters/);
});

test.concurrent('rejects missing inner samples even when reported medians look valid', async () => {
    const { validateMeasurement, timingFinding } = await import('../report.js');
    assert.throws(() =>
        validateMeasurement(
            { medians: { inline: { parse: 1 }, external: { parse: 1 } }, pairedRatios: { parse: 1 } },
            15,
        ),
    );
    assert.throws(() =>
        validateMeasurement(
            {
                medians: { inline: { parse: 1 }, external: { parse: 1 } },
                pairedRatios: { parse: 1 },
                samples: { inline: { parse: [1] }, external: { parse: [1] } },
                coldNative: { inline: 1, external: 1 },
            },
            15,
        ),
    );
    assert.equal(timingFinding({ median: 0.8, range: [0.7, 0.9], ci95: [0.7, 0.9] }, 0.05), 'material improvement');
    assert.include(timingFinding({ median: 0.8, range: [0.7, 1.1], ci95: [0.7, 1.1] }, 0.05), 'inconclusive');
});

test.concurrent('requires every declared matrix report and rejects extras', async () => {
    const { assertCompleteReports } = await import('../matrix.mjs');
    assert.throws(() => assertCompleteReports(['a', 'b'], { a: {} }));
    assert.throws(() => assertCompleteReports(['a'], { a: {}, b: {} }));
    assert.throws(() => assertCompleteReports([], {}));
    assertCompleteReports(['a'], { a: {} });
});

test('benchmark entry points can be imported without running or instrumenting globals', async () => {
    const modules = [
        new URL('../runner.mjs', import.meta.url).href,
        new URL('../trace.mjs', import.meta.url).href,
        new URL('../../../scripts/bench-external-runtime.mjs', import.meta.url).href,
    ];
    await exec(process.execPath, [
        '--input-type=module',
        '--eval',
        `
        import assert from 'node:assert/strict';
        const originals = { Map, Proxy, Uint8Array };
        for (const url of ${JSON.stringify(modules)}) {
            const { main } = await import(url);
            assert.equal(typeof main, 'function');
        }
        for (const [key, original] of Object.entries(originals)) {
            assert.equal(globalThis[key], original);
        }
    `,
    ]);
});

test('runner main returns after verification without exiting its caller', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-runner-main-'));
    try {
        const bundle = join(dir, 'adder.mjs');
        await writeFile(bundle, 'export function create0() { return { add: { add: (a, b) => a + b } }; }');
        const artifact = { dir, bundle, parts: ['adder'], wasm: { bytes: 0, files: {} } };
        const output = join(dir, 'result.json');

        const { main } = await import('../runner.mjs');
        await main({ inline: artifact, external: artifact, verifyOnly: true, output });
        assert.deepEqual(JSON.parse(await readFile(output, 'utf8')).verified, ['adder']);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('trace main restores constructors after successful and failed probes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-trace-main-'));
    try {
        const good = join(dir, 'good.mjs');
        const bad = join(dir, 'bad.mjs');
        const output = join(dir, 'counts.json');
        await writeFile(good, 'export function answer() { return new Map([[1, 42]]).get(1); }');
        await writeFile(bad, 'export function answer() { return 0; }');

        await exec(process.execPath, [
            '--input-type=module',
            '--eval',
            `
            import assert from 'node:assert/strict';
            const { main } = await import(${JSON.stringify(new URL('../trace.mjs', import.meta.url).href)});
            const originals = { Map, Proxy, Uint8Array };
            const restored = () => {
                for (const [key, original] of Object.entries(originals)) {
                    assert.equal(globalThis[key], original);
                }
            };
            await main(${JSON.stringify(pathToFileURL(good).href)}, ${JSON.stringify(output)});
            restored();
            await assert.rejects(main(${JSON.stringify(pathToFileURL(bad).href)}, ${JSON.stringify(output)}));
            restored();
        `,
        ]);
        assert.isAtLeast(JSON.parse(await readFile(output, 'utf8')).Map, 1);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
