import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { assert, expect, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

suite('async-lowered host import ordering', () => {
    test.concurrent.each(['sync', 'promise', 'delayed'])(
        'starts two imports without suspending (host: %s)',
        async (mode) => {
            const calls: number[] = [];
            const { instance, cleanup } = await setupAsyncTest({
                component: {
                    name: `host-import-order-${mode}`,
                    path: join(LOCAL_TEST_COMPONENTS_DIR, 'host-import-order.wasm'),
                    imports: {
                        ...new WASIShim().getImportObject(),
                        progress: { default: () => {} },
                        consume: { default: () => assert.fail('unexpected consume call') },
                        work: {
                            default: (value: number) => {
                                calls.push(value);
                                if (mode === 'sync') {
                                    return value + 1;
                                }
                                if (mode === 'delayed') {
                                    return setTimeout(value === 10 ? 10 : 1).then(() => value + 1);
                                }
                                return Promise.resolve(value + 1);
                            },
                        },
                    },
                },
            });
            try {
                // No promising wrapper: neither canonical async lower may suspend.
                const packed = instance.startTwo();
                assert.isFalse(packed instanceof Promise);
                if (mode === 'sync') {
                    assert.deepEqual(Array.from(packed), [2, 2], 'completed imports expose no subtask handle');
                } else {
                    assert.deepEqual(
                        Array.from(packed, (value: number) => value & 0xf),
                        [1, 1],
                    );
                    assert.notEqual(packed[0] >>> 4, packed[1] >>> 4);
                }
                for (let attempt = 0; attempt < 100; attempt++) {
                    if (instance.results().every((value: number) => value !== 0)) {
                        break;
                    }
                    await setTimeout(10);
                }
                assert.deepEqual(calls, [10, 20]);
                assert.deepEqual(Array.from(instance.results()), [11, 21]);
            } finally {
                await cleanup();
            }
        },
    );
});

test.concurrent('an async host import after task.return does not resume the caller early', async () => {
    const progress: number[] = [];
    const path = await composeCallerCallee({
        callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'host-import-order-caller.wasm'),
        calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'host-import-order.wasm'),
    });
    const { instance, cleanup } = await setupAsyncTest({
        component: {
            name: 'host-import-after-return',
            path,
            imports: {
                ...new WASIShim().getImportObject(),
                progress: { default: (value: number) => progress.push(value) },
                work: { default: async (value: number) => value + 1 },
                consume: { default: () => assert.fail('unexpected consume call') },
            },
        },
    });
    try {
        assert.strictEqual(await instance.run(), 42);
        assert.deepEqual(progress, [1, 2], 'callee continuation must precede caller resumption');
    } finally {
        await cleanup();
    }
});

test.concurrent('invalid async import arguments trap before the guest continues', async () => {
    let continued = false;
    const { instance, cleanup } = await setupAsyncTest({
        component: {
            name: 'host-import-invalid-handle',
            path: join(LOCAL_TEST_COMPONENTS_DIR, 'host-import-order.wasm'),
            imports: {
                ...new WASIShim().getImportObject(),
                work: { default: () => assert.fail('unexpected work call') },
                consume: { default: () => assert.fail('invalid arguments must not reach the host') },
                progress: {
                    default: () => {
                        continued = true;
                    },
                },
            },
        },
        jco: { transpile: { extraArgs: { validLiftingOptimization: false } } },
    });
    try {
        await expect(Promise.resolve().then(() => instance.invalidHandle())).rejects.toBeInstanceOf(
            WebAssembly.RuntimeError,
        );
        assert.isFalse(continued);
    } finally {
        await cleanup();
    }
});
