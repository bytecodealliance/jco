// Only call execution is timed. Generation, bundling, core compilation, imports,
// store initialization and full output validation are outside measured intervals.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { importsFor, workload, expected } from './workloads.mjs';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
assert.equal(typeof WebAssembly.Suspending, 'function', 'The performance comparison requires JSPI');
const modes = ['inline', 'external'];
const order = config.processIndex % 2 ? modes.toReversed() : modes;
const prepared = {};
for (const mode of order) {
    const artifact = config.pair[mode];
    const modules = new Map();
    for (const name of Object.keys(artifact.wasm)) {
        modules.set(name, new WebAssembly.Module(await readFile(join(artifact.dir, name))));
    }
    const binding = await import(pathToFileURL(artifact.bundle).href);
    const imports = importsFor(config.component.id);
    const instantiate = () =>
        binding.instantiate((name) => {
            assert(modules.has(name), `Unexpected core module ${name}`);
            return modules.get(name);
        }, imports);
    const stores = [instantiate(), instantiate()];
    for (const store of stores) {
        const run = workload(config.component.id, store, binding._util);
        for (const seed of [0, 17, 255]) {
            assert.deepEqual(await run(seed), expected(config.component.id, seed));
        }
    }
    prepared[mode] = { stores, run: workload(config.component.id, stores[0], binding._util) };
}

async function batch(mode, calls, offset = 0) {
    const { run } = prepared[mode];
    const outputs = new Array(calls);
    const start = performance.now();
    if (config.component.async) {
        for (let i = 0; i < calls; i++) {
            outputs[i] = await run((offset + i) & 255);
        }
    } else {
        for (let i = 0; i < calls; i++) {
            outputs[i] = run((offset + i) & 255);
        }
    }
    const ns = (performance.now() - start) * 1e6;
    assert(Number.isFinite(ns) && ns > 0, 'Invalid timer observation');
    // Validate every result after stopping the clock, including warmup/calibration.
    for (const [i, output] of outputs.entries()) {
        assert.deepEqual(output, expected(config.component.id, (offset + i) & 255));
    }
    return ns / calls;
}

for (let i = 0; i < 4; i++) {
    for (const mode of i % 2 ? order.toReversed() : order) {
        await batch(mode, config.component.async ? 2 : 256);
    }
}
let calls = config.component.async ? 2 : 128;
for (;;) {
    const times = [];
    for (const mode of order) {
        times.push(await batch(mode, calls));
    }
    // A common batch size for both modes, targeting >=10 ms of real execution.
    if (Math.min(...times) * calls >= 10e6 || calls >= (config.component.async ? 128 : 8192)) {
        break;
    }
    calls *= 2;
}
const raw = { inline: [], external: [] };
for (let sample = 0; sample < config.samples; sample++) {
    for (const mode of sample % 2 ? order.toReversed() : order) {
        globalThis.gc();
        raw[mode].push(await batch(mode, calls, sample * calls));
    }
}
const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
assert.equal(raw.inline.length, config.samples);
assert.equal(raw.external.length, config.samples);
await writeFile(
    config.output,
    JSON.stringify(
        {
            processIndex: config.processIndex,
            callsPerSample: calls,
            raw,
            medians: Object.fromEntries(modes.map((mode) => [mode, median(raw[mode])])),
            pairedRatio: median(raw.inline.map((ns, i) => raw.external[i] / ns)),
            node: process.version,
            flags: process.execArgv,
        },
        null,
        2,
    ) + '\n',
    { flag: 'wx' },
);
