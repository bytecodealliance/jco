// Constructor instrumentation is isolated from every timing process.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const counts = {};
for (const key of [
    'Map',
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
    globalThis[key] = new Proxy(original, {
        construct(target, args, receiver) {
            counts[key]++;
            return Reflect.construct(target, args, receiver);
        },
    });
}
const { answer } = await import(process.argv[2]);
assert.equal(answer(), 42);
await writeFile(process.argv[3], JSON.stringify(counts));
