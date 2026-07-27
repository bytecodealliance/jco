import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../helpers.js';
import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';

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

suite('Canonical ABI argument spillover', () => {
    test('sync calls preserve 16 flat parameters', async () => {
        const expected = args(16);
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/argument-spillover-host': {
                        sync16: validatingHost(expected),
                        sync18: unexpected('sync-18'),
                    },
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
                    'jco:test-components/argument-spillover-host': {
                        sync16: unexpected('sync-16'),
                        sync18: validatingHost(expected),
                    },
                },
            },
        });

        try {
            assert.strictEqual(instance.sync18(...expected), checksum(expected));
        } finally {
            await cleanup();
        }
    });
});
