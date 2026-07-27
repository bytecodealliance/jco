import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';

const componentPath = join(LOCAL_TEST_COMPONENTS_DIR, 'argument-spillover.wasm');

function args(count: number, offset = 0): number[] {
    return Array.from({ length: count }, (_, index) => offset + index + 1);
}

function checksum(values: number[]): number {
    return values.reduce((sum, value, index) => sum + value * (index + 1), 0);
}

function validatingHost(expected: number[]) {
    return (...actual: number[]) => {
        assert.deepStrictEqual(actual, expected);
        return checksum(actual);
    };
}

function unexpected(name: string) {
    return () => {
        throw new Error(`unexpected ${name} call`);
    };
}

function spilloverHost(overrides: Record<string, (...args: number[]) => number | Promise<number>>) {
    return {
        sync16: unexpected('sync-16'),
        sync18: unexpected('sync-18'),
        async4: unexpected('async-4'),
        async5: unexpected('async-5'),
        ...overrides,
    };
}

suite('Canonical ABI argument spillover', () => {
    test('sync calls preserve 16 flat parameters', async () => {
        const expected = args(16);
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/argument-spillover-host': spilloverHost({
                        sync16: validatingHost(expected),
                    }),
                },
            },
        });

        try {
            assert.strictEqual(instance.sync16(...expected), checksum(expected));
        } finally {
            await cleanup();
        }
    });

    test('sync calls preserve 18 spilled parameters', async () => {
        const expected = args(18);
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/argument-spillover-host': spilloverHost({
                        sync18: validatingHost(expected),
                    }),
                },
            },
        });

        try {
            assert.strictEqual(instance.sync18(...expected), checksum(expected));
        } finally {
            await cleanup();
        }
    });

    test('async calls preserve 4 flat parameters', async () => {
        const expected = args(4);
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/argument-spillover-host': spilloverHost({
                        async4: async (...actual) => validatingHost(expected)(...actual),
                    }),
                },
            },
        });

        try {
            assert.instanceOf(instance.async4, AsyncFunction);
            assert.strictEqual(await instance.async4(...expected), checksum(expected));
        } finally {
            await cleanup();
        }
    });

    test('async calls preserve 5 parameters when the lower spills', async () => {
        const expected = args(5);
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/argument-spillover-host': spilloverHost({
                        async5: async (...actual) => validatingHost(expected)(...actual),
                    }),
                },
            },
        });

        try {
            assert.instanceOf(instance.async5, AsyncFunction);
            assert.strictEqual(await instance.async5(...expected), checksum(expected));
        } finally {
            await cleanup();
        }
    });
});
