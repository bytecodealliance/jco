import { join } from 'node:path';

import { assert, expect, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

const INVALID_CASES = [
    'subtask.drop of a stream',
    'subtask.drop of a waitable set',
    'subtask.cancel of a waitable set',
    'subtask.cancel of zero',
    'joining a waitable set as a waitable',
    'joining a missing waitable',
    'joining a stream to another stream',
    'waitable-set.drop of a stream',
    'waitable-set.drop of zero',
    'dropping a nonempty waitable set',
    'stream.read of a future',
    'future.read of a stream',
    'stream.read of another concrete stream type',
    'future.read of another concrete future type',
    'stream.drop-readable of a future',
    'future.drop-readable of a stream',
    'error-context.drop of a stream',
    'error-context.drop of zero',
];

async function setup(name: string, fail = () => assert.fail('unexpected host call')) {
    return setupAsyncTest({
        component: {
            name,
            path: join(LOCAL_TEST_COMPONENTS_DIR, 'invalid-handle-kinds.wasm'),
            imports: {
                ...new WASIShim().getImportObject(),
                fail: { default: fail },
                'pending-call': { default: () => new Promise((resolve) => setTimeout(() => resolve(42), 10)) },
                payloads: { default: () => assert.fail('the payload type declaration is never called') },
            },
        },
        jco: { transpile: { extraArgs: { validLiftingOptimization: false } } },
    });
}

suite('canonical handle validation in Rust components', () => {
    test.concurrent.each(INVALID_CASES.map((name, index) => ({ name, index })))('$name traps', async ({ index }) => {
        const { instance, cleanup } = await setup(`invalid-handle-${index}`);
        try {
            await expect(Promise.resolve().then(() => instance.run(index))).rejects.toBeInstanceOf(
                WebAssembly.RuntimeError,
            );
        } finally {
            await cleanup();
        }
    });

    test('a valid stream join, unjoin and set drop succeeds', async () => {
        const { instance, cleanup } = await setup('valid-waitable-join');
        try {
            assert.isUndefined(await instance.run(INVALID_CASES.length));
        } finally {
            await cleanup();
        }
    });

    test('a pending subtask can join a waitable set and deliver its result', async () => {
        const { instance, cleanup } = await setup('valid-subtask-join');
        try {
            // The SDK joins the pending import to its waitable set and unjoins
            // and drops the subtask after receiving its completion event.
            assert.strictEqual(await instance.awaitSubtask(), 42);
            assert.strictEqual(await instance.awaitSubtask(), 42);
        } finally {
            await cleanup();
        }
    });

    test.each([Error, RangeError].map((ErrorType) => ({ ErrorType, name: ErrorType.name })))(
        'host $name keeps its identity and type',
        async ({ ErrorType }) => {
            const expected = new ErrorType('host failure');
            const { instance, cleanup } = await setup(`host-error-${ErrorType.name}`, () => {
                throw expected;
            });
            try {
                await expect(Promise.resolve().then(() => instance.run(INVALID_CASES.length + 1))).rejects.toBe(
                    expected,
                );
            } finally {
                await cleanup();
            }
        },
    );
});
