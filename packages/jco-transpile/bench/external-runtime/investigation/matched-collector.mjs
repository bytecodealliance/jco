import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { arch, cpus, platform } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { assertBenchmarkIdle } from '../../../scripts/assert-external-runtime-bench-idle.mjs';
import { componentPath, importControls, bundlers, resolutions } from '../cases.ts';
import { assertCompleteReports, expectedReportIds } from '../matrix.mjs';
import { memoryAccounting } from '../memory-accounting.mjs';
import { collectionSettings } from './collection-plan.mjs';
import { modes, validateArtifacts, validateCoverage } from './matched-protocol.mjs';
import { nodeWorker } from './node-worker.mjs';

const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
const workspace = fileURLToPath(new URL('../../../../../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digest = async (file) => hash(await fs.readFile(file));
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

export function collectionOptions(args) {
    const options = {};
    for (let i = 0; i < args.length; i++) {
        const key = args[i];
        assert.ok(!(key in options), 'Duplicate argument: ' + key);
        if (key === '--verify-only') {
            options[key] = true;
        } else {
            assert.ok(['--source', '--anchor', '--processes', '--output'].includes(key), 'Unknown argument: ' + key);
            assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), 'Missing value: ' + key);
            options[key] = args[++i];
        }
    }
    assert.ok(
        options['--source'] && options['--anchor'],
        'Complete matched inputs and an independent bundle anchor are required',
    );
    collectionSettings(Number(options['--processes']));
    return options;
}

export async function collectMatched(args) {
    const options = collectionOptions(args);
    const settings = collectionSettings(Number(options['--processes']));
    const sourceDir = await fs.realpath(resolve(options['--source']));
    const source = await read(join(sourceDir, 'manifest.json'));
    const anchorFile = resolve(options['--anchor']);
    const anchor = await read(anchorFile);
    assert.equal(await digest(join(sourceDir, 'manifest.json')), anchor.matrixManifestSha256);
    assert.equal(source.status, 'verified-inputs');
    assert.equal(source.timingCollected, false);
    assert.deepEqual(source.modes, modes);
    assert.equal(source.factoryRef, 'b5931a41f6222359628b451e647078ab2e04d536');
    const expected = expectedReportIds('full');
    assert.equal(source.graphs.length, expected.length);
    assertCompleteReports(expected, Object.fromEntries(source.graphs.map((g) => [g.id, g])));
    assert.equal(anchor.reports.length, expected.length);
    assertCompleteReports(expected, Object.fromEntries(anchor.reports.map((g) => [g.id, g])));
    const production = await read(source.productionManifest);
    assert.equal(await digest(source.productionManifest), source.productionManifestSha256);
    validateCoverage(source.coverage, production.settings.coverage);
    assert.ok(source.bindingSourceHashes, 'verified inputs must identify the selected runtime sources');
    assert.deepEqual(source.bindingSourceHashes, production.environment.bindingSourceHashes);
    assert.equal(production.controls.length, importControls.length * 2 * bundlers.length * resolutions.length);
    const controlRoot = dirname(source.productionManifest);
    const oldSources = await read(join(controlRoot, 'benchmark-source.json'));
    assert.equal(typeof oldSources['trace.mjs'], 'string');
    const outputRoot = resolve(options['--output'] ?? join(packageRoot, 'bench/output/external-runtime-matched'));
    for (const input of [sourceDir, controlRoot]) {
        assert.ok(outputRoot !== input && !outputRoot.startsWith(input + sep), 'Output must be outside input archives');
    }
    await fs.mkdir(outputRoot, { recursive: true });
    const output = await fs.mkdtemp(join(outputRoot, 'run-'));
    const save = (name, value) => fs.writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n');
    const deadline = new AbortController();
    const timer = setTimeout(
        () => deadline.abort(new Error('Matched matrix deadline exceeded')),
        settings.matrixTimeoutMs,
    );
    timer.unref();
    const status = async (phase, extra = {}) => {
        if (phase !== 'failed') {
            deadline.signal.throwIfAborted();
        }
        const value = {
            phase,
            at: new Date().toISOString(),
            output,
            sourceDir,
            processCount: settings.processCount,
            ...extra,
        };
        await save('progress.json', value);
        await fs.writeFile(join(outputRoot, 'latest.json'), JSON.stringify(value, null, 2) + '\n');
    };
    const runChild = (args_) =>
        nodeWorker(args_, { cwd: packageRoot, timeout: settings.childTimeoutMs, signal: deadline.signal }).done;
    const inputHashes = {};
    const auditInputs = async () => {
        assert.equal(await digest(join(sourceDir, 'manifest.json')), anchor.matrixManifestSha256);
        assert.equal(await digest(anchorFile), inputHashes.anchor ?? (await digest(anchorFile)));
        assert.equal(await digest(source.productionManifest), source.productionManifestSha256);
        const environment = production.environment;
        for (const [key, actual] of Object.entries({
            node: process.version,
            platform: platform(),
            arch: arch(),
            cpu: cpus()[0]?.model,
            debug: process.env.JCO_DEBUG ?? null,
        })) {
            assert.equal(environment[key], actual, key);
        }
        assert.equal(
            process.env.JCO_DEBUG ?? null,
            settings.debugEnvironment,
            'Primary comparison requires the default dynamic debug environment',
        );
        const require = createRequire(join(packageRoot, 'package.json'));
        for (const [name, version] of Object.entries(environment.versions)) {
            // Some packages export a wildcard that redirects package.json to
            // a nonexistent JavaScript subpath. Inspect the installed metadata.
            assert.equal((await read(join(packageRoot, 'node_modules', name, 'package.json'))).version, version, name);
        }
        for (const [file, expectedHash] of Object.entries(environment.shimArtifacts)) {
            assert.equal(
                await digest(join(dirname(require.resolve('@bytecodealliance/preview2-shim/instantiation')), file)),
                expectedHash,
                file,
            );
        }
        assert.equal(await digest(join(workspace, 'pnpm-lock.yaml')), environment.lockHash);
        for (const [file, expectedHash] of Object.entries(environment.mappingSources)) {
            assert.equal(
                await digest(join(workspace, 'crates/js-component-bindgen/src/intrinsics', file)),
                expectedHash,
                file,
            );
        }
        for (const [file, expectedHash] of Object.entries(environment.compilerArtifacts)) {
            assert.equal(await digest(join(packageRoot, 'vendor', file)), expectedHash, file);
        }
        for (const profile of ['factory', 'named']) {
            assert.equal(await digest(source.inputs[profile].binary), source.inputs[profile].sha256);
            for (const [file, expectedHash] of Object.entries(source.runtimes[profile].hashes)) {
                assert.equal(
                    await digest(join(source.inputs[profile].runtimePackage, file)),
                    expectedHash,
                    profile + '/' + file,
                );
            }
        }
        for (const graph of source.graphs) {
            assert.equal(graph.id, `${graph.bundler}--${graph.resolution}--${graph.scenario}`);
            validateArtifacts(graph.artifacts);
            const pinned = anchor.reports.find((g) => g.id === graph.id);
            for (const [id, expectedHash] of Object.entries(graph.artifacts.inline.fixtureDigests)) {
                assert.equal(await digest(componentPath(id)), expectedHash, id + '/actual fixture');
            }
            for (const mode of modes) {
                const artifact = graph.artifacts[mode],
                    key = graph.id + '/' + mode;
                const code = await fs.readFile(artifact.bundle);
                const sha256 = hash(code);
                assert.equal(sha256, pinned.artifacts[mode].sha256, key);
                inputHashes[key] = sha256;
                assert.deepEqual(artifact.js, {
                    raw: code.byteLength,
                    gzip: gzipSync(code, { level: 9 }).byteLength,
                    brotli: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength,
                });
                assert.deepEqual(artifact.js, pinned.artifacts[mode].js);
                assert.deepEqual(artifact.parts, pinned.components);
                assert.deepEqual(artifact.wasm, pinned.coreWasm);
                assert.deepEqual(artifact.fixtureDigests, pinned.fixtureDigests);
                for (const [file, expectedHash] of Object.entries(artifact.wasm.files)) {
                    assert.equal(await digest(join(artifact.dir, file)), expectedHash, key + '/' + file);
                }
            }
            if (['empty', 'noise'].includes(graph.scenario)) {
                assert.equal(
                    new Set(modes.map((mode) => inputHashes[graph.id + '/' + mode])).size,
                    1,
                    'identical-code control',
                );
            }
        }
    };
    try {
        await status('checking-inputs');
        await assertBenchmarkIdle();
        inputHashes.anchor = await digest(anchorFile);
        await auditInputs();
        const snapshot = join(output, 'source');
        await fs.mkdir(join(snapshot, 'investigation'), { recursive: true });
        const snapshots = [
            'investigation/matched-runner.mjs',
            'investigation/matched-protocol.mjs',
            'investigation/matched-report.mjs',
            'investigation/summarize.mjs',
            'investigation/collection-plan.mjs',
            'report.ts',
            'matrix.mjs',
            'workloads.mjs',
            'memory-accounting.mjs',
        ];
        const sourceHashes = {};
        for (const name of snapshots) {
            const bytes = await fs.readFile(new URL('../' + name, import.meta.url));
            sourceHashes[name] = hash(bytes);
            await fs.writeFile(join(snapshot, name), bytes, { flag: 'wx' });
        }
        await fs.writeFile(join(snapshot, 'trace.mjs'), oldSources['trace.mjs'], { flag: 'wx' });
        sourceHashes['trace.mjs'] = hash(oldSources['trace.mjs']);
        await fs.writeFile(join(snapshot, 'package.json'), '{"type":"module"}\n', { flag: 'wx' });
        await fs.symlink(join(packageRoot, 'node_modules'), join(snapshot, 'node_modules'), 'dir');
        const controllerSources = {};
        const controllerUrls = {
            collector: import.meta.url,
            entrypoint: new URL('../../../scripts/investigate-external-runtime.mjs', import.meta.url),
            lifecycle: new URL('./node-worker.mjs', import.meta.url),
            guard: new URL('../../../scripts/assert-external-runtime-bench-idle.mjs', import.meta.url),
            cases: new URL('../cases.ts', import.meta.url),
        };
        for (const [name, url] of Object.entries(controllerUrls)) {
            controllerSources[name] = await fs.readFile(new URL(url), 'utf8');
        }
        await save('controller-source.json', controllerSources);
        const math = await import(pathToFileURL(join(snapshot, 'investigation/summarize.mjs')).href);
        const validator = await import(pathToFileURL(join(snapshot, 'investigation/matched-report.mjs')).href);
        const flags = [
            '--expose-gc',
            '--experimental-vm-modules',
            ...(!('Suspending' in WebAssembly) ? ['--experimental-wasm-jspi'] : []),
        ];
        const workerEnvironment = {
            node: process.version,
            flags,
            debug: process.env.JCO_DEBUG ?? null,
            jspi: 'Suspending' in WebAssembly,
            memoryAccounting,
        };
        const controls = [];
        const expectedControls = ['rolldown', 'rollup']
            .flatMap((bundler) =>
                ['file', 'package'].flatMap((resolution) =>
                    importControls.flatMap((control) =>
                        [true, false].map((used) => `${bundler}/${resolution}/${control.id}/${used}`),
                    ),
                ),
            )
            .sort();
        const controlKey = (c) => `${c.bundler}/${c.resolution}/${c.operation}/${c.used}`;
        assert.deepEqual(
            production.controls.map(controlKey).sort(),
            expectedControls,
            'complete canonical import controls',
        );
        await status('import-controls');
        for (const [i, control] of production.controls.entries()) {
            const file = join(
                controlRoot,
                `controls-${control.bundler}-${control.resolution}`,
                `bundle-${control.operation}-${control.used}.mjs`,
            );
            assert.equal((await fs.stat(file)).size, control.bytes);
            const sha256 = await digest(file);
            if (control.used) {
                const target = join(output, `control-${i}.json`);
                await runChild([join(snapshot, 'trace.mjs'), pathToFileURL(file).href, target]);
                assert.deepEqual(await read(target), control.allocations, control.operation);
            } else {
                assert.ok(control.bytes < 100);
                assert.equal((await import(pathToFileURL(file).href)).answer, 42);
            }
            controls.push({ ...control, file, sha256, knownAnswer: 42 });
        }
        const execute = async (graph, suffix, processIndex, verifyOnly = false, memoryMode) => {
            const target = join(output, `${graph.id}--${suffix}.json`);
            const config = join(output, `${graph.id}--${suffix}-config.json`);
            await fs.writeFile(
                config,
                JSON.stringify({
                    artifacts: graph.artifacts,
                    output: target,
                    processIndex,
                    sampleCount: settings.sampleCount,
                    verifyOnly,
                    memoryMode,
                }),
                { flag: 'wx' },
            );
            try {
                await runChild([...flags, join(snapshot, 'investigation/matched-runner.mjs'), config]);
            } catch (error) {
                await fs.writeFile(target + '.stderr.log', error.stderr ?? '');
                await fs.writeFile(target + '.stdout.log', error.stdout ?? '');
                throw new Error(`Matched worker failed: ${target}; ${error.message.slice(0, 500)}`, { cause: error });
            }
            const value = await read(target);
            assert.deepEqual(value.environment, workerEnvironment);
            if (!memoryMode) {
                assert.deepEqual(value.verified, graph.artifacts.inline.parts);
            }
            return value;
        };
        await status('known-answers');
        for (const graph of source.graphs) {
            const checked = await execute(graph, 'verify', 0, true);
            assert.deepEqual(checked.modes, modes);
            assert.equal(checked.varyingInputs, 32);
        }
        const before = await assertBenchmarkIdle();
        const provenance = {
            schema: 1,
            sourceDir,
            sourceManifestSha256: anchor.matrixManifestSha256,
            anchorFile,
            anchorSha256: inputHashes.anchor,
            sourceHashes,
            controller: {
                node: process.version,
                flags: process.execArgv,
                nodeOptions: process.env.NODE_OPTIONS ?? null,
                cwd: process.cwd(),
            },
            controllerSourceHashes: Object.fromEntries(
                Object.entries(controllerSources).map(([key, text]) => [key, hash(text)]),
            ),
            inputHashes,
            controls,
            before,
            producerEnvironment: production.environment,
            workerEnvironment,
            memoryAccounting,
            policy: 'New serial four-mode observations of pinned complete bundles and actual core Wasm. Inline controls expose compiler differences. No baseline recording or unsafe transform.',
        };
        await save('protocol.json', { settings, provenance });
        if (options['--verify-only']) {
            await status('verified', { acceptedTimingCollected: false, reports: 68, controls: controls.length });
            console.log('Matched verification: ' + output);
            return output;
        }
        const runs = Object.fromEntries(source.graphs.map(({ id }) => [id, []]));
        let completed = 0;
        await status('timing', { completed, expected: 68 * settings.processCount });
        for (let processIndex = 0; processIndex < settings.processCount; processIndex++) {
            for (let i = 0; i < source.graphs.length; i++) {
                const graph = source.graphs[(i + settings.seed + processIndex) % source.graphs.length];
                const raw = await execute(graph, String(processIndex), processIndex);
                validator.validateMatchedMeasurement(raw, settings.sampleCount);
                runs[graph.id].push(raw);
                await status('timing', { completed: ++completed, expected: 68 * settings.processCount });
            }
        }
        const memory = {};
        await status('memory-diagnostics');
        for (const graph of source.graphs) {
            memory[graph.id] = {};
            for (const mode of modes) {
                memory[graph.id][mode] = await execute(graph, 'memory-' + mode, 0, false, mode);
            }
        }
        const reports = math.summarizeMatched(source.graphs, runs, settings.processCount, memory);
        const after = await assertBenchmarkIdle();
        await auditInputs();
        for (const [name, sha256] of Object.entries(sourceHashes)) {
            assert.equal(await digest(join(snapshot, name)), sha256);
        }
        for (const control of controls) {
            assert.equal(await digest(control.file), control.sha256);
        }
        for (const [name, url] of Object.entries(controllerUrls)) {
            assert.equal(await digest(new URL(url)), provenance.controllerSourceHashes[name]);
        }
        deadline.signal.throwIfAborted();
        const result = {
            schema: 1,
            complete: true,
            checkpointKey: hash(JSON.stringify({ settings, provenance })),
            expectedReports: expected,
            expectedControls: 360,
            settings,
            reports,
            controls,
            provenance: { ...provenance, after },
            parityAchieved: Object.values(reports).every(
                (report) =>
                    report.parityLosses['named-vs-inline'].size.length +
                        report.parityLosses['named-vs-inline'].performance.length ===
                    0,
            ),
        };
        await save('result.json', result);
        await fs.writeFile(join(output, 'summary.md'), math.matchedMarkdown(result), { flag: 'wx' });
        await status('complete', {
            checkpointKey: result.checkpointKey,
            reports: 68,
            parityAchieved: result.parityAchieved,
        });
        console.log('Matched collection: ' + output);
        return output;
    } catch (error) {
        await save('failure.json', { at: new Date().toISOString(), error: String(error), stack: error.stack });
        await status('failed', { error: String(error) });
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
