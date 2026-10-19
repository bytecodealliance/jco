import { describe, expect, test } from 'vitest';

import { RUNTIME_API_VERSION, runtime, type ComponentModelRuntimeProvider } from '../src/index.js';

const TABLE_FLAG = 1 << 30;

function createRuntime() {
    return runtime.create({
        requestedApiVersion: RUNTIME_API_VERSION,
        strict: false,
        flagsAsBigInt: false,
        nodejsCompat: true,
        asyncDeterminism: 'random',
    });
}

describe('resource.tableGet', () => {
    test('reads owned and borrowed resource entries', () => {
        const { tableGet } = createRuntime().intrinsics.resource;
        const table = [TABLE_FLAG, 0, 7, 42 | TABLE_FLAG, 11, 24];

        expect(tableGet(table, 1)).toEqual({ rep: 42, scope: 7, own: true });
        expect(tableGet(table, 2)).toEqual({ rep: 24, scope: 11, own: false });
    });

    test.each([
        { name: 'the sentinel at index 0', table: [TABLE_FLAG, 0], handle: 0 },
        { name: 'a freed entry', table: [TABLE_FLAG, 0, TABLE_FLAG, 0], handle: 1 },
        { name: 'a zero rep', table: [TABLE_FLAG, 0, 0, 0], handle: 1 },
        { name: 'an index past the end of the table', table: [TABLE_FLAG, 0], handle: 4 },
    ])('traps for $name', ({ table, handle }) => {
        const { tableGet } = createRuntime().intrinsics.resource;

        expect(() => tableGet(table, handle)).toThrowError(WebAssembly.RuntimeError);
        expect(() => tableGet(table, handle)).toThrow(`unknown handle index ${handle}`);
    });

    test('uses the injected RuntimeError realm', () => {
        class CustomRuntimeError extends Error {}
        const instance = runtime.create({
            requestedApiVersion: RUNTIME_API_VERSION,
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
                requestedApiVersion: 2,
                strict: false,
                flagsAsBigInt: false,
                nodejsCompat: true,
                asyncDeterminism: 'random',
            }),
        ).toThrow('requested 2, supported 1');
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
            apiVersion: RUNTIME_API_VERSION,
            create: (options) => runtime.create(options),
        } satisfies ComponentModelRuntimeProvider;

        expect(alternative.create).toBeTypeOf('function');
    });
});
