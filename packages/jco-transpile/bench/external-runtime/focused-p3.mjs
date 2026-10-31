// A single complex P3 component, with no bundler/resolution matrix or runtime changes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { median, processInterval } from './report.ts';

const modes = ['inline', 'external'];
const protocol = { processes: 5, samples: 15, transactionsPerSample: 8, warmupTransactions: 16 };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourcePath = fileURLToPath(import.meta.url);
const write = (path, value) => fs.writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });

function source(values) {
    return new ReadableStream({
        start(controller) {
            for (const value of values) {
                controller.enqueue(value);
            }
            controller.close();
        },
    });
}

class ExampleResource {
    #id;
    constructor(id) {
        this.#id = id;
    }
    getId() {
        return this.#id;
    }
}

function expected(seed) {
    return [
        Uint32Array.from({ length: 16 }, (_, i) => seed + i),
        [
            { id: seed, idStr: `café 🚀 ${seed}` },
            { id: seed + 1, idStr: '中文' },
        ],
        [
            { tag: 'maybe-u32', val: seed },
            { tag: 'maybe-u32', val: undefined },
            { tag: 'str', val: `variant ${seed}` },
        ],
        [Uint8Array.from({ length: 16 }, (_, i) => (seed + i) & 255), new Uint8Array([0, 255])],
        Uint32Array.from([seed, seed + 1, seed + 2]),
        [
            [`nested ${seed}`, '☃'],
            ['second', '😀'],
        ],
        [`future ${seed}`, 'pending 中文', '🚀'],
        [
            { tag: 'ok', val: `ok ${seed}` },
            { tag: 'err', val: 'expected error' },
        ],
    ];
}

async function transaction(instance, seed) {
    const api = instance['jco:test-components/stream-lower-async'];
    return [
        await api.readStreamValuesU32(source(Array.from({ length: 16 }, (_, i) => seed + i))),
        await api.readStreamValuesRecord(
            source([
                { id: seed, idStr: `café 🚀 ${seed}` },
                { id: seed + 1, idStr: '中文' },
            ]),
        ),
        await api.readStreamValuesVariant(
            source([
                { tag: 'maybe-u32', val: seed },
                { tag: 'maybe-u32', val: null },
                { tag: 'str', val: `variant ${seed}` },
            ]),
        ),
        await api.readStreamValuesListU8(
            source([Uint8Array.from({ length: 16 }, (_, i) => (seed + i) & 255), new Uint8Array([0, 255])]),
        ),
        await api.readStreamValuesExampleResourceOwnAttr(
            source([new ExampleResource(seed), new ExampleResource(seed + 1), new ExampleResource(seed + 2)]),
        ),
        await api.readStreamValuesStreamString(source([source([`nested ${seed}`, '☃']), source(['second', '😀'])])),
        await api.readStreamValuesFutureString(
            source(
                [`future ${seed}`, 'pending 中文', '🚀'].map(
                    (value) => new Promise((resolve) => queueMicrotask(() => resolve(value))),
                ),
            ),
        ),
        await api.readStreamValuesResultString(
            source([
                { tag: 'ok', val: `ok ${seed}` },
                { tag: 'err', val: 'expected error' },
            ]),
        ),
    ];
}

async function worker(configPath) {
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    assert.equal(typeof WebAssembly.Suspending, 'function', 'P3 requires JSPI');
    const order = config.processIndex % 2 ? modes.toReversed() : modes;
    const prepared = {},
        coldNative = {};
    for (const mode of order) {
        const artifact = config.pair[mode];
        const code = await fs.readFile(artifact.bundle, 'utf8');
        const modules = new Map();
        for (const name of Object.keys(artifact.wasm.files)) {
            modules.set(name, new WebAssembly.Module(await fs.readFile(join(artifact.dir, name))));
        }
        const imports = { ...new WASIShim().getImportObject(), 'jco:test-components/resources': { ExampleResource } };
        const start = performance.now();
        const binding = await import(pathToFileURL(artifact.bundle).href);
        const instantiate = () =>
            binding.create0((name) => {
                assert(modules.has(name));
                return modules.get(name);
            }, imports);
        const instance = instantiate();
        coldNative[mode] = (performance.now() - start) * 1e6;
        const second = instantiate();
        for (const store of [instance, second]) {
            for (const seed of [0, 17, 255]) {
                assert.deepEqual(await transaction(store, seed), expected(seed));
            }
        }
        prepared[mode] = { code, instantiate, instance, second };
    }
    if (config.verifyOnly) {
        await write(config.output, {
            verified: true,
            storesPerMode: 2,
            seeds: [0, 17, 255],
            operationsPerTransaction: 8,
        });
        return;
    }
    for (let i = 0; i < protocol.warmupTransactions; i++) {
        for (const mode of i % 2 ? order.toReversed() : order) {
            assert.deepEqual(await transaction(prepared[mode].instance, i), expected(i));
        }
    }
    const raw = Object.fromEntries(
        modes.map((mode) => [mode, { parse: [], evaluate: [], instantiate: [], transaction: [] }]),
    );
    for (let sample = 0; sample < protocol.samples; sample++) {
        for (const mode of sample % 2 ? order.toReversed() : order) {
            const state = prepared[mode];
            globalThis.gc();
            let start = performance.now();
            const parsed = new vm.SourceTextModule(
                `${state.code}\n// focused:${config.processIndex}:${sample}:${mode}`,
            );
            raw[mode].parse.push((performance.now() - start) * 1e6);
            start = performance.now();
            await parsed.link((specifier) => {
                throw new Error('Unexpected dependency: ' + specifier);
            });
            await parsed.evaluate();
            raw[mode].evaluate.push((performance.now() - start) * 1e6);
            start = performance.now();
            const fresh = state.instantiate();
            raw[mode].instantiate.push((performance.now() - start) * 1e6);
            assert.deepEqual(await transaction(fresh, sample), expected(sample));
            const outputs = [];
            start = performance.now();
            for (let i = 0; i < protocol.transactionsPerSample; i++) {
                outputs.push(await transaction(state.instance, (sample * protocol.transactionsPerSample + i) & 255));
            }
            raw[mode].transaction.push(((performance.now() - start) * 1e6) / protocol.transactionsPerSample);
            // Validate every output, outside the measured interval.
            for (const [i, output] of outputs.entries()) {
                assert.deepEqual(output, expected((sample * protocol.transactionsPerSample + i) & 255));
            }
        }
    }
    for (const mode of modes) {
        for (const values of Object.values(raw[mode])) {
            assert.equal(values.length, protocol.samples);
            assert(values.every((value) => Number.isFinite(value) && value > 0));
        }
    }
    await write(config.output, {
        processIndex: config.processIndex,
        order,
        raw,
        coldNative,
        medians: Object.fromEntries(
            modes.map((mode) => [
                mode,
                Object.fromEntries(Object.entries(raw[mode]).map(([axis, values]) => [axis, median(values)])),
            ]),
        ),
        pairedRatios: Object.fromEntries(
            Object.keys(raw.inline).map((axis) => [
                axis,
                median(raw.inline[axis].map((value, i) => raw.external[axis][i] / value)),
            ]),
        ),
        environment: {
            node: process.version,
            flags: process.execArgv,
            jspi: true,
            debug: process.env.JCO_DEBUG ?? null,
        },
    });
}

async function main(manifestPath, outputPath) {
    assert(manifestPath && outputPath, 'Usage: node focused-p3.mjs MANIFEST_JSON NEW_OUTPUT_DIRECTORY');
    const output = resolve(outputPath);
    await fs.mkdir(output, { recursive: false });
    const manifestBytes = await fs.readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes);
    const graph = manifest.graphs.find((graph) => graph.id === 'rolldown--package--stream-host-payload');
    assert(graph, 'The full Rust stream-lower component bundle pair is required');
    assert.deepEqual(graph.pair.inline.wasm, graph.pair.external.wasm, 'Core Wasm must be identical');
    const inputs = {};
    async function verifyInputs() {
        for (const mode of modes) {
            const artifact = graph.pair[mode];
            assert.deepEqual(artifact.parts, ['stream-host-payload']);
            assert.deepEqual(artifact.builtins, []);
            const bytes = await fs.readFile(artifact.bundle);
            const actual = {
                raw: bytes.length,
                gzip: gzipSync(bytes, { level: 9 }).length,
                brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
            };
            assert.deepEqual(actual, artifact.js);
            if (inputs[artifact.bundle]) {
                assert.equal(digest(bytes), inputs[artifact.bundle]);
            }
            inputs[artifact.bundle] = digest(bytes);
            for (const [name, hash] of Object.entries(artifact.wasm.files)) {
                const path = join(artifact.dir, name);
                assert.equal(digest(await fs.readFile(path)), hash);
                inputs[path] = hash;
            }
        }
    }
    await verifyInputs();
    const exec = promisify(execFile);
    const run = async (index, verifyOnly = false) => {
        const config = join(output, verifyOnly ? 'preflight-config.json' : `config-${index}.json`);
        const resultPath = join(output, verifyOnly ? 'preflight.json' : `raw-${index}.json`);
        await write(config, { pair: graph.pair, processIndex: index, verifyOnly, output: resultPath });
        console.log(
            `${new Date().toISOString()} ${verifyOnly ? 'correctness preflight' : `paired process ${index + 1}/${protocol.processes}`}`,
        );
        try {
            const result = await exec(
                process.execPath,
                [
                    '--expose-gc',
                    '--experimental-vm-modules',
                    ...(!('Suspending' in WebAssembly) ? ['--experimental-wasm-jspi'] : []),
                    sourcePath,
                    '--worker',
                    config,
                ],
                { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
            );
            await write(join(output, verifyOnly ? 'preflight-child.json' : `child-${index}.json`), result);
        } catch (error) {
            await write(join(output, 'failure.json'), {
                message: error.message,
                stdout: error.stdout,
                stderr: error.stderr,
            });
            throw error;
        }
        return JSON.parse(await fs.readFile(resultPath, 'utf8'));
    };
    await run(0, true);
    const processes = [];
    for (let i = 0; i < protocol.processes; i++) {
        processes.push(await run(i));
    }
    await verifyInputs();
    const axes = Object.keys(processes[0].pairedRatios);
    const summary = Object.fromEntries(
        axes.map((axis) => [
            axis,
            {
                inlineNs: median(processes.map((process) => process.medians.inline[axis])),
                externalNs: median(processes.map((process) => process.medians.external[axis])),
                externalOverInline: processInterval(processes.map((process) => process.pairedRatios[axis])),
            },
        ]),
    );
    const result = {
        schema: 1,
        complete: true,
        at: new Date().toISOString(),
        protocol,
        component: 'crates/test-components/src/bin/stream_lower.rs',
        fixture: 'packages/jco-transpile/test/fixtures/generated/rust-test-components/stream-lower.wasm',
        workload:
            'Eight sequential async guest calls: 16 u32 payloads, Unicode records, option-bearing variants, byte lists, owned resource method calls, nested string streams, streams of pending string futures, and ok/err results. Full outputs checked outside timing.',
        timing: 'Nanoseconds; warm transaction includes input construction, host ReadableStream/Promise handling, guest ABI and guest execution. Startup excludes core Wasm compilation and host-import setup. Cold native import plus first instantiation is recorded per process. No isolated intrinsic or constant-memory claim.',
        scope: 'One Rolldown minified package-resolution bundle pair; no optimization or runtime changes. Source/component bytes are reused from the completed full-stack build.',
        source: {
            manifest: resolve(manifestPath),
            manifestSha256: digest(manifestBytes),
            checkpoint: manifest.checkpointKey,
            scriptSha256: digest(await fs.readFile(sourcePath)),
            environment: manifest.environment,
        },
        inputs,
        sizes: Object.fromEntries(modes.map((mode) => [mode, graph.pair[mode].js])),
        wasmBytes: graph.pair.inline.wasm.bytes,
        summary,
        processes,
    };
    await write(join(output, 'result.json'), result);
    console.log(JSON.stringify({ complete: true, sizes: result.sizes, summary }, null, 2));
}

if (process.argv[2] === '--worker') {
    await worker(process.argv[3]);
} else {
    await main(process.argv[2], process.argv[3]);
}
