import { join } from 'node:path';

import { suite, test, assert, vi } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest, composeCallerCallee } from '../helpers.js';
import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import {
    collectUnhandledRejections,
    disposablePending,
    setupHostValueDisposal,
    withTimeout,
} from './helpers/disposal.js';

suite('host import cancellation notification', () => {
    /** Instantiate the test component with the given implementation of `pending` */
    const setupCancelHostImport = (pending: (n: number) => unknown) => setupHostValueDisposal({ pending });

    test.concurrent('guest cancellation disposes the pending result via Symbol.asyncDispose', async () => {
        const calls: Array<{ n: number; pending: ReturnType<typeof disposablePending<number>> }> = [];
        const { guest, cleanup } = await setupCancelHostImport((n) => {
            const pending = disposablePending<number>(Symbol.asyncDispose, async ({ resolve }) => {
                // Settling after disposal must not reach the guest
                resolve(n);
            });
            calls.push({ n, pending });
            return pending.promise;
        });

        try {
            await guest.cancelPending(7);
            assert.equal(calls.length, 1);
            assert.equal(calls[0].n, 7, 'host should receive the guest arguments unchanged');
            await withTimeout(calls[0].pending.disposed, 'host result disposal');
            assert.equal(calls[0].pending.disposeCount(), 1);

            // The instance remains usable, and each cancelled call is disposed exactly once
            await guest.cancelPending(8);
            assert.equal(calls.length, 2);
            await withTimeout(calls[1].pending.disposed, 'second host result disposal');
            assert.equal(calls[0].pending.disposeCount(), 1);
            assert.equal(calls[1].pending.disposeCount(), 1);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('guest cancellation falls back to Symbol.dispose', async () => {
        let pending: ReturnType<typeof disposablePending<number>> | undefined;
        const { guest, cleanup } = await setupCancelHostImport(() => {
            pending = disposablePending<number>(Symbol.dispose);
            return pending.promise;
        });

        try {
            await guest.cancelPending(1);
            await withTimeout(pending!.disposed, 'host result disposal');
            assert.equal(pending!.disposeCount(), 1);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('Symbol.asyncDispose is preferred when both dispose hooks are present', async () => {
        const disposed: string[] = [];
        const settled = Promise.withResolvers<void>();
        const { guest, cleanup } = await setupCancelHostImport(() =>
            Object.assign(new Promise(() => {}), {
                async [Symbol.asyncDispose]() {
                    disposed.push('async');
                    settled.resolve();
                },
                [Symbol.dispose]() {
                    disposed.push('sync');
                    settled.resolve();
                },
            }),
        );

        try {
            await guest.cancelPending(1);
            await withTimeout(settled.promise, 'host result disposal');
            assert.deepEqual(disposed, ['async']);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('rejecting the discarded call while handling cancellation does not trap', async () => {
        const disposals: Promise<void>[] = [];
        const { guest, cleanup } = await setupCancelHostImport(() => {
            const pending = disposablePending<number>(Symbol.asyncDispose, ({ reject }) => {
                reject(new DOMException('guest cancelled the call', 'AbortError'));
            });
            disposals.push(pending.disposed);
            return pending.promise;
        });

        try {
            const unhandled = await collectUnhandledRejections(async () => {
                await guest.cancelPending(1);
                await withTimeout(disposals[0], 'host result disposal');
                // Let the rejection propagate through the (already cancelled) host task
                await new Promise((resolve) => setTimeout(resolve, 20));

                // A rejection of a discarded call must not poison the component
                await guest.cancelPending(2);
                await withTimeout(disposals[1], 'second host result disposal');
            });
            assert.deepEqual(unhandled, []);
        } finally {
            await cleanup();
        }
    });

    // Not concurrent: spies on the global `console.error`
    test('errors thrown while disposing are reported without affecting the guest', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const disposeErr = new Error('sync dispose failure');
        const asyncDisposeErr = new Error('async dispose failure');

        let callCount = 0;
        const { guest, cleanup } = await setupCancelHostImport(() => {
            callCount++;
            if (callCount === 1) {
                return Object.assign(new Promise(() => {}), {
                    [Symbol.dispose]() {
                        throw disposeErr;
                    },
                });
            }
            return Object.assign(new Promise(() => {}), {
                async [Symbol.asyncDispose]() {
                    throw asyncDisposeErr;
                },
            });
        });

        try {
            await guest.cancelPending(1);
            await guest.cancelPending(2);
            await vi.waitFor(() => {
                const reported = consoleError.mock.calls.flat();
                assert.include(reported, disposeErr);
                assert.include(reported, asyncDisposeErr);
            });
        } finally {
            consoleError.mockRestore();
            await cleanup();
        }
    });

    test.concurrent('pending results without a dispose hook are discarded as before', async () => {
        let called = false;
        const { guest, cleanup } = await setupCancelHostImport(async () => {
            called = true;
            await new Promise(() => {});
        });

        try {
            await guest.cancelPending(1);
            assert.isTrue(called);
        } finally {
            await cleanup();
        }
    });

    // A Rust guest dropping an in-flight import future lowers to `subtask.cancel`
    test.concurrent('dropping an in-flight host import future disposes the pending result', async () => {
        let pending: ReturnType<typeof disposablePending<number>> | undefined;
        let completedCalled = false;

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'subtask-cancel-drop.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/subtask-cancel-drop-host': {
                        pendingCall: () => {
                            pending = disposablePending<number>(Symbol.asyncDispose, ({ resolve }) => resolve(42));
                            return pending.promise;
                        },
                        waitUntilBlocked: async () => {},
                        completed: () => {
                            completedCalled = true;
                        },
                    },
                },
            },
        });

        try {
            await instance['jco:test-components/local-run-async'].run();
            assert.isTrue(completedCalled, 'guest should complete normally after dropping the in-flight import');
            assert.isDefined(pending, 'the pending host import should have been started');
            await withTimeout(pending!.disposed, 'host result disposal');
            assert.equal(pending!.disposeCount(), 1);
        } finally {
            await cleanup();
        }
    });

    // Cancelling a guest callee propagates to the host import it is blocked on, while
    // results that were delivered to a guest are never disposed
    test.concurrent('cancelling a guest callee disposes its pending host import, but not delivered results', async () => {
        const calleeBlocked = Promise.withResolvers<void>();
        let pending: ReturnType<typeof disposablePending<number>> | undefined;
        let delivered: ReturnType<typeof disposablePending<void>> | undefined;
        let completedCalled = false;

        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'subtask-cancel-g2g-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'subtask-cancel-g2g-callee.wasm'),
        });

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/subtask-cancel-drop-host': {
                        pendingCall: () => {
                            pending = disposablePending<number>(Symbol.asyncDispose);
                            calleeBlocked.resolve();
                            return pending.promise;
                        },
                        waitUntilBlocked: () => {
                            delivered = disposablePending<void>(Symbol.asyncDispose);
                            calleeBlocked.promise.then(() => delivered!.resolve());
                            return delivered.promise;
                        },
                        completed: () => {
                            completedCalled = true;
                        },
                    },
                },
            },
        });

        try {
            await instance['jco:test-components/local-run-async'].run();
            assert.isTrue(completedCalled, 'caller should complete normally after cancelling the callee');
            await withTimeout(pending!.disposed, 'callee host result disposal');
            assert.equal(pending!.disposeCount(), 1);
            await new Promise((resolve) => setTimeout(resolve, 20));
            assert.equal(delivered!.disposeCount(), 0, 'delivered host results must not be disposed');
        } finally {
            await cleanup();
        }
    });
});
