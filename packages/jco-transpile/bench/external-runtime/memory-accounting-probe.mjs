// Diagnostic counterexample to blanket Wasm exclusions. Run separately from
// timing with: node --expose-gc bench/external-runtime/memory-accounting-probe.mjs
if (typeof globalThis.gc !== 'function') {
    throw new Error('Run with --expose-gc');
}
globalThis.gc();
const before = process.memoryUsage();
const pages = 256;
globalThis.jcoMemoryAccountingProbe = new WebAssembly.Memory({ initial: pages });
globalThis.gc();
const afterCreate = process.memoryUsage();
globalThis.jcoMemoryAccountingProbeBuffer = globalThis.jcoMemoryAccountingProbe.buffer;
globalThis.gc();
const afterBuffer = process.memoryUsage();
const deltas = (after) =>
    Object.fromEntries(['heapUsed', 'external', 'arrayBuffers', 'rss'].map((key) => [key, after[key] - before[key]]));
console.log(
    JSON.stringify(
        {
            node: process.version,
            pages,
            linearBytes: pages * 65536,
            before,
            afterCreate,
            afterBuffer,
            createDeltas: deltas(afterCreate),
            bufferDeltas: deltas(afterBuffer),
            held: globalThis.jcoMemoryAccountingProbeBuffer.byteLength === pages * 65536,
        },
        null,
        2,
    ),
);
