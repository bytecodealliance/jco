import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assert, expect, test } from 'vitest';
import { measure } from './measure.js';
import { parityLosses, processInterval, regressionLosses } from './report.js';
import { expectedReportIds, portfolioFromArgs, scenarioIdsForPortfolio } from './matrix.mjs';
import { publishBaseline } from './recording.mjs';
import { workload } from './workloads.mjs';
const exec = promisify(execFile);

test.concurrent('full and smoke portfolios require their complete distinct matrices', () => {
    assert.equal(portfolioFromArgs([]), 'full');
    assert.equal(portfolioFromArgs(['--smoke', '--record']), 'smoke');
    assert.equal(expectedReportIds('full').length, 92);
    assert.equal(expectedReportIds('smoke').length, 32);
    assert.equal(new Set(expectedReportIds('full')).size, 92);
    assert.includeMembers(
        [...scenarioIdsForPortfolio('full')],
        ['lists', 'records', 'flavorful', 'resources', 'events', 'async', 'streams', 'futures', 'portfolio'],
    );
    assert.throws(() => portfolioFromArgs(['adder']), /without filters/);
    assert.throws(() => expectedReportIds('partial'), /Unknown/);
});

test.concurrent('checkpoint recording cannot overwrite an existing baseline', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-immutable-baseline-'));
    try {
        const file = join(dir, 'baseline.json');
        const original = { schema: 2, checkpointKey: 'original', reports: { raw: 42 } };
        await publishBaseline(file, original);
        const bytes = await readFile(file, 'utf8');
        await expect(publishBaseline(file, { ...original, reports: { raw: 1 } })).rejects.toMatchObject({
            code: 'EEXIST',
        });
        assert.equal(await readFile(file, 'utf8'), bytes);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent.each(['lists', 'records', 'flavorful', 'resources', 'events', 'async', 'streams', 'futures'])(
    'full workload rejects corrupt or missing exports: %s',
    async (id) => {
        const noOp = () => 0;
        await expect(
            workload(id, {
                test: new Proxy({}, { get: () => noOp }),
                api: { make: () => ({ [Symbol.dispose]() {} }) },
                'jco:test-components/future-lower-sync': { futurePassthrough: async () => 0 },
                allocatedBytes: noOp,
                run: noOp,
                drops: noOp,
                pollEmptySet: async () => 1,
                zeroLengthWrite: async () => 0,
            }),
        ).rejects.toThrow();
    },
);

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

test.concurrent.each(['lists', 'records'] as const)(
    'rejects %s corruption confined to timed payloads in both modes',
    async (id) => {
        const dir = await mkdtemp(join(tmpdir(), 'jco-full-payload-canary-'));
        try {
            const bundle = join(dir, 'stub.mjs');
            const body =
                id === 'lists'
                    ? 'allocatedBytes() { return 0; }, test: { listRoundtrip(value) { return value[255] <= 10 || value[255] === 17 ? value : new Uint8Array(256); } }'
                    : 'test: { roundtripRecord1(value) { return value.a === 42 ? value : { ...value, a: 0 }; }, tuple1(value) { return value; }, roundtripFlags2() { return { c: true, d: false, e: false }; } }';
            await writeFile(bundle, `export function create0() { return { ${body} }; }`);
            const artifact = { dir, bundle, parts: [id], wasm: { bytes: 0, files: {} } };
            await expect(measure({ inline: artifact, external: artifact })).rejects.toThrow(/checksum|expected/);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);
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

test.concurrent('relative timing gates detect external slowdowns independently of native-call speed', () => {
    const baseline = { inline: { call: 1000 }, external: { call: 1100 } };
    assert.deepEqual(
        regressionLosses({ inline: { call: 2000 }, external: { call: 2200 } }, baseline, 'performance'),
        [],
    );
    assert.isNotEmpty(regressionLosses({ inline: { call: 1000 }, external: { call: 3000 } }, baseline, 'performance'));
});

test.concurrent.each(['ci', 'filter', 'parity'] as const)('refuses protected baseline recording (%s)', async (mode) => {
    const script = fileURLToPath(new URL('../../scripts/bench-external-runtime.mjs', import.meta.url));
    await expect(
        exec(
            process.execPath,
            [script, '--record', ...(mode === 'filter' ? ['adder'] : mode === 'parity' ? ['--parity'] : [])],
            {
                env: { ...process.env, ...(mode === 'ci' ? { CI: '1' } : {}) },
            },
        ),
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

import browserCheck from './browser-check.mjs';
test.concurrent('browser known-answer checks reject scalar, nested and typed payload mismatches', () => {
    browserCheck.deepEqual(
        { values: [1n, undefined, new Uint8Array([17, 23])] },
        { values: [1n, undefined, new Uint8Array([17, 23])] },
    );
    assert.throws(() => browserCheck.equal(17, 23));
    assert.throws(() => browserCheck.deepEqual({ values: [1, 2] }, { values: [1, 3] }));
    assert.throws(() => browserCheck.deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])));
});
