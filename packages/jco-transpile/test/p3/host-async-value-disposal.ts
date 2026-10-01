import { suite, test, assert, vi } from 'vitest';

import {
    collectUnhandledRejections,
    disposablePending,
    setupHostValueDisposal as setup,
    withTimeout,
} from './helpers/disposal.js';

suite('host future and stream disposal', () => {
    suite('futures', () => {
        test.concurrent('dropping an unread host future disposes its promise', async () => {
            const pending = disposablePending<number>(Symbol.asyncDispose);
            const { guest, cleanup } = await setup({ getFuture: () => pending.promise });

            try {
                await guest.dropFutureUnread();
                await withTimeout(pending.disposed, 'host future disposal');
                assert.equal(pending.disposeCount(), 1);
            } finally {
                await cleanup();
            }
        });

        test.concurrent('cancelling a pending read and dropping the future disposes its promise', async () => {
            const futures: ReturnType<typeof disposablePending<number>>[] = [];
            const { guest, cleanup } = await setup({
                getFuture: () => {
                    // The provider rejects in response to disposal, which must not reach the guest
                    const pending = disposablePending<number>(Symbol.asyncDispose, ({ reject }) => {
                        reject(new DOMException('guest discarded the future', 'AbortError'));
                    });
                    futures.push(pending);
                    return pending.promise;
                },
            });

            try {
                const unhandled = await collectUnhandledRejections(async () => {
                    assert.isTrue(await guest.cancelFutureRead(), 'the future read should have been cancelled');
                    await withTimeout(futures[0].disposed, 'host future disposal');
                    await new Promise((resolve) => setTimeout(resolve, 20));

                    // The component remains usable after the late rejection
                    assert.isTrue(await guest.cancelFutureRead(), 'the future read should have been cancelled');
                    await withTimeout(futures[1].disposed, 'second host future disposal');
                });
                assert.deepEqual(unhandled, []);
                assert.equal(futures[0].disposeCount(), 1);
                assert.equal(futures[1].disposeCount(), 1);
            } finally {
                await cleanup();
            }
        });

        test.concurrent('a host future fulfilled after it was discarded is not delivered', async () => {
            const futures: ReturnType<typeof disposablePending<number>>[] = [];
            const { guest, cleanup } = await setup({
                getFuture: () => {
                    const pending = disposablePending<number>(Symbol.dispose, ({ resolve }) => resolve(7));
                    futures.push(pending);
                    return pending.promise;
                },
            });

            try {
                const unhandled = await collectUnhandledRejections(async () => {
                    assert.isTrue(await guest.cancelFutureRead(), 'the future read should have been cancelled');
                    await withTimeout(futures[0].disposed, 'host future disposal');
                    await new Promise((resolve) => setTimeout(resolve, 20));
                    assert.isTrue(await guest.cancelFutureRead(), 'the future read should have been cancelled');
                });
                assert.deepEqual(unhandled, []);
            } finally {
                await cleanup();
            }
        });

        test.concurrent('a host future read to completion is not disposed', async () => {
            let pending: ReturnType<typeof disposablePending<number>> | undefined;
            const { guest, cleanup } = await setup({
                getFuture: () => {
                    pending = disposablePending<number>(Symbol.asyncDispose);
                    setTimeout(() => pending!.resolve(42), 5);
                    return pending.promise;
                },
            });

            try {
                assert.equal(await guest.readFuture(), 42);
                await new Promise((resolve) => setTimeout(resolve, 20));
                assert.equal(pending!.disposeCount(), 0, 'delivered future values must not be disposed');
            } finally {
                await cleanup();
            }
        });

        test.concurrent('dropping an unread future passed to an export disposes its promise', async () => {
            const pending = disposablePending<number>(Symbol.asyncDispose);
            const { guest, cleanup } = await setup({});

            try {
                await guest.consumeFuture(pending.promise);
                await withTimeout(pending.disposed, 'host future disposal');
                assert.equal(pending.disposeCount(), 1);
            } finally {
                await cleanup();
            }
        });
    });

    suite('streams', () => {
        test.concurrent('dropping a host stream returns its iterator', async () => {
            const returned = Promise.withResolvers<void>();
            let returnCount = 0;
            let disposeCount = 0;
            const stream = {
                [Symbol.asyncIterator]() {
                    return {
                        next: () => new Promise(() => {}),
                        return: async () => {
                            returnCount++;
                            returned.resolve();
                            return { done: true, value: undefined };
                        },
                    };
                },
                // The iterator protocol takes precedence over disposing the stream itself
                async [Symbol.asyncDispose]() {
                    disposeCount++;
                },
            };
            const { guest, cleanup } = await setup({ getStream: () => stream });

            try {
                await guest.dropStreamUnread();
                await withTimeout(returned.promise, 'host stream cleanup');
                await new Promise((resolve) => setTimeout(resolve, 20));
                assert.equal(returnCount, 1);
                assert.equal(disposeCount, 0);
            } finally {
                await cleanup();
            }
        });

        test.concurrent('dropping a host stream without iterator.return() uses Symbol.asyncDispose', async () => {
            const disposed = Promise.withResolvers<void>();
            const calls: string[] = [];
            const stream = {
                [Symbol.asyncIterator]() {
                    return { next: () => new Promise(() => {}) };
                },
                async [Symbol.asyncDispose]() {
                    calls.push('async');
                    disposed.resolve();
                },
                [Symbol.dispose]() {
                    calls.push('sync');
                    disposed.resolve();
                },
            };
            const { guest, cleanup } = await setup({ getStream: () => stream });

            try {
                await guest.dropStreamUnread();
                await withTimeout(disposed.promise, 'host stream disposal');
                assert.deepEqual(calls, ['async']);
            } finally {
                await cleanup();
            }
        });

        test.concurrent('dropping a host stream without iterator.return() falls back to Symbol.dispose', async () => {
            const disposed = Promise.withResolvers<void>();
            let disposeCount = 0;
            const stream = {
                [Symbol.asyncIterator]() {
                    return { next: () => new Promise(() => {}) };
                },
                [Symbol.dispose]() {
                    disposeCount++;
                    disposed.resolve();
                },
            };
            const { guest, cleanup } = await setup({ getStream: () => stream });

            try {
                await guest.dropStreamUnread();
                await withTimeout(disposed.promise, 'host stream disposal');
                assert.equal(disposeCount, 1);
            } finally {
                await cleanup();
            }
        });

        // Not concurrent: spies on the global `console.error`
        test('errors while cleaning up a dropped host stream are reported without affecting the guest', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const cleanupErr = new Error('stream cleanup failure');
            const stream = {
                [Symbol.asyncIterator]() {
                    return {
                        next: () => new Promise(() => {}),
                        return: async () => {
                            throw cleanupErr;
                        },
                    };
                },
            };
            const { guest, cleanup } = await setup({ getStream: () => stream });

            try {
                await guest.dropStreamUnread();
                await vi.waitFor(() => assert.include(consoleError.mock.calls.flat(), cleanupErr));
                // The component remains usable
                await guest.dropStreamUnread();
            } finally {
                consoleError.mockRestore();
                await cleanup();
            }
        });
    });
});
