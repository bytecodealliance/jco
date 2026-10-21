import { describe, expect, test } from 'vitest';

import { CM_RUNTIME_API_VERSION, runtime, type ComponentModelRuntimeProvider } from '../src/index.js';

const TABLE_FLAG = 1 << 30;
const TABLE_OWN = 2 ** 32;

function createRuntime() {
    return runtime.create({
        requestedApiVersion: CM_RUNTIME_API_VERSION,
        strict: false,
        flagsAsBigInt: false,
        nodejsCompat: true,
        asyncDeterminism: 'random',
    });
}

describe('resource.tableGet', () => {
    test('reads owned and borrowed resource entries', () => {
        const { tableGet } = createRuntime().intrinsics.resource;
        const table = [TABLE_FLAG, 0, 7, 42 + TABLE_OWN, 11, 24];

        expect(tableGet(table, 1)).toEqual({ rep: 42, scope: 7, own: true });
        expect(tableGet(table, 2)).toEqual({ rep: 24, scope: 11, own: false });
    });

    // see: https://github.com/bytecodealliance/jco/issues/2293
    test.each([0x40000000, 0x7ffffff0, 0x80000010, 0xc0000010, 0xffffffff])('keeps every bit of rep %i', (rep) => {
        const { tableGet } = createRuntime().intrinsics.resource;
        const table = [TABLE_FLAG, 0, 0, rep + TABLE_OWN, 3, rep];

        expect(tableGet(table, 1)).toEqual({ rep, scope: 0, own: true });
        expect(tableGet(table, 2)).toEqual({ rep, scope: 3, own: false });
    });

    test('accepts zero representations for owned and borrowed resources', () => {
        const { tableGet } = createRuntime().intrinsics.resource;
        const table = [TABLE_FLAG, 0, 0, TABLE_OWN, 3, 0];

        expect(tableGet(table, 1)).toEqual({ rep: 0, scope: 0, own: true });
        expect(tableGet(table, 2)).toEqual({ rep: 0, scope: 3, own: false });
    });

    test.each([
        { name: 'the sentinel at index 0', table: [TABLE_FLAG, 0], handle: 0 },
        { name: 'a freed entry', table: [TABLE_FLAG, 0, TABLE_FLAG, 0], handle: 1 },
        {
            name: 'a hole belonging to another handle kind',
            table: Object.assign([TABLE_FLAG, 0], { 4: 0, 5: TABLE_OWN }),
            handle: 1,
        },
        { name: 'an index past the end of the table', table: [TABLE_FLAG, 0], handle: 4 },
    ])('traps for $name', ({ table, handle }) => {
        const { tableGet } = createRuntime().intrinsics.resource;

        expect(() => tableGet(table, handle)).toThrowError(WebAssembly.RuntimeError);
        expect(() => tableGet(table, handle)).toThrow(`unknown handle index ${handle}`);
    });

    test('uses the injected RuntimeError realm', () => {
        class CustomRuntimeError extends Error {}
        const instance = runtime.create({
            requestedApiVersion: CM_RUNTIME_API_VERSION,
            strict: false,
            flagsAsBigInt: false,
            nodejsCompat: true,
            asyncDeterminism: 'random',
            platform: { WebAssembly: { RuntimeError: CustomRuntimeError } },
        });

        expect(() => instance.intrinsics.resource.tableGet([TABLE_FLAG, 0], 0)).toThrowError(CustomRuntimeError);
    });
});

describe('runtime provider', () => {
    test('rejects an incompatible requested API', () => {
        expect(() =>
            runtime.create({
                requestedApiVersion: 1,
                strict: false,
                flagsAsBigInt: false,
                nodejsCompat: true,
                asyncDeterminism: 'random',
            }),
        ).toThrow('requested 1, supported 2');
    });

    test('creates isolated runtime objects', () => {
        const first = createRuntime();
        const second = createRuntime();

        expect(first).not.toBe(second);
        expect(first.intrinsics).not.toBe(second.intrinsics);
        expect(first.intrinsics.resource).not.toBe(second.intrinsics.resource);
    });

    test('supports structurally typed alternative providers', () => {
        const alternative = {
            apiVersion: CM_RUNTIME_API_VERSION,
            create: (options) => runtime.create(options),
        } satisfies ComponentModelRuntimeProvider;

        expect(alternative.create).toBeTypeOf('function');
    });
});
