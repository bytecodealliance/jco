import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

/** Returns the rejection of `promise`, failing if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (err) {
        return err;
    }
    assert.fail('expected the call to reject');
}

// Regression tests for Canonical ABI built-ins that must trap (or must not) in
// specific situations. Each fixture is a hand-written component that calls the
// built-in from an async (callback) or sync lifted export.
suite.skipIf(typeof WebAssembly.Suspending !== 'function')('Canonical ABI traps', () => {
    test.concurrent('backpressure.dec below zero traps', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'backpressure-dec-underflow',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'backpressure-dec-underflow.wat'),
            },
        });
        try {
            const err = await rejection(instance.decWithoutInc());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /backpressure/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('backpressure.dec after backpressure.inc succeeds', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'backpressure-dec-balanced',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'backpressure-dec-underflow.wat'),
            },
        });
        try {
            assert.isUndefined(await instance.incThenDec());
        } finally {
            await cleanup();
        }
    });

    // A trap poisons the instance, so each trapping call gets its own.
    test.concurrent.each([
        { name: 'resource.drop', fn: 'dropMissing', roundtrip: false },
        { name: 'resource.rep', fn: 'repMissing', roundtrip: false },
        { name: 'resource.drop', fn: 'dropMissing', roundtrip: true },
    ])('$name of an out-of-range handle traps (after a roundtrip: $roundtrip)', async ({ fn, roundtrip }) => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: `resource-handle-out-of-range-${fn}-${roundtrip}`,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'resource-handle-out-of-range.wat'),
            },
        });
        try {
            if (roundtrip) {
                // Handle 1 is allocated and freed again: the slot exists but is empty.
                assert.strictEqual(instance.roundtrip(), 7);
            }
            assert.throws(() => instance[fn](), WebAssembly.RuntimeError, /unknown handle index/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('waitable-set.poll of a waitable that is not a set traps', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'waitable-set-poll-non-set',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'waitable-set-poll-non-set.wat'),
            },
        });
        try {
            const err = await rejection(instance.pollFutureEnd());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /unknown handle index/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('waitable-set.poll of an empty set returns EVENT_NONE', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'waitable-set-poll-empty-set',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'waitable-set-poll-non-set.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.pollEmptySet(), 0);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a stackful lift delivers its result through task.return', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'stackful-lift-task-return',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'stackful-lift.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.withTaskReturn(), 42);
            assert.strictEqual(await instance.withTaskReturn(), 42);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a stackful lift that returns without task.return traps', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'stackful-lift-no-task-return',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'stackful-lift.wat'),
            },
        });
        try {
            const err = await rejection(instance.withoutTaskReturn());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /without resolution/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('an async-lifted callee of a sync-lowered call may yield', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'sync-lowered-async-callee',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'sync-lowered-async-callee.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.run(), 42);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('backpressure keeps a second call out until it is cleared', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'backpressure-admission',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'backpressure-admission.wat'),
            },
        });
        try {
            // Back to back, before either is awaited.
            const first = instance.run();
            const second = instance.run();
            assert.strictEqual(await first, 100);
            // The second call only entered once the first task's callback
            // had cleared the backpressure.
            assert.strictEqual(await second, 1);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('backpressure left set by an exited task keeps later calls out', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'backpressure-admission-blocked',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'backpressure-admission.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.block(), 0);
            const err = await rejection(instance.run());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /deadlock/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent.each(['waitUnknown', 'waitZero'])(
        'a callback that returns WAIT on an invalid waitable set traps (%s)',
        async (fn: string) => {
            const { instance, cleanup } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: {
                    name: `callback-wait-invalid-set-${fn}`,
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'callback-wait-invalid-set.wat'),
                },
            });
            try {
                const err = await rejection(instance[fn]());
                assert.instanceOf(err, WebAssembly.RuntimeError);
                assert.match((err as Error).message, /unknown handle index/);
            } finally {
                await cleanup();
            }
        },
    );

    test.concurrent('a deferred fused adapter start restores the callee task context', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'deferred-subtask-start',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'deferred-subtask-start.wat'),
            },
        });
        try {
            const waitForCompleted = async (expected: number) => {
                for (let i = 0; i < 50 && instance.completed() !== expected; i++) {
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                }
                assert.strictEqual(instance.completed(), expected);
            };
            // The first call enters and raises backpressure before yielding;
            // the second must therefore take the delayed STARTING path.
            const states = (packed: number) => [(packed >>> 8) & 0xf, packed & 0xf];
            assert.deepEqual(states(await instance.run()), [1, 0]);
            await waitForCompleted(2);
            // Neither the first callee's `task.return` nor the second callee's
            // deferred entry failed outside the call: the instance is still usable.
            assert.deepEqual(states(await instance.run()), [1, 0]);
            await waitForCompleted(4);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a synchronous stream.read that cannot complete blocks instead of reporting BLOCKED', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'sync-copy-blocks-stream',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'sync-copy-blocks.wat'),
            },
        });
        try {
            // Nobody writes, so the blocked task is reported as a deadlock.
            const err = await rejection(instance.streamRead());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /deadlock/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a synchronous future.read that cannot complete blocks, also with concurrent calls', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'sync-copy-blocks-future',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'sync-copy-blocks.wat'),
            },
        });
        try {
            // All three fail together once the deadlock is detected, so take
            // their outcomes at once rather than one rejection at a time.
            const outcomes = await Promise.allSettled([
                instance.futureRead(),
                instance.futureRead(),
                instance.futureRead(),
            ]);
            for (const outcome of outcomes) {
                assert.strictEqual(outcome.status, 'rejected');
                const err = (outcome as PromiseRejectedResult).reason;
                assert.instanceOf(err, WebAssembly.RuntimeError, `unexpected error: ${(err as Error).stack}`);
            }
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a callee that exits without task.return traps its async-lowered caller', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'callee-exit-without-return',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'callee-exit-without-return.wat'),
            },
        });
        try {
            // The caller is sync-lifted: the trap surfaces from its call rather
            // than a RETURN_CANCELLED subtask state the caller would carry on with.
            let err: unknown;
            try {
                const result = instance.run();
                err = await rejection(Promise.resolve(result));
            } catch (thrown) {
                err = thrown;
            }
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /without resolution/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('task.return with a result type other than the function type traps', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'task-return-type-mismatch',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'task-return-type-mismatch.wat'),
            },
        });
        try {
            const err = await rejection(instance.wrongType());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /result type/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('task.return with the function type result type succeeds', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'task-return-type-match',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'task-return-type-mismatch.wat'),
            },
        });
        try {
            assert.isUndefined(await instance.rightType());
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a callback can make a sync-lowered call into an async-lifted export', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'callback-sync-call',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'callback-sync-call.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.run(), 42);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('task.return delivers the result while the task stays blocked', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'task-return-then-wait',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'task-return-then-wait.wat'),
            },
        });
        try {
            // The task blocks forever after returning; the caller is not kept waiting.
            const result = await Promise.race([
                instance.run(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('the call did not settle')), 5_000)),
            ]);
            assert.strictEqual(result, 2);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a deadlocked wait is not resumed with a fabricated cancellation', async () => {
        const steps: number[] = [];
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'deadlock-no-resume',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'deadlock-no-resume.wat'),
                imports: { progress: { default: (step: number) => steps.push(step) } },
            },
        });
        try {
            const err = await rejection(instance.run());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /deadlock/);
            // Guest code after the blocked wait never ran.
            assert.deepStrictEqual(steps, [1]);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a call queued behind a task blocked in a synchronous wait does not livelock', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'blocked-holder-livelock',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'blocked-holder-livelock.wat'),
            },
        });
        try {
            // Back to back: the second call queues behind the first task's slice.
            const settled = Promise.allSettled([instance.run(), instance.run()]);
            const outcomes = await Promise.race([
                settled,
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('the calls never settled')), 10_000),
                ),
            ]);
            for (const outcome of outcomes) {
                assert.strictEqual(outcome.status, 'rejected');
                assert.instanceOf((outcome as PromiseRejectedResult).reason, WebAssembly.RuntimeError);
            }
        } finally {
            await cleanup();
        }
    });

    test.concurrent.each([
        'waitUnknown',
        'dropSetUnknown',
        'streamReadUnknown',
        'futureReadUnknown',
        'badCallbackCode',
    ])('an invalid handle index or callback code traps rather than failing internally (%s)', async (fn: string) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: `invalid-handle-traps-${fn}`,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'invalid-handle-traps.wat'),
            },
        });
        try {
            const err = await rejection(instance[fn]());
            assert.instanceOf(err, WebAssembly.RuntimeError, `unexpected error: ${(err as Error).stack}`);
        } finally {
            await cleanup();
        }
    });

    test.concurrent.each(['trapDec', 'trapWait'])(
        'a trap stops a call that was already queued to enter (%s)',
        async (fn: string) => {
            const steps: number[] = [];
            const { instance, cleanup } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: {
                    name: `late-trap-${fn}`,
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'late-trap.wat'),
                    imports: { progress: { default: (step: number) => steps.push(step) } },
                },
            });
            try {
                // Back to back, before either is awaited: the second call is queued
                // behind the first when the first traps.
                const outcomes = await Promise.allSettled([instance[fn](), instance[fn]()]);
                for (const outcome of outcomes) {
                    assert.strictEqual(outcome.status, 'rejected');
                    assert.instanceOf((outcome as PromiseRejectedResult).reason, WebAssembly.RuntimeError);
                }
                // Only the first call ran guest code; nothing runs after a trap.
                assert.deepStrictEqual(steps, [1]);
            } finally {
                await cleanup();
            }
        },
    );

    test.concurrent.each(['callbackFirst', 'syncFirst'])(
        'calls enter in the order they were made (%s, then a stackful export)',
        async (first: string) => {
            const steps: number[] = [];
            const { instance, cleanup } = await setupAsyncTest({
                asyncMode: 'jspi',
                component: {
                    name: `entry-order-${first}`,
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'entry-order.wat'),
                    imports: { progress: { default: (step: number) => steps.push(step) } },
                },
            });
            try {
                // Back to back, before either is awaited.
                await Promise.all([instance[first](), instance.stackfulSecond()]);
                assert.deepStrictEqual(steps, [1, 2]);
            } finally {
                await cleanup();
            }
        },
    );

    test.concurrent('a subtask takes its handle index after the moved-out arguments free theirs', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'subtask-index-order',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'subtask-index-order.wat'),
            },
        });
        try {
            // The readable end (index 1) is moved into the call, so the subtask
            // reuses index 1: (1 << 4) | STARTED.
            assert.strictEqual(await instance.run(), 0x11);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('resource handles share the instance handle table with waitables', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'shared-handle-table',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'shared-handle-table.wat'),
            },
        });
        try {
            // future.new took 1 and 2, so the resource gets 3.
            assert.strictEqual(instance.resourceAfterFuture(), 3);
            // In a fresh instance: set 1 freed, resource reuses 1, freed, next set reuses 1.
            const { instance: fresh, cleanup: cleanupFresh } = await setupAsyncTest({
                component: {
                    name: 'shared-handle-table-reuse',
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'shared-handle-table.wat'),
                },
            });
            try {
                assert.strictEqual(fresh.reuseAcrossKinds(), (1 << 16) | (1 << 8) | 1);
            } finally {
                await cleanupFresh();
            }
        } finally {
            await cleanup();
        }
    });

    test.concurrent('backpressure set by a call keeps a queued stackful call out', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'backpressure-stackful',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'backpressure-stackful.wat'),
            },
        });
        try {
            // Back to back: the stackful probe is queued behind the first call,
            // whose first slice sets the backpressure the probe must wait for.
            const [first, probe] = await Promise.all([instance.setBackpressure(), instance.probe()]);
            assert.strictEqual(first, 100);
            assert.strictEqual(probe, 1, 'the probe entered only after the backpressure was cleared');
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a trap raised inside wasm stops a call that was already queued', async () => {
        const steps: number[] = [];
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'engine-trap',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'engine-trap.wat'),
                imports: { progress: { default: (step: number) => steps.push(step) } },
            },
        });
        try {
            const outcomes = await Promise.allSettled([instance.trap(), instance.trap()]);
            for (const outcome of outcomes) {
                assert.strictEqual(outcome.status, 'rejected');
                assert.instanceOf((outcome as PromiseRejectedResult).reason, WebAssembly.RuntimeError);
            }
            assert.deepStrictEqual(steps, [1]);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a built-in given an out-of-bounds pointer traps', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'oob-pointer',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'oob-pointer.wat'),
            },
        });
        try {
            const err = await rejection(instance.pollOutOfBounds());
            assert.instanceOf(err, WebAssembly.RuntimeError, `unexpected error: ${(err as Error).stack}`);
            assert.match((err as Error).message, /out of bounds/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a sync-lifted, async-typed callee of a sync-lowered call may yield', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'sync-lifted-async-typed-callee',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'sync-lifted-async-typed-callee.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.run(), 42);
        } finally {
            await cleanup();
        }
    });

    for (const write of [false, true]) {
        for (const dropPeer of [false, true]) {
            test.concurrent.each([
                { ptr: 2, count: 0, error: /buffer pointer not aligned/ },
                { ptr: 2, count: 1, error: /buffer pointer not aligned/ },
                { ptr: 65540, count: 0, error: /buffer pointer out of bounds/ },
                { ptr: 65536, count: 1, error: /buffer pointer out of bounds/ },
                { ptr: 65532, count: 2, error: /buffer pointer out of bounds/ },
                { ptr: 0xfffffffc, count: 0, error: /buffer pointer out of bounds/ },
                { ptr: 65536, count: 0, error: null },
                { ptr: 65532, count: 1, error: null },
            ])(
                `stream.${write ? 'write' : 'read'} validates ptr=$ptr count=$count (peer dropped=${dropPeer})`,
                async ({ ptr, count, error }) => {
                    const { instance, cleanup } = await setupAsyncTest({
                        asyncMode: 'jspi',
                        component: {
                            name: 'stream-buffer-validation',
                            path: join(P3_COMPONENT_FIXTURES_DIR, 'stream-buffer-validation.wat'),
                        },
                    });
                    try {
                        if (error) {
                            const err = await rejection(
                                Promise.resolve().then(() => instance.run(write, dropPeer, ptr, count)),
                            );
                            assert.instanceOf(err, WebAssembly.RuntimeError);
                            assert.match((err as Error).message, error);
                        } else {
                            // DROPPED or BLOCKED: there is no peer buffer to copy.
                            assert.strictEqual(
                                await instance.run(write, dropPeer, ptr, count),
                                dropPeer ? 1 : 0xffffffff,
                            );
                        }
                    } finally {
                        await cleanup();
                    }
                },
            );
        }
    }

    test.concurrent('a zero-length same-component copy of non-numeric elements traps', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'zero-length-same-component-stream',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'zero-length-same-component-stream.wat'),
            },
        });
        try {
            const err = await rejection(instance.zeroLengthWrite());
            assert.instanceOf(err, WebAssembly.RuntimeError);
            assert.match((err as Error).message, /intra-component future\/stream with non-numeric payload/);
        } finally {
            await cleanup();
        }
    });
});
