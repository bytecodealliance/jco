import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assert, expect, test } from 'vitest';
import { measure } from './measure.js';
import { parityLosses, processInterval, regressionLosses } from './report.js';
const exec = promisify(execFile);

test.concurrent('ten-process bootstrap does not force balanced index parity', () => {
    // Independent resampling of five ones and five twos must allow either
    // median. Alternating even/odd indices falsely collapsed this to [2, 2].
    const alternating = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
    const grouped = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2];
    assert.deepEqual(processInterval(alternating).ci95, [1, 2]);
    assert.deepEqual(processInterval(grouped).ci95, [1, 2]);
    assert.deepEqual(processInterval(alternating), processInterval(alternating));
});

test.concurrent('reanalysis preserves source results and refuses to overwrite artifacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-reanalysis-canary-'));
    try {
        const input = join(dir, 'result.json');
        const output = join(dir, 'analysis.json');
        const source = JSON.stringify({
            schema: 2,
            complete: true,
            checkpointKey: 'canary',
            expectedReports: ['test--file--noise'],
            settings: { processCount: 10 },
            parityAchieved: true,
            reports: {
                'test--file--noise': {
                    size: { inline: { raw: 100 }, external: { raw: 100 } },
                    performance: { inline: { parse: 100 }, external: { parse: 100 } },
                    raw: Array.from({ length: 10 }, (_, i) => ({ pairedRatios: { parse: i % 2 ? 2 : 1 } })),
                },
            },
        });
        await writeFile(input, source);
        const script = fileURLToPath(new URL('./reanalyze.mjs', import.meta.url));
        await exec(process.execPath, [script, input, output]);
        const analysis = await readFile(output, 'utf8');
        assert.deepEqual(JSON.parse(analysis).reports['test--file--noise'].uncertainty.parse.ci95, [1, 2]);
        await expect(exec(process.execPath, [script, input, input])).rejects.toThrow(/distinct/);
        await expect(exec(process.execPath, [script, input, output])).rejects.toThrow(/EEXIST/);
        assert.equal(await readFile(input, 'utf8'), source);
        assert.equal(await readFile(output, 'utf8'), analysis);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

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
test.concurrent('rejects string corruption confined to timed payloads in both modes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-string-metrics-canary-'));
    try {
        const bundle = join(dir, 'stub.mjs');
        await writeFile(
            bundle,
            `export function create0() {
            return { testImports() {}, roundtrip(value) {
                return value.startsWith('café 🚀 ') ? value + 'x' : value;
            } };
        }`,
        );
        const artifact = { dir, bundle, parts: ['strings'] as const, wasm: { bytes: 0, files: {} } };
        await expect(measure({ inline: artifact, external: artifact })).rejects.toThrow(/checksum/);
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
    const script = fileURLToPath(new URL('../../scripts/bench-external-runtime.mjs', import.meta.url));
    await expect(
        exec(process.execPath, [script, '--record', ...(mode === 'filter' ? ['adder'] : [])], {
            env: { ...process.env, ...(mode === 'ci' ? { CI: '1' } : {}) },
        }),
    ).rejects.toThrow(/Recording is disabled|without filters/);
});

test.concurrent('rejects missing inner samples even when reported medians look valid', async () => {
    const { validateMeasurement, timingFinding } = await import('./report.js');
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
    const { assertCompleteReports } = await import('./matrix.mjs');
    assert.throws(() => assertCompleteReports(['a', 'b'], { a: {} }));
    assert.throws(() => assertCompleteReports(['a'], { a: {}, b: {} }));
    assert.throws(() => assertCompleteReports([], {}));
    assertCompleteReports(['a'], { a: {} });
});
