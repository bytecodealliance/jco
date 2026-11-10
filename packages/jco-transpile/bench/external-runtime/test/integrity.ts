import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assert, expect, test } from 'vitest';
import { measure } from '../measure.js';
import { describeParityLosses, parityLosses, processInterval } from '../report.js';
import { expectedReportIds, portfolioFromArgs, scenarioIdsForPortfolio } from '../matrix.mjs';
import { workload } from '../workloads.mjs';
import { sourceHashes } from '../provenance.js';

const exec = promisify(execFile);

test('empty workload permits instance utilities but rejects guest exports', async () => {
    await workload('empty', { _util: { stop() {} } });
    await expect(workload('empty', { _util: {}, unexpected() {} })).rejects.toThrow();
});

test.concurrent('full and smoke portfolios require their complete distinct matrices', () => {
    assert.equal(portfolioFromArgs([]), 'full');
    assert.equal(portfolioFromArgs(['--parity']), 'full');
    assert.equal(portfolioFromArgs(['--smoke', '--parity']), 'smoke');
    assert.equal(portfolioFromArgs(['--smoke']), 'smoke');
    assert.equal(expectedReportIds('full').length, 34);
    assert.equal(expectedReportIds('smoke').length, 16);
    assert.equal(new Set(expectedReportIds('full')).size, 34);
    assert.includeMembers(
        [...scenarioIdsForPortfolio('full')],
        ['lists', 'records', 'flavorful', 'resources', 'events', 'async', 'streams', 'futures', 'portfolio'],
    );
    assert.throws(() => portfolioFromArgs(['adder']), /Unsupported benchmark option/);
    assert.throws(() => expectedReportIds('partial'), /Unknown/);
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

test.concurrent.each([2, 3])(
    'reanalysis preserves schema %s results and refuses to overwrite artifacts',
    async (schema) => {
        const dir = await mkdtemp(join(tmpdir(), 'jco-reanalysis-canary-'));
        try {
            const input = join(dir, 'result.json');
            const output = join(dir, 'analysis.json');
            const source = JSON.stringify({
                schema,
                complete: true,
                ...(schema === 2 ? { checkpointKey: 'canary' } : { inputFingerprint: 'canary' }),
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
            const script = fileURLToPath(new URL('../reanalyze.mjs', import.meta.url));
            await exec(process.execPath, [script, input, output]);
            const analysis = await readFile(output, 'utf8');
            assert.equal(JSON.parse(analysis).inputFingerprint, 'canary');
            assert.deepEqual(JSON.parse(analysis).reports['test--file--noise'].uncertainty.parse.ci95, [1, 2]);
            await expect(exec(process.execPath, [script, input, input])).rejects.toThrow(/distinct/);
            await expect(exec(process.execPath, [script, input, output])).rejects.toThrow(/EEXIST/);
            assert.equal(await readFile(input, 'utf8'), source);
            assert.equal(await readFile(output, 'utf8'), analysis);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);

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

test.concurrent('rejects missing/nonfinite metrics and reports parity losses', () => {
    assert.throws(() => parityLosses({ inline: {}, external: {} }));
    assert.throws(() => parityLosses({ inline: { parse: 1 }, external: {} }));
    assert.throws(() => parityLosses({ inline: { parse: 1 }, external: { parse: NaN } }));
    assert.deepEqual(parityLosses({ inline: { raw: 100 }, external: { raw: 1000 } }), ['raw']);
    assert.throws(() => processInterval([1, 1, 1, NaN, 1]));
    assert.deepEqual(processInterval([1, 1, 1, 1, 1]).ci95, [1, 1]);
});

test.concurrent('relative timing gates detect external slowdowns independently of native-call speed', () => {
    assert.deepEqual(parityLosses({ inline: { call: 1000 }, external: { call: 1100 } }), []);
    assert.deepEqual(parityLosses({ inline: { call: 2000 }, external: { call: 2200 } }), []);
    assert.deepEqual(parityLosses({ inline: { call: 1000 }, external: { call: 3000 } }), ['call']);
});

test.concurrent('parity diagnostics include every failing metric, budget, unit and margin', () => {
    const values = {
        inline: { raw: 100, call: 1000, gzip: 100 },
        external: { raw: 1000, call: 1800, gzip: 100 },
    };
    assert.deepEqual(parityLosses(values), ['call', 'raw']);
    assert.deepEqual(describeParityLosses(values), [
        'call: inline=1000.00 ns, external=1800.00 ns, budget=1500.00 ns (inline * 1.25 + 250 ns), excess=300.00 ns (20.00% over budget)',
        'raw: inline=100.00 bytes, external=1000.00 bytes, budget=361.00 bytes (inline * 1.05 + 256 bytes), excess=639.00 bytes (177.01% over budget)',
    ]);
});

test.concurrent('parity diagnostics accept the exact budget and preserve fractional overages', () => {
    const values = { inline: { raw: 100 }, external: { raw: 361 } };
    assert.deepEqual(describeParityLosses(values), []);
    assert.deepEqual(parityLosses(values), []);

    values.external.raw = 361.25;
    assert.deepEqual(parityLosses(values), ['raw']);
    assert.deepEqual(describeParityLosses(values), [
        'raw: inline=100.00 bytes, external=361.25 bytes, budget=361.00 bytes (inline * 1.05 + 256 bytes), excess=0.25 bytes (0.07% over budget)',
    ]);
});

test.concurrent.each([
    { name: 'full', args: [] },
    { name: 'smoke', args: ['--smoke'] },
    { name: 'parity alias', args: ['--parity'] },
])('rejects removed recording options for $name', async ({ args }) => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-invalid-benchmark-option-'));
    const script = fileURLToPath(new URL('../../../scripts/bench-external-runtime.mjs', import.meta.url));
    try {
        await expect(
            exec(process.execPath, [script, ...args, '--record'], {
                env: { ...process.env, JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT: join(dir, 'output') },
            }),
        ).rejects.toThrow(/Unsupported benchmark option/);
        assert.deepEqual(await readdir(dir), [], 'invalid arguments must not create run artifacts');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent.each([
    { portfolio: 'full', parityAchieved: true, childCode: 0 },
    { portfolio: 'smoke', parityAchieved: true, childCode: 0 },
    { portfolio: 'full', parityAchieved: false, childCode: 1 },
    { portfolio: 'smoke', parityAchieved: false, childCode: 0 },
])('CLI preserves $portfolio reports with parity=$parityAchieved', async (scenario) => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-benchmark-reports-'));
    const controller = new URL('../../../scripts/bench-external-runtime.mjs', import.meta.url).href;
    const matrix = new URL('../matrix.mjs', import.meta.url).href;
    try {
        // Isolate the simulated measurement process from other tests' child processes.
        await exec(process.execPath, [
            '--input-type=module',
            '--eval',
            `
            import assert from 'node:assert/strict';
            import childProcess from 'node:child_process';
            import { EventEmitter } from 'node:events';
            import { syncBuiltinESMExports } from 'node:module';
            import { readFile, writeFile } from 'node:fs/promises';
            import { join } from 'node:path';
            import { expectedReportIds } from ${JSON.stringify(matrix)};
            const { portfolio, parityAchieved, childCode } = ${JSON.stringify(scenario)};
            process.env.JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT = ${JSON.stringify(dir)};
            childProcess.spawn = (_command, _args, { env }) => {
                const child = new EventEmitter();
                const ids = expectedReportIds(portfolio);
                assert.equal(env.JCO_EXTERNAL_RUNTIME_BENCH_PORTFOLIO, portfolio);
                const result = {
                    schema: 3, complete: true, inputFingerprint: 'canary', parityAchieved,
                    controls: [], expectedControls: 0, expectedReports: ids,
                    settings: { portfolio, coverage: { mapped: [] }, processCount: 5, sampleCount: 15 },
                    reports: Object.fromEntries(ids.map(id => [id, {
                        size: { inline: { raw: 100, gzip: 80, brotli: 70 }, external: { raw: 100, gzip: 80, brotli: 70 } },
                        parityLosses: { size: [] }, uncertainty: {}, timingFindings: {},
                        memory: { inline: { valid: true }, external: { valid: true } },
                    }])),
                };
                writeFile(join(env.JCO_EXTERNAL_RUNTIME_BENCH_RUN, 'result.json'), JSON.stringify(result))
                    .then(() => child.emit('exit', childCode), error => child.emit('error', error));
                return child;
            };
            syncBuiltinESMExports();
            const { main } = await import(${JSON.stringify(controller)});
            assert.equal(await main(portfolio === 'smoke' ? ['--smoke'] : []), parityAchieved ? 0 : 1);
            const latest = JSON.parse(await readFile(join(process.env.JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT, 'latest.json')));
            assert.equal(latest.status, parityAchieved ? 'complete' : 'failed');
            const summary = JSON.parse(await readFile(join(latest.runDir, 'summary.json')));
            assert.equal(summary.parityAchieved, parityAchieved);
            assert.equal(summary.inputFingerprint, 'canary');
            assert.match(await readFile(join(latest.runDir, 'summary.md'), 'utf8'), /Input fingerprint: canary/);
            `,
        ]);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test.concurrent.each([
    { status: 'complete', report: true, expected: 'completed successfully' },
    { status: 'failed', report: true, expected: 'Benchmark failed' },
    { status: 'failed', report: false, expected: 'No completed measurement report' },
    { status: 'running', report: false, expected: 'did not finish' },
    { status: undefined, report: false, expected: 'No benchmark results were produced' },
])('publishes run summary for status=$status, report=$report', async ({ status, report, expected }) => {
    const dir = await mkdtemp(join(tmpdir(), 'jco-run-summary-'));
    const script = fileURLToPath(new URL('../../../../../script/bench-runtime.mjs', import.meta.url));
    const summaryPath = join(dir, 'github-summary.md');
    const reportMarkdown = '## Runtime comparison\n\n| Scenario | Raw bytes |\n| --- | ---: |\n| adder | 100 |\n';
    try {
        await writeFile(summaryPath, 'Existing summary\n\n');
        if (status) {
            await writeFile(
                join(dir, 'latest.json'),
                JSON.stringify({
                    status,
                    runDir: dir,
                    ...(status === 'failed' ? { error: 'Parity check failed' } : {}),
                }),
            );
        }
        if (report) {
            await writeFile(join(dir, 'summary.md'), reportMarkdown);
        }

        // Summary publication must work even when dependency installation failed.
        const env = { ...process.env, PATH: '', JCO_EXTERNAL_RUNTIME_BENCH_OUTPUT: dir };
        await exec(process.execPath, [script, '--summary'], {
            cwd: dir,
            env: { ...env, GITHUB_STEP_SUMMARY: summaryPath },
        });
        const summary = await readFile(summaryPath, 'utf8');
        assert.isTrue(summary.startsWith('Existing summary\n\n# Runtime bench'));
        assert.include(summary, expected);
        if (report) {
            assert.include(summary, reportMarkdown);
        }
        if (status === 'failed') {
            assert.include(summary, 'Parity check failed');
        }

        const local = await exec(process.execPath, [script, '--summary'], {
            cwd: dir,
            env: { ...env, GITHUB_STEP_SUMMARY: '' },
        });
        assert.equal(local.stdout, summary.slice('Existing summary\n\n'.length));
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
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
