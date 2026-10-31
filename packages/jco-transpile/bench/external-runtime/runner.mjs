// All timing runs in this fresh process, after the parent has finished bundling.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { SourceTextModule } from 'node:vm';
import assert from 'node:assert/strict';
import { expectedResult, importsFor, workload } from './workloads.mjs';

const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const order = config.memoryMode
    ? [config.memoryMode]
    : config.processIndex % 2
      ? ['external', 'inline']
      : ['inline', 'external'];
const samples = Object.fromEntries(order.map((mode) => [mode, { parse: [], evaluate: [], instantiate: [], call: [] }]));
const prepared = {};
const coldNative = {};
for (const mode of order) {
    const artifact = config[mode];
    const code = await readFile(artifact.bundle, 'utf8');
    const modules = new Map();
    for (const name of Object.keys(artifact.wasm.files)) {
        modules.set(name, new WebAssembly.Module(await readFile(join(artifact.dir, name))));
    }
    // Core compilation and host import setup are outside cold native ESM timing.
    const imports = artifact.parts.map(importsFor);
    const start = performance.now();
    const binding = await import(pathToFileURL(artifact.bundle).href);
    const instantiate = () =>
        artifact.parts.map((id, i) =>
            binding[`create${i}`]((name) => {
                assert.ok(modules.has(name), `unexpected core module request ${name}`);
                return modules.get(name);
            }, imports[i]),
        );
    const instances = instantiate();
    coldNative[mode] = (performance.now() - start) * 1e6;
    const workloads = [];
    for (const [i, instance] of instances.entries()) {
        workloads.push(await workload(artifact.parts[i], instance));
    }
    prepared[mode] = { code, instantiate, workloads, artifact };
}
const verified = [...config.inline.parts];
if (config.verifyOnly) {
    await writeFile(config.output, JSON.stringify({ verified }));
    process.exit(0);
}
if (config.memoryMode) {
    const mode = config.memoryMode;
    // This process retains only the measured mode's stores. Both preparations are
    // warmup and do not change during the measured interval.
    for (let i = 0; i < 8; i++) {
        prepared[mode].instantiate();
    }
    globalThis.gc();
    const before = process.memoryUsage();
    globalThis.__retainedBenchmarkStores = Array.from({ length: 64 }, () => prepared[mode].instantiate());
    globalThis.gc();
    const after = process.memoryUsage();
    for (const stores of globalThis.__retainedBenchmarkStores) {
        for (const [i, instance] of stores.entries()) {
            await workload(prepared[mode].artifact.parts[i], instance);
        }
    }
    assert.equal(globalThis.__retainedBenchmarkStores.length, 64);
    const deltas = Object.fromEntries(
        ['heapUsed', 'external', 'arrayBuffers'].map((key) => [key, (after[key] - before[key]) / 64]),
    );
    await writeFile(
        config.output,
        JSON.stringify({ mode, stores: 64, deltas, valid: Object.values(deltas).every((n) => n >= 0) }),
    );
    process.exit(0);
}
let sink = 0;
const callable = prepared.inline.workloads.every((work) => work.call);
const asyncCalls = prepared.inline.workloads.some((work) => work.async);
async function runCalls(mode, calls) {
    const state = prepared[mode];
    let checksum = 0;
    const start = performance.now();
    if (asyncCalls) {
        for (let i = 0; i < calls; i++) {
            for (const work of state.workloads) {
                checksum += Number(await work.call(i));
            }
        }
    } else {
        for (let i = 0; i < calls; i++) {
            for (const work of state.workloads) {
                checksum += Number(work.call(i));
            }
        }
    }
    const elapsed = ((performance.now() - start) * 1e6) / calls;
    let expected = 0;
    for (let i = 0; i < calls; i++) {
        for (const id of state.artifact.parts) {
            expected += expectedResult(id, i);
        }
    }
    assert.equal(checksum, expected, 'timed checksum must match independent known answers');
    sink += checksum;
    return elapsed;
}
let calls = 16;
if (callable) {
    // Common warmup and calibration on both modes; sync workloads stay synchronous.
    for (const mode of order) {
        for (let i = 0; i < 3; i++) {
            await runCalls(mode, 1024);
        }
    }
    for (;;) {
        const times = [await runCalls('inline', calls), await runCalls('external', calls)];
        if (Math.min(...times) * calls >= 15e6 || calls >= 262144) {
            break;
        }
        calls *= 2;
    }
}
for (let sample = 0; sample < config.sampleCount; sample++) {
    for (const mode of sample % 2 ? order.toReversed() : order) {
        const state = prepared[mode];
        globalThis.gc();
        const unique = `${state.code}\n// fresh:${config.processIndex}:${sample}:${mode}`;
        let start = performance.now();
        const parsed = new SourceTextModule(unique);
        samples[mode].parse.push((performance.now() - start) * 1e6);
        assert.equal(parsed.status, 'unlinked');
        start = performance.now();
        await parsed.link((specifier) => {
            throw new Error('Unexpected dependency: ' + specifier);
        });
        await parsed.evaluate();
        samples[mode].evaluate.push((performance.now() - start) * 1e6);
        start = performance.now();
        const fresh = state.instantiate();
        samples[mode].instantiate.push((performance.now() - start) * 1e6);
        for (const [i, instance] of fresh.entries()) {
            await workload(state.artifact.parts[i], instance);
        }
        if (callable) {
            samples[mode].call.push(await runCalls(mode, calls));
        }
    }
}
assert.ok(Number.isFinite(sink));
await writeFile(
    config.output,
    JSON.stringify({
        processIndex: config.processIndex,
        sampleCount: config.sampleCount,
        order,
        verified,
        samples,
        callsPerSample: callable ? calls : 0,
        sink,
        coldNative,
        medians: Object.fromEntries(
            order.map((mode) => [
                mode,
                Object.fromEntries(
                    Object.entries(samples[mode])
                        .filter(([, v]) => v.length)
                        .map(([key, v]) => [key, median(v)]),
                ),
            ]),
        ),
        pairedRatios: Object.fromEntries(
            ['parse', 'evaluate', 'instantiate', ...(callable ? ['call'] : [])].map((key) => [
                key,
                median(samples.inline[key].map((v, i) => samples.external[key][i] / v)),
            ]),
        ),
    }),
);
process.exit(0);
