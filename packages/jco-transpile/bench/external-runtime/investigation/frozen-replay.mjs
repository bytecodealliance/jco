// Recollect complete frozen smoke matrices without rebuilding their producers,
// rewriting their bundles, replacing baselines or changing statistical gates.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { arch, cpus, platform } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { assertBenchmarkIdle } from '../../../scripts/assert-external-runtime-bench-idle.mjs';
import { assertCompleteReports, expectedReportIds } from '../matrix.mjs';
import { memoryAccounting } from '../memory-accounting.mjs';
import { nodeWorker } from './node-worker.mjs';

const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const digest = async (file) => hash(await fs.readFile(file));
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--verify-only') {
        options.verifyOnly = true;
    } else {
        assert(
            ['--source', '--controls-source', '--anchor', '--processes', '--output'].includes(key),
            'Unknown argument: ' + key,
        );
        assert(args[i + 1] && !args[i + 1].startsWith('--'), 'Missing value: ' + key);
        assert(!(key in options), 'Duplicate argument: ' + key);
        options[key] = args[++i];
    }
}
assert(options['--source'] && options['--anchor'], 'A complete frozen source and bundle-hash anchor are required');
const sourceDir = resolve(options['--source']);
const controlDir = resolve(options['--controls-source'] ?? sourceDir);
const processCount = Number(options['--processes']);
assert([5, 10].includes(processCount), 'Use five or ten complete process repetitions');
const source = await read(join(sourceDir, 'manifest.json'));
const original = await read(join(sourceDir, 'result.json'));
const controlSource = await read(join(controlDir, 'manifest.json'));
const controlOriginal = await read(join(controlDir, 'result.json'));
const sources = await read(join(sourceDir, 'benchmark-source.json'));
const controlSources = await read(join(controlDir, 'benchmark-source.json'));
const anchor = await read(resolve(options['--anchor']));
assert(
    anchor.bundleHashes && Object.keys(anchor.bundleHashes).length === 64,
    'The anchor must contain all 64 bundle hashes',
);
assert.equal(original.complete, true);
assert.equal(source.settings.processCount, processCount, 'Select the matching frozen five/ten-process source');
assert.equal(original.settings.sampleCount, source.settings.sampleCount);
assert(source.settings.sampleCount >= 15);
assert.deepEqual(source.expectedReports.toSorted(), expectedReportIds('smoke').toSorted());
assertCompleteReports(expectedReportIds('smoke'), original.reports);
assert.equal(source.graphs.length, 32);
assert.deepEqual(source.graphs.map((graph) => graph.id).sort(), expectedReportIds('smoke').sort());
for (const graph of source.graphs) {
    assert.equal(graph.id, `${graph.bundler}--${graph.resolution}--${graph.scenario}`);
}
assert.equal(controlOriginal.complete, true);
assert.equal(controlSource.controls.length, controlOriginal.expectedControls);
assert.deepEqual(controlSource.expectedReports.toSorted(), expectedReportIds('smoke').toSorted());
if (controlDir !== sourceDir) {
    for (const name of ['runner.mjs', 'workloads.mjs', 'measure.ts', 'report.ts']) {
        assert.equal(sources[name], controlSources[name], name + '/shared source');
    }
}
const oldEnvironment = (await read(join(source.graphs[0].pair.inline.dir, 'measurements-0.json'))).environment;
assert.equal(process.version, oldEnvironment.node);
assert.equal(process.env.JCO_DEBUG ?? null, oldEnvironment.debug);
for (const [key, actual] of Object.entries({ platform: platform(), arch: arch(), cpu: cpus()[0]?.model })) {
    assert.equal(source.environment[key], actual, key);
}
const require = createRequire(join(packageRoot, 'package.json'));
const shimDirectory = dirname(require.resolve('@bytecodealliance/preview2-shim/instantiation'));
for (const [file, expected] of Object.entries(source.environment.shimArtifacts)) {
    assert.equal(await digest(join(shimDirectory, file)), expected, file);
}
assert.equal(await digest(join(packageRoot, '../../pnpm-lock.yaml')), source.environment.lockHash);
const outputRoot = resolve(options['--output'] ?? join(packageRoot, 'bench/output/external-runtime-frozen-replay'));
for (const input of [sourceDir, controlDir]) {
    assert(outputRoot !== input && !outputRoot.startsWith(input + sep), 'Output must be outside original archives');
}
await fs.mkdir(outputRoot, { recursive: true });
const output = await fs.mkdtemp(join(outputRoot, 'run-'));
assert(Number.isFinite(source.settings.matrixTimeoutMs) && source.settings.matrixTimeoutMs >= 120_000);
const deadline = new AbortController();
const timer = setTimeout(
    () => deadline.abort(new Error('Frozen matrix deadline exceeded')),
    source.settings.matrixTimeoutMs,
);
timer.unref();
const runChild = async (arguments_) => {
    const task = nodeWorker(arguments_, {
        cwd: packageRoot,
        signal: deadline.signal,
    });
    return task.done;
};
const save = async (name, value) => fs.writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n');
const status = async (phase, extra = {}) => {
    if (phase !== 'failed') {
        deadline.signal.throwIfAborted();
    }
    const value = { phase, at: new Date().toISOString(), output, sourceDir, controlDir, processCount, ...extra };
    await save('progress.json', value);
    await fs.writeFile(join(outputRoot, 'latest.json'), JSON.stringify(value, null, 2) + '\n');
};
const inputHashes = {};
const auditInputs = async () => {
    for (const graph of source.graphs) {
        assert.deepEqual(graph.pair.inline.parts, graph.pair.external.parts);
        assert.deepEqual(graph.pair.inline.wasm, graph.pair.external.wasm);
        for (const mode of ['inline', 'external']) {
            const artifact = graph.pair[mode];
            const key = graph.id + '/' + mode;
            const code = await fs.readFile(artifact.bundle);
            assert.equal(hash(code), anchor.bundleHashes[key], key);
            assert.deepEqual(
                {
                    raw: code.length,
                    gzip: gzipSync(code, { level: 9 }).length,
                    brotli: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
                },
                artifact.js,
                key + '/size',
            );
            inputHashes[key] = hash(code);
            for (const [file, expected] of Object.entries(artifact.wasm.files)) {
                assert.equal(await digest(join(artifact.dir, file)), expected, key + '/' + file);
            }
            if (controlDir !== sourceDir) {
                const other = controlSource.graphs.find((value) => value.id === graph.id)?.pair[mode];
                assert(other, key + '/shared graph');
                assert.deepEqual(other.parts, artifact.parts);
                assert.deepEqual(other.wasm, artifact.wasm);
                assert.equal(await digest(other.bundle), anchor.bundleHashes[key], key + '/shared bundle');
                for (const [file, expected] of Object.entries(other.wasm.files)) {
                    assert.equal(await digest(join(other.dir, file)), expected, key + '/shared/' + file);
                }
            }
        }
    }
};
try {
    await status('checking-frozen-inputs');
    await assertBenchmarkIdle();
    await auditInputs();
    const snapshot = join(output, 'source');
    await fs.mkdir(snapshot);
    for (const [file, key] of Object.entries({
        'frozen-runtime-runner.mjs': 'runner.mjs',
        'workloads.mjs': 'workloads.mjs',
        'report.ts': 'report.ts',
        'frozen-runtime-trace.mjs': 'trace.mjs',
    })) {
        const text = key === 'trace.mjs' ? controlSources[key] : sources[key];
        assert.equal(typeof text, 'string', key);
        await fs.writeFile(join(snapshot, file), text, { flag: 'wx' });
    }
    await fs.writeFile(join(snapshot, 'package.json'), '{"type":"module"}\n', { flag: 'wx' });
    await fs.symlink(join(packageRoot, 'node_modules'), join(snapshot, 'node_modules'), 'dir');
    const report = await import(pathToFileURL(join(snapshot, 'report.ts')).href);
    for (const [id, value] of Object.entries(original.reports)) {
        for (const [axis, estimate] of Object.entries(value.uncertainty)) {
            assert.deepEqual(
                report.processInterval(value.raw.map((run) => run.pairedRatios[axis])),
                estimate,
                id + '/' + axis,
            );
        }
    }
    const controls = [];
    for (const [i, control] of controlSource.controls.entries()) {
        const file = join(
            controlDir,
            `controls-${control.bundler}-${control.resolution}`,
            `bundle-${control.operation}-${control.used}.mjs`,
        );
        assert.equal((await fs.stat(file)).size, control.bytes);
        const sha256 = await digest(file);
        if (control.used) {
            const target = join(output, `control-${i}.json`);
            await runChild([join(snapshot, 'frozen-runtime-trace.mjs'), pathToFileURL(file).href, target]);
            assert.deepEqual(await read(target), control.allocations, control.operation);
        } else {
            assert((await fs.stat(file)).size < 100);
            assert.equal((await import(pathToFileURL(file).href)).answer, 42);
        }
        controls.push({ ...control, sha256, replayKnownAnswer: 42 });
    }
    for (const control of source.controls) {
        const actual = controls.find((value) =>
            ['bundler', 'resolution', 'operation', 'used'].every((key) => value[key] === control[key]),
        );
        assert(actual, 'Missing original control: ' + control.operation);
        const file = join(
            sourceDir,
            `controls-${control.bundler}-${control.resolution}`,
            `bundle-${control.operation}-${control.used}.mjs`,
        );
        assert.equal(await digest(file), actual.sha256);
        assert.deepEqual(actual.allocations, control.allocations);
    }
    const execute = async (graph, suffix, processIndex, verifyOnly = false, memoryMode) => {
        const target = join(output, `${graph.id}--${suffix}.json`);
        const config = {
            inline: graph.pair.inline,
            external: graph.pair.external,
            output: target,
            verifyOnly,
            processIndex,
            sampleCount: source.settings.sampleCount,
            memoryMode,
        };
        const configFile = join(output, `${graph.id}--${suffix}-config.json`);
        await fs.writeFile(configFile, JSON.stringify(config), { flag: 'wx' });
        try {
            await runChild([...oldEnvironment.flags, join(snapshot, 'frozen-runtime-runner.mjs'), configFile]);
        } catch (error) {
            await fs.writeFile(target + '.stderr.log', error.stderr ?? '');
            await fs.writeFile(target + '.stdout.log', error.stdout ?? '');
            throw new Error(`Frozen worker failed: ${target}; ${error.message.slice(0, 500)}`, { cause: error });
        }
        const result = await read(target);
        assert.deepEqual(result.environment, oldEnvironment);
        if (!memoryMode) {
            assert.deepEqual(result.verified, [...graph.pair.inline.parts]);
        }
        return result;
    };
    for (const graph of source.graphs) {
        await execute(graph, 'verify', 0, true);
    }
    const before = await assertBenchmarkIdle();
    const controllerSources = {};
    for (const [name, url] of Object.entries({
        collector: import.meta.url,
        idleGuard: new URL('../../../scripts/assert-external-runtime-bench-idle.mjs', import.meta.url),
        matrixCatalog: new URL('../matrix.mjs', import.meta.url),
        memoryScope: new URL('../memory-accounting.mjs', import.meta.url),
        workerLifecycle: new URL('./node-worker.mjs', import.meta.url),
    })) {
        controllerSources[name] = await fs.readFile(new URL(url), 'utf8');
    }
    await save('controller-source.json', controllerSources);
    const provenance = {
        schema: 1,
        sourceDir,
        controlDir,
        originalCheckpoint: source.checkpointKey,
        controlsCheckpoint: controlSource.checkpointKey,
        collectorSha256: await digest(fileURLToPath(import.meta.url)),
        controllerSourceHashes: Object.fromEntries(
            Object.entries(controllerSources).map(([name, text]) => [name, hash(text)]),
        ),
        controller: { node: process.version, flags: process.execArgv, cwd: process.cwd() },
        originalManifestSha256: await digest(join(sourceDir, 'manifest.json')),
        anchorSha256: await digest(resolve(options['--anchor'])),
        sourceHashes: Object.fromEntries(
            ['runner.mjs', 'workloads.mjs', 'report.ts', 'measure.ts'].map((key) => [key, hash(sources[key])]),
        ),
        traceSourceSha256: hash(controlSources['trace.mjs']),
        workerCwd: packageRoot,
        workerFlags: oldEnvironment.flags,
        inputHashes,
        controls,
        before,
        memoryAccounting,
        policy: 'New clean samples of original saved bundles/core Wasm using exact archived worker/workload/report sources. Original artifacts, samples, baselines and paths unchanged. No unbundled provider graph is loaded.',
    };
    await save('provenance.json', provenance);
    if (options.verifyOnly) {
        await status('verified', { reports: 32, controls: controls.length, acceptedTimingCollected: false });
    } else {
        const runs = Object.fromEntries(source.graphs.map(({ id }) => [id, []]));
        let completed = 0;
        await status('timing', { completed, expected: 32 * processCount });
        const offset = source.settings.seed % source.graphs.length;
        for (let processIndex = 0; processIndex < processCount; processIndex++) {
            for (let i = 0; i < source.graphs.length; i++) {
                const graph = source.graphs[(i + offset + processIndex) % source.graphs.length];
                const raw = await execute(graph, String(processIndex), processIndex);
                report.validateMeasurement(raw, source.settings.sampleCount);
                runs[graph.id].push(raw);
                await status('timing', { completed: ++completed, expected: 32 * processCount });
            }
        }
        const reports = {};
        await status('memory-diagnostics', { completed, expected: completed });
        for (const graph of source.graphs) {
            const raw = runs[graph.id];
            const axes = Object.keys(raw[0].medians.inline);
            const performance = Object.fromEntries(
                ['inline', 'external'].map((mode) => [
                    mode,
                    Object.fromEntries(
                        axes.map((axis) => [axis, report.median(raw.map((run) => run.medians[mode][axis]))]),
                    ),
                ]),
            );
            const size = { inline: graph.pair.inline.js, external: graph.pair.external.js };
            reports[graph.id] = {
                size,
                performance,
                parityLosses: { size: report.parityLosses(size), performance: report.parityLosses(performance) },
                uncertainty: Object.fromEntries(
                    axes.map((axis) => [axis, report.processInterval(raw.map((run) => run.pairedRatios[axis]))]),
                ),
                coldNative: raw.map((run) => run.coldNative),
                raw,
                memory: {
                    inline: await execute(graph, 'memory-inline', 0, false, 'inline'),
                    external: await execute(graph, 'memory-external', 0, false, 'external'),
                },
            };
        }
        for (const graph of source.graphs) {
            const control = reports[`${graph.bundler}--${graph.resolution}--noise`].uncertainty;
            const current = reports[graph.id];
            current.timingFindings = Object.fromEntries(
                Object.entries(current.uncertainty).map(([axis, estimate]) => {
                    const bounds = control[axis]?.ci95 ?? [0, 2];
                    const noise = Math.max(Math.abs(bounds[0] - 1), Math.abs(bounds[1] - 1));
                    return [axis, { finding: report.timingFinding(estimate, noise), noise }];
                }),
            );
            await save(graph.id + '.json', current);
        }
        assertCompleteReports(expectedReportIds('smoke'), reports);
        const after = await assertBenchmarkIdle();
        await auditInputs();
        deadline.signal.throwIfAborted();
        const result = {
            schema: 2,
            complete: true,
            frozenReplay: true,
            checkpointKey: hash(JSON.stringify(provenance)),
            originalCheckpoint: source.checkpointKey,
            expectedReports: expectedReportIds('smoke').sort(),
            expectedControls: controls.length,
            controls,
            environment: {
                node: process.version,
                platform: platform(),
                arch: arch(),
                cpu: cpus()[0]?.model,
                controllerFlags: process.execArgv,
                debug: process.env.JCO_DEBUG ?? null,
                frozenProducer: source.environment,
            },
            settings: source.settings,
            reports,
            parityAchieved: Object.values(reports).every(
                (value) => value.parityLosses.size.length + value.parityLosses.performance.length === 0,
            ),
            provenance: { ...provenance, after },
        };
        await save('result.json', result);
        await status('complete', {
            checkpointKey: result.checkpointKey,
            reports: 32,
            controls: controls.length,
            parityAchieved: result.parityAchieved,
        });
    }
    console.log(`Frozen replay: ${output}`);
} catch (error) {
    await save('failure.json', { at: new Date().toISOString(), error: String(error), stack: error.stack });
    await status('failed', { error: String(error) });
    throw error;
} finally {
    clearTimeout(timer);
}
