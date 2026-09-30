// Flags: --instantiation

import * as assert from 'assert';

// @ts-expect-error
import { instantiate } from '../js-test-components/pointer-overflow/pointer-overflow.js';
import { loadWasm } from './helpers.js';

const PAIRS: [number, number][] = [
    [5, 6],
    [1, 2],
];
const IMPORTS = {
    host: {
        getFixed: () => PAIRS,
        echoVariant: (v: { tag: string; val: unknown }) => {
            assert.deepStrictEqual(v, { tag: 'signed', val: -7 });
            return v;
        },
    },
};

async function assertTraps(call: (wasm: any) => unknown) {
    // A trap makes an instance unusable, so use a fresh instance for each case.
    const wasm = await instantiate(loadWasm, IMPORTS);
    assert.throws(() => call(wasm), /bounds/);
}

const wasm = await instantiate(loadWasm, IMPORTS);

// Valid high pointers and ranges ending exactly at 4 GiB must keep working.
assert.deepStrictEqual(wasm.readMap(0xfffffff8, 1), new Map([[1, 2]]));
assert.deepStrictEqual(wasm.readMap(0xfffffff0, 2), new Map(PAIRS));
assert.deepStrictEqual(wasm.readFixed(0xfffffff0), PAIRS);
assert.strictEqual(wasm.writeMap(new Map([[1, 2]])), 1);
assert.strictEqual(wasm.writeList([[1, 2]]), 1);
wasm.setAllocationPointer(0xfffffff0);
assert.strictEqual(wasm.writeMap(new Map(PAIRS)), 5);
assert.strictEqual(wasm.writeList(PAIRS), 5);
assert.strictEqual(wasm.writeFixed(0xfffffff0), 5);
assert.strictEqual(wasm.callSigned(), -7);

// The map reproducer used to return Map { 1 => 2, 3 => 4 }, reading zero.
await assertTraps((wasm) => wasm.readMap(0xfffffff8, 2));
// Invalid allocations used to write the second entry at address zero.
await assertTraps((wasm) => wasm.writeMap(new Map(PAIRS)));
await assertTraps((wasm) => wasm.writeList(PAIRS));
// Fixed-length list iteration must also preserve computed addresses.
await assertTraps((wasm) => wasm.readFixed(0xfffffff8));
await assertTraps((wasm) => wasm.writeFixed(0xfffffff8));
