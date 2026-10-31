// Constructor instrumentation is isolated from every timing process.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const counts = {};
// Instrumentation wrappers themselves must not increment the Proxy counter.
const InstrumentationProxy = globalThis.Proxy;
for (const key of [
    'Map',
    'Proxy',
    'Symbol',
    'DataView',
    'ArrayBuffer',
    'Uint8Array',
    'Uint16Array',
    'Int32Array',
    'Float32Array',
    'BigInt64Array',
    'Float64Array',
    'TextEncoder',
    'TextDecoder',
]) {
    const original = globalThis[key];
    counts[key] = 0;
    globalThis[key] = new InstrumentationProxy(original, {
        apply(target, receiver, args) {
            counts[key]++;
            return Reflect.apply(target, receiver, args);
        },
        construct(target, args, receiver) {
            counts[key]++;
            return Reflect.construct(target, args, receiver);
        },
    });
}
const { answer } = await import(process.argv[2]);
assert.equal(answer(), 42);
await writeFile(process.argv[3], JSON.stringify(counts));
