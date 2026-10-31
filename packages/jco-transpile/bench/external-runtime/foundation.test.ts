import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { cpus, platform, arch } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assert, test } from 'vitest';
import { buildPair, installRuntime, optimize } from './build.js';
import { bundlers, resolutions, scenarios, importControls } from './cases.js';
import { measure, type Measurement } from './measure.js';
import {
    median,
    parityLosses,
    processInterval,
    regressionLosses,
    timingFinding,
    validateMeasurement,
    type Values,
} from './report.js';
import { assertCompleteReports } from './matrix.mjs';
import { sourceHashes } from './provenance.js';
import { defaultRuntimeUrl } from '../../test/transpilation.js';

const exec = promisify(execFile);
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const here = fileURLToPath(new URL('.', import.meta.url));
if (process.env.JCO_EXTERNAL_RUNTIME_BENCH_RECORD === '1' && process.env.CI) {
    throw new Error('Recording is disabled in CI');
}
const processCount = Number(process.env.JCO_EXTERNAL_RUNTIME_BENCH_PROCESSES ?? 5);
const sampleCount = Number(process.env.JCO_EXTERNAL_RUNTIME_BENCH_SAMPLES ?? 15);
if (![5, 10].includes(processCount) || !Number.isInteger(sampleCount) || sampleCount < 15) {
    throw new Error('Use five or ten processes and at least 15 paired samples');
}
// The whole-matrix deadline scales with declared work, separate from child
// timeouts and all statistical/size acceptance budgets.
const matrixTimeoutMs = Math.max(
    600_000,
    bundlers.length * resolutions.length * scenarios.length * 30_000 * (processCount / 5) * (sampleCount / 15),
);

// Serial by design: build every graph before starting ANY measured process.
test(
    'complete named-runtime smoke matrix',
    async () => {
        const output = resolve(process.env.JCO_EXTERNAL_RUNTIME_BENCH_RUN!);
        const coverage = JSON.parse(await readFile(join(here, 'coverage.json'), 'utf8'));
        const versions = Object.fromEntries(
            await Promise.all(
                ['rolldown', 'rollup', 'oxc-minify', 'typescript', '@bytecodealliance/preview2-shim'].map(
                    async (name) => [
                        name,
                        JSON.parse(
                            await readFile(
                                new URL('../../node_modules/' + name + '/package.json', import.meta.url),
                                'utf8',
                            ),
                        ).version,
                    ],
                ),
            ),
        );
        const sourceInputs = Object.fromEntries(
            await Promise.all(
                (await readdir(here))
                    .filter((name) => /\.(ts|mjs)$/.test(name))
                    .sort()
                    .map(async (name) => [name, await readFile(join(here, name), 'utf8')]),
            ),
        );
        sourceInputs['scripts/bench-external-runtime.mjs'] = await readFile(
            new URL('../../scripts/bench-external-runtime.mjs', import.meta.url),
            'utf8',
        );
        const implementation = hash(JSON.stringify(sourceInputs));
        await writeFile(join(output, 'benchmark-source.json'), JSON.stringify(sourceInputs, null, 2) + '\n');
        const compilerArtifacts: Record<string, string> = {};
        for (const name of (await readdir(new URL('../../vendor/', import.meta.url)))
            .filter((name) => name.startsWith('js-component-bindgen-component') && /\.(wasm|js)$/.test(name))
            .sort()) {
            compilerArtifacts[name] = hash(await readFile(new URL('../../vendor/' + name, import.meta.url)));
        }
        const runtimeArtifacts: Record<string, string> = {
            package: hash(await readFile(new URL('../package.json', defaultRuntimeUrl))),
        };
        const shimDirectory = dirname(
            createRequire(import.meta.url).resolve('@bytecodealliance/preview2-shim/instantiation'),
        );
        const shimArtifacts: Record<string, string> = {};
        for (const name of (await readdir(shimDirectory, { recursive: true }))
            .filter((name) => name.endsWith('.js'))
            .sort()) {
            shimArtifacts[name] = hash(await readFile(join(shimDirectory, name)));
        }
        for (const name of [
            'runtime.js',
            'index.js',
            ...(await readdir(new URL('intrinsics/', defaultRuntimeUrl)))
                .filter((name) => name.endsWith('.js'))
                .sort()
                .map((name) => 'intrinsics/' + name),
        ]) {
            runtimeArtifacts[name] = hash(await readFile(new URL(name, defaultRuntimeUrl)));
        }
        const mappingSources = Object.fromEntries(
            await Promise.all(
                [
                    'runtime.rs',
                    'runtime/core.rs',
                    'runtime/component.rs',
                    'runtime/waitable.rs',
                    'runtime/error_context.rs',
                    'runtime/async_task.rs',
                ].map(async (name) => [
                    name,
                    hash(
                        await readFile(
                            new URL('../../../../crates/js-component-bindgen/src/intrinsics/' + name, import.meta.url),
                        ),
                    ),
                ]),
            ),
        );
        const environment = {
            compilerArtifacts,
            runtimeArtifacts,
            shimArtifacts,
            node: process.version,
            rust: (await exec('rustc', ['--version'])).stdout.trim(),
            versions,
            platform: platform(),
            arch: arch(),
            cpu: cpus()[0]?.model,
            controllerFlags: process.execArgv,
            debug: process.env.JCO_DEBUG ?? null,
            lockHash: hash(await readFile(new URL('../../../../pnpm-lock.yaml', import.meta.url))),
            mappingSources,
            bindingSourceHashes: await sourceHashes(
                new URL('../../../../crates/js-component-bindgen/src/', import.meta.url),
            ),
        };
        const settings = {
            processCount,
            sampleCount,
            matrixTimeoutMs,
            seed: 20261021,
            gzip: 9,
            brotli: 11,
            strict: false,
            instantiation: 'sync',
            asyncMode: 'jspi',
            base64Cutoff: 0,
            debug: 'dynamic',
            minimumMaterialImprovement: 0.05,
            uncertainty: 'seeded percentile process-cluster bootstrap, 10000 resamples',
            comparison: 'same-revision inline/named',
            coverage,
        };
        const graphs = [];
        const controls = [];
        for (const bundler of bundlers) {
            for (const resolution of resolutions) {
                const controlDir = join(output, `controls-${bundler}-${resolution}`);
                await mkdir(controlDir, { recursive: true });
                await installRuntime(controlDir);
                for (const control of importControls) {
                    const groups = [control, ...('imports' in control ? control.imports : [])];
                    const imports = groups
                        .map((group) => {
                            const specifier =
                                resolution === 'file'
                                    ? new URL(group.suffix + '.js', defaultRuntimeUrl).href
                                    : '@bytecodealliance/jco-cm-runtime/' + group.suffix;
                            return `import { ${group.names.join(', ')} } from ${JSON.stringify(specifier)};`;
                        })
                        .join('\n');
                    for (const used of [false, true]) {
                        const entry = join(controlDir, `entry-${control.id}-${used}.mjs`);
                        await writeFile(
                            entry,
                            imports +
                                '\n' +
                                (used
                                    ? control.setup + ` export function answer() { return ${control.answer}; }`
                                    : 'export const answer = 42;'),
                        );
                        const result = await optimize(entry, bundler);
                        const bundle = join(controlDir, `bundle-${control.id}-${used}.mjs`);
                        await writeFile(bundle, result.code);
                        const binding = await import(pathToFileURL(bundle).href);
                        assert.equal(used ? binding.answer() : binding.answer, 42);
                        if (!used) {
                            assert.isBelow(Buffer.byteLength(result.code), 100);
                        }
                        let allocations;
                        if (used) {
                            const trace = join(controlDir, `allocations-${control.id}.json`);
                            await exec(process.execPath, [join(here, 'trace.mjs'), pathToFileURL(bundle).href, trace]);
                            allocations = JSON.parse(await readFile(trace, 'utf8'));
                            const expected = Object.fromEntries(
                                Object.keys(allocations).map((key) => [
                                    key,
                                    (control.allocations as Record<string, number>)[key] ?? 0,
                                ]),
                            );
                            assert.deepEqual(
                                allocations,
                                expected,
                                `${control.id} must initialize only selected storage`,
                            );
                        }
                        controls.push({
                            bundler,
                            resolution,
                            operation: control.id,
                            used,
                            bytes: Buffer.byteLength(result.code),
                            modules: result.modules,
                            allocations,
                        });
                    }
                }
                for (const scenario of scenarios) {
                    const pair = await buildPair(scenario.components, bundler, resolution, output);
                    if (scenario.id === 'strings') {
                        assert.isTrue(
                            pair.external.graph.contexts.some((line) => line.includes('_jcoInitializeUtf8Encoder()')),
                        );
                        assert.isTrue(
                            pair.external.graph.contexts.some((line) => line.includes('_jcoInitializeUtf8Decoder()')),
                        );
                    }
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
                    graphs.push({
                        id: `${bundler}--${resolution}--${scenario.id}`,
                        bundler,
                        resolution,
                        scenario: scenario.id,
                        pair,
                    });
                }
            }
        }
        const fixtureHashes = Object.fromEntries(
            graphs.flatMap(({ pair }) => Object.entries(pair.inline.fixtureDigests)),
        );
        const checkpointKey = hash(
            JSON.stringify({
                coverage,
                settings,
                implementation,
                versions,
                node: environment.node,
                lock: environment.lockHash,
                fixtureHashes,
                bindings: environment.bindingSourceHashes,
                compilerArtifacts,
                runtimeArtifacts,
                shimArtifacts,
            }),
        );
        await writeFile(
            join(output, 'manifest.json'),
            JSON.stringify(
                {
                    schema: 2,
                    status: 'built',
                    checkpointKey,
                    environment,
                    settings,
                    fixtureHashes,
                    expectedReports: graphs.map(({ id }) => id).sort(),
                    controls,
                    graphs,
                },
                null,
                2,
            ) + '\n',
        );
        const runs: Record<string, Measurement[]> = Object.fromEntries(graphs.map(({ id }) => [id, []]));
        // Deterministic rotated order gives each scenario different positions across repetitions.
        const offset = settings.seed % graphs.length;
        for (let processIndex = 0; processIndex < processCount; processIndex++) {
            for (let i = 0; i < graphs.length; i++) {
                const graph = graphs[(i + offset + processIndex) % graphs.length];
                runs[graph.id].push(await measure(graph.pair, false, processIndex, sampleCount));
            }
        }
        const reports: Record<string, { size: Values; performance: Values; [key: string]: unknown }> = {};
        for (const graph of graphs) {
            const raw = runs[graph.id];
            const axes = Object.keys(raw[0].medians.inline);
            for (const run of raw) {
                assert.deepEqual(run.verified, [...graph.pair.inline.parts]);
                assert.equal(Object.keys(run.medians.inline).sort().join(), axes.toSorted().join());
                validateMeasurement(run, sampleCount);
            }
            const performanceValues = Object.fromEntries(
                ['inline', 'external'].map((mode) => [
                    mode,
                    Object.fromEntries(
                        axes.map((axis) => [
                            axis,
                            median(raw.map((run) => run.medians[mode as 'inline' | 'external'][axis])),
                        ]),
                    ),
                ]),
            ) as unknown as Values;
            const size: Values = { inline: graph.pair.inline.js, external: graph.pair.external.js };
            reports[graph.id] = {
                size,
                performance: performanceValues,
                parityLosses: { size: parityLosses(size), performance: parityLosses(performanceValues) },
                uncertainty: Object.fromEntries(
                    axes.map((axis) => [axis, processInterval(raw.map((run) => run.pairedRatios[axis]))]),
                ),
                coldNative: raw.map((run) => run.coldNative),
                raw,
                memory: {
                    inline: await measure(graph.pair, false, 0, sampleCount, 'inline'),
                    external: await measure(graph.pair, false, 0, sampleCount, 'external'),
                },
            };
            await writeFile(join(output, `${graph.id}.json`), JSON.stringify(reports[graph.id], null, 2) + '\n');
        }
        for (const graph of graphs) {
            const estimates = reports[graph.id].uncertainty as Record<string, ReturnType<typeof processInterval>>;
            const control = reports[`${graph.bundler}--${graph.resolution}--noise`].uncertainty as Record<
                string,
                ReturnType<typeof processInterval>
            >;
            reports[graph.id].timingFindings = Object.fromEntries(
                Object.entries(estimates).map(([axis, estimate]) => {
                    const bounds = control[axis]?.ci95 ?? [0, 2];
                    const noise = Math.max(Math.abs(bounds[0] - 1), Math.abs(bounds[1] - 1));
                    return [axis, { finding: timingFinding(estimate, noise), noise }];
                }),
            );
            await writeFile(join(output, `${graph.id}.json`), JSON.stringify(reports[graph.id], null, 2) + '\n');
        }
        assert.equal(Object.keys(reports).length, bundlers.length * resolutions.length * scenarios.length);
        assert.equal(controls.length, bundlers.length * resolutions.length * importControls.length * 2);
        assertCompleteReports(
            graphs.map(({ id }) => id),
            reports,
        );
        const baselinePath = join(here, 'named-baselines', `${checkpointKey}.json`);
        const baselineFailures = [];
        if (
            process.env.JCO_EXTERNAL_RUNTIME_BENCH_RECORD !== '1' &&
            process.env.JCO_EXTERNAL_RUNTIME_BENCH_GATE !== 'parity'
        ) {
            const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
            assert.equal(baseline.checkpointKey, checkpointKey);
            for (const [id, report] of Object.entries(reports)) {
                for (const kind of ['size', 'performance'] as const) {
                    baselineFailures.push(
                        ...regressionLosses(report[kind], baseline.reports[id][kind], kind).map(
                            (failure) => `${id}: ${failure}`,
                        ),
                    );
                }
            }
        }
        const parityAchieved = Object.values(reports).every(
            (report) => parityLosses(report.size).length + parityLosses(report.performance).length === 0,
        );
        await writeFile(
            join(output, 'result.json'),
            JSON.stringify(
                {
                    schema: 2,
                    complete: true,
                    expectedReports: graphs.map(({ id }) => id).sort(),
                    expectedControls: bundlers.length * resolutions.length * importControls.length * 2,
                    checkpointKey,
                    baselinePath,
                    environment,
                    settings,
                    fixtureHashes,
                    controls,
                    reports,
                    parityAchieved,
                    baselineFailures,
                },
                null,
                2,
            ) + '\n',
        );
        assert.deepEqual(baselineFailures, []);
        if (process.env.JCO_EXTERNAL_RUNTIME_BENCH_GATE === 'parity') {
            assert.isTrue(parityAchieved, 'strict parity differs from observed baseline acceptance');
        }
    },
    matrixTimeoutMs,
);
