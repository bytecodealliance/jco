// Flags: --tla-compat --map test=../list-adapter-fusion.js

import * as assert from "assert";

// @ts-ignore
import * as wasm from "../output/list-adapter-fusion/list-adapter-fusion.js";

let expected: any = null;

export function listU8(f: Uint8Array) {
    assert.deepStrictEqual(expected, f);
    return f;
}

export function listS8(f: Int8Array) {
    assert.deepStrictEqual(expected, f);
    return f;
}

export function listU16(f: Uint16Array) {
    assert.deepStrictEqual(expected, f);
    return f;
}

export function listS16(f: Int16Array) {
    assert.deepStrictEqual(expected, f);
    return f;
}

export function listU32(f: Uint32Array) {
    assert.deepStrictEqual(expected, f);
    return f;
}

export function listS32(f: Int32Array) {
    assert.deepStrictEqual(expected, f);
    return f;
}

export function listU64(f: BigUint64Array) {
    assert.deepStrictEqual(expected, f);
    return f;
}

export function listS64(f: BigInt64Array) {
    assert.deepStrictEqual(expected, f);
    return f;
}

export function listFloat32(f: Float32Array) {
    assert.deepStrictEqual(expected, f);
    return f;
}

export function listFloat64(f: Float64Array) {
    assert.deepStrictEqual(expected, f);
    return f;
}

async function run() {
    await wasm.$init;

    function test<T>(f: (arg0: T) => void, arg: T) {
        expected = arg;
        const ret = f(arg);
        expected = null;
        assert.deepStrictEqual(arg, ret);
    }

    test(wasm.result.listU8, new Uint8Array([]));
    test(wasm.result.listU8, new Uint8Array([1]));
    test(wasm.result.listU8, new Uint8Array([1, 2, 3, -1, -2, 0]));

    test(wasm.result.listS8, new Int8Array([]));
    test(wasm.result.listS8, new Int8Array([1]));
    test(wasm.result.listS8, new Int8Array([1, 2, 3, -1, -2, 0]));

    test(wasm.result.listU16, new Uint16Array([]));
    test(wasm.result.listU16, new Uint16Array([1]));
    test(wasm.result.listU16, new Uint16Array([1, 2, 3, -1, -2, 0]));

    test(wasm.result.listS16, new Int16Array([]));
    test(wasm.result.listS16, new Int16Array([1]));
    test(wasm.result.listS16, new Int16Array([1, 2, 3, -1, -2, 0]));

    test(wasm.result.listU32, new Uint32Array([]));
    test(wasm.result.listU32, new Uint32Array([1]));
    test(wasm.result.listU32, new Uint32Array([1, 2, 3, -1, -2, 0]));

    test(wasm.result.listS32, new Int32Array([]));
    test(wasm.result.listS32, new Int32Array([1]));
    test(wasm.result.listS32, new Int32Array([1, 2, 3, -1, -2, 0]));

    test(wasm.result.listU64, new BigUint64Array([]));
    test(wasm.result.listU64, new BigUint64Array([1n]));
    test(wasm.result.listU64, new BigUint64Array([1n, 2n, 3n, -1n, -2n, 0n]));

    test(wasm.result.listS64, new BigInt64Array([]));
    test(wasm.result.listS64, new BigInt64Array([1n]));
    test(wasm.result.listS64, new BigInt64Array([1n, 2n, 3n, -1n, -2n, 0n]));

    test(wasm.result.listFloat32, new Float32Array([]));
    test(wasm.result.listFloat32, new Float32Array([1, 1.2, 0.3]));

    test(wasm.result.listFloat64, new Float64Array([]));
    test(wasm.result.listFloat64, new Float64Array([1, 1.2, 0.3]));
}

// Async cycle handling
setTimeout(run);
