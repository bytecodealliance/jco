// Fresh-process four-mode worker. Build, instrumentation and browser work must
// all be terminal before accepted timing begins.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { SourceTextModule } from 'node:vm';
import { expectedResult, importsFor, workload } from '../workloads.mjs';
import { memoryAccounting } from '../memory-accounting.mjs';
import { comparisons, modes, sampleOrder, validateArtifacts } from './matched-protocol.mjs';

const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
validateArtifacts(config.artifacts);
assert.ok(config.verifyOnly || config.sampleCount >= 15, 'at least fifteen paired samples are required');
assert.ok(!config.memoryMode || modes.includes(config.memoryMode));
const order = config.memoryMode ? [config.memoryMode] : sampleOrder(config.processIndex);
const environment = {
    node: process.version,
    flags: process.execArgv,
    debug: process.env.JCO_DEBUG ?? null,
    jspi: 'Suspending' in WebAssembly,
    memoryAccounting,
};
const prepared = {},
    coldNative = {};
const samples = Object.fromEntries(order.map((mode) => [mode, { parse: [], evaluate: [], instantiate: [], call: [] }]));
for (const mode of order) {
    const artifact = config.artifacts[mode];
    const code = await readFile(artifact.bundle, 'utf8');
    const modules = new Map();
    for (const name of Object.keys(artifact.wasm.files)) {
        modules.set(name, new WebAssembly.Module(await readFile(join(artifact.dir, name))));
    }
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
        const work = await workload(artifact.parts[i], instance);
        for (let n = 0; work.call && n < 32; n++) {
            assert.equal(
                Number(await work.call(n)),
                expectedResult(artifact.parts[i], n),
                `${mode}: varying known answers`,
            );
        }
        workloads.push(work);
    }
    prepared[mode] = {
        code,
        instantiate,
        workloads,
        artifact,
        exports: instances.map((instance) => Object.keys(instance).sort()),
    };
}
for (const mode of order) {
    assert.deepEqual(
        prepared[mode].exports,
        prepared[order[0]].exports,
        'component export names must match across modes',
    );
}
const verified = [...config.artifacts.inline.parts];
if (config.verifyOnly) {
    await writeFile(config.output, JSON.stringify({ verified, modes, environment, varyingInputs: 32 }));
    process.exit(0);
}
if (config.memoryMode) {
    const mode = config.memoryMode;
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
        JSON.stringify({ mode, stores: 64, deltas, valid: Object.values(deltas).every((n) => n >= 0), environment }),
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
    for (let warm = 0; warm < 3; warm++) {
        for (const mode of sampleOrder(config.processIndex, warm)) {
            await runCalls(mode, 1024);
        }
    }
    for (let calibration = 0; ; calibration++) {
        const times = [];
        for (const mode of sampleOrder(config.processIndex, calibration)) {
            times.push(await runCalls(mode, calls));
        }
        if (Math.min(...times) * calls >= 15e6 || calls >= 262144) {
            break;
        }
        calls *= 2;
    }
}
const sampleOrders = [];
for (let sample = 0; sample < config.sampleCount; sample++) {
    const selected = sampleOrder(config.processIndex, sample);
    sampleOrders.push(selected);
    for (const mode of selected) {
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
const axes = ['parse', 'evaluate', 'instantiate', ...(callable ? ['call'] : [])];
const pairedRatios = Object.fromEntries(
    Object.entries(comparisons).map(([comparison, [base, candidate]]) => [
        comparison,
        Object.fromEntries(
            axes.map((axis) => [
                axis,
                median(samples[base][axis].map((value, i) => samples[candidate][axis][i] / value)),
            ]),
        ),
    ]),
);
// Report the change in external/inline overhead alongside the direct ratio;
// compiler differences remain visible in the separate inline/old-inline pair.
pairedRatios['normalized-overhead'] = Object.fromEntries(
    axes.map((axis) => [
        axis,
        median(
            samples.inline[axis].map(
                (value, i) =>
                    samples.named[axis][i] / value / (samples.factory[axis][i] / samples['old-inline'][axis][i]),
            ),
        ),
    ]),
);
await writeFile(
    config.output,
    JSON.stringify({
        processIndex: config.processIndex,
        sampleCount: config.sampleCount,
        environment,
        order,
        sampleOrders,
        verified,
        samples,
        callsPerSample: callable ? calls : 0,
        sink,
        coldNative,
        medians: Object.fromEntries(
            modes.map((mode) => [mode, Object.fromEntries(axes.map((axis) => [axis, median(samples[mode][axis])]))]),
        ),
        pairedRatios,
    }),
);
process.exit(0);
