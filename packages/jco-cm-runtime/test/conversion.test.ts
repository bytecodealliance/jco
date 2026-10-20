import { expect, test } from 'vitest';

import { runtime } from '../src/index.js';

function conversion(strict = false) {
    return runtime.create({
        requestedApiVersion: 1,
        strict,
        flagsAsBigInt: false,
        nodejsCompat: true,
        asyncDeterminism: 'random',
    }).intrinsics.conversion;
}

const integerTypes = [
    ['s8', 'toInt8', -128, 127],
    ['u8', 'toUint8', 0, 255],
    ['s16', 'toInt16', -32768, 32767],
    ['u16', 'toUint16', 0, 65535],
    ['s32', 'toInt32', -2147483648, 2147483647],
    ['u32', 'toUint32', 0, 4294967295],
] as const;

test.concurrent.each(integerTypes)('%s validates before coercion in strict mode', (type, method, min, max) => {
    const strict = conversion(true);
    for (const value of [min, max, 0]) {
        expect(strict[method](value)).toBe(value);
        expect(strict.isValidNumericPrimitive(type, value)).toBe(true);
        expect(strict.requireValidNumericPrimitive(type, value)).toBe(true);
    }
    for (const value of [min - 1, max + 1, 1.5, '1', null, undefined, NaN, Infinity, 1n, true, {}]) {
        expect(strict.isValidNumericPrimitive(type, value)).toBe(false);
        expect(() => strict[method](value)).toThrow(TypeError);
        expect(() => strict.requireValidNumericPrimitive(type, value)).toThrow(TypeError);
    }
    let coerced = false;
    expect(() => strict[method]({ valueOf: () => (coerced = true) })).toThrow(TypeError);
    expect(coerced).toBe(false);
});

test.concurrent('non-strict integer coercions retain JavaScript wrapping and errors', () => {
    const c = conversion();
    expect(c.toInt8(255)).toBe(-1);
    expect(c.toInt8(-129)).toBe(127);
    expect(c.toUint8(-1)).toBe(255);
    expect(c.toInt16(65535)).toBe(-1);
    expect(c.toUint16(-1)).toBe(65535);
    expect(c.toInt32(0xffffffff)).toBe(-1);
    expect(c.toUint32(-1)).toBe(0xffffffff);
    for (const [, method] of integerTypes) {
        expect(c[method]('12.8')).toBe(12);
        expect(c[method]({ valueOf: () => 7 })).toBe(7);
        expect(c[method](null)).toBe(0);
        expect(c[method](undefined)).toBe(0);
        expect(c[method](Infinity)).toBe(0);
        expect(c[method](NaN)).toBe(0);
        expect(() => c[method](1n)).toThrow(TypeError);
        expect(() => c[method](Symbol())).toThrow(TypeError);
    }
});

test.concurrent('64-bit integers coerce before strict range checks and wrap otherwise', () => {
    const strict = conversion(true);
    const c = conversion();
    for (const [type, method, min, max] of [
        ['s64', 'toInt64', -(1n << 63n), (1n << 63n) - 1n],
        ['u64', 'toUint64', 0n, (1n << 64n) - 1n],
    ] as const) {
        for (const value of [min, max]) {
            expect(strict[method](value)).toBe(value);
            expect(strict[method](value.toString())).toBe(value);
            expect(strict.isValidNumericPrimitive(type, value)).toBe(true);
        }
        expect(strict[method](true)).toBe(1n);
        expect(strict[method](42)).toBe(42n);
        expect(() => strict[method](min - 1n)).toThrow(TypeError);
        expect(() => strict[method](max + 1n)).toThrow(TypeError);
        expect(() => c[method](1.5)).toThrow(RangeError);
    }
    expect(c.toInt64(1n << 63n)).toBe(-(1n << 63n));
    expect(c.toUint64(-1n)).toBe((1n << 64n) - 1n);
});

test.concurrent('validates booleans and floating point values without numeric coercion', () => {
    const c = conversion();
    for (const value of [0, 1]) {
        expect(c.isValidNumericPrimitive('bool', value)).toBe(true);
    }
    for (const value of [true, false, 2, '1']) {
        expect(c.isValidNumericPrimitive('bool', value)).toBe(false);
    }
    for (const type of ['f32', 'f64']) {
        for (const value of [0, -0, Infinity, -Infinity, NaN]) {
            expect(c.isValidNumericPrimitive(type, value)).toBe(true);
        }
        expect(c.isValidNumericPrimitive(type, 1n)).toBe(false);
    }
    expect(c.isValidNumericPrimitive('unknown', 0)).toBe(false);
});

test.concurrent('bitcasts preserve signed zero, infinities, payload bits, and rounding', () => {
    const c = conversion();
    expect(c.f32ToI32(1)).toBe(0x3f800000);
    expect(c.f32ToI32(-0)).toBe(-2147483648);
    expect(c.i32ToF32(-2147483648)).toBe(-0);
    expect(c.i32ToF32(0x7f800000)).toBe(Infinity);
    expect(c.i32ToF32(0x7fc00001)).toBeNaN();
    expect(c.i32ToF32(c.f32ToI32(1 / 3))).toBe(Math.fround(1 / 3));
    expect(c.f64ToI64(1)).toBe(0x3ff0000000000000n);
    expect(c.f64ToI64(-0)).toBe(-(1n << 63n));
    expect(c.i64ToF64(-(1n << 63n))).toBe(-0);
    expect(c.i64ToF64(0x7ff0000000000000n)).toBe(Infinity);
    expect(c.f64ToI64(c.i64ToF64(0x7ff8000000000001n))).toBe(0x7ff8000000000001n);
    const second = conversion(true);
    expect(second).not.toBe(c);
    expect(second.i64ToF64(0x4000000000000000n)).toBe(2);
    expect(c.i32ToF32(0x3f800000)).toBe(1);
});

test.concurrent('preserves existing character and string conversion behavior', () => {
    const c = conversion();
    expect(c.i32ToChar(65)).toBe('A');
    for (const value of [0, -1, NaN, 0xd800, 0xdfff, 0x110000]) {
        expect(() => c.i32ToChar(value)).toThrow();
    }
    // This helper currently uses UTF-16 fromCharCode, distinct from validateGuestChar.
    expect(c.i32ToChar(0x1f680)).toBe('\uf680');
    expect(c.toString(undefined)).toBe('undefined');
    expect(c.toString({ toString: () => 'value' })).toBe('value');
    expect(() => c.toString(Symbol('value'))).toThrow('symbols cannot be converted to strings');
    expect(c.toResultString({ bytes: new Uint8Array(3), value: 42n })).toBe(
        '{"bytes":"[Uint8Array (3)]","value":"42"}',
    );
    expect(c.toResultString(undefined)).toBeUndefined();
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => c.toResultString(cycle)).toThrow(TypeError);
});

test.concurrent('preserves signed word splitting and merging', () => {
    const c = conversion();
    expect(c.splitInt64(0x123456789abcdef0n)).toEqual([-1698898192, 305419896]);
    expect(c.splitInt64(-1n)).toEqual([-1, -1]);
    expect(c.mergeInt64(0x12345678, 0x12345678)).toBe(0x1234567812345678n);
    expect(c.mergeInt64(0, -1)).toBe(-4294967296n);
    // Preserve bindgen's current signed-low-word behavior.
    expect(c.mergeInt64(-1, 1)).toBe(-1n);
});
