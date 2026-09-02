import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../helpers.js';
import { LOCAL_TEST_COMPONENTS_DIR, toTypedArrayChunks } from '../common.js';

suite('async scheduling regressions', () => {
    test('host import can be unblocked by a host import sibling', async () => {
        const signaled = Promise.withResolvers();
        let signalCalled = false;

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'host-import-concurrency.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/host-import-concurrency-host': {
                        wait: async () => {
                            await signaled.promise;
                            return 42;
                        },
                        signal: async () => {
                            signalCalled = true;
                            signaled.resolve();
                        },
                    },
                },
            },
        });

        try {
            await instance['jco:test-components/local-run-async'].run();
            assert.isTrue(signalCalled);
        } finally {
            await cleanup();
        }
    });

    test('host future can be completed by a guest sibling task', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'future-concurrency.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/future-concurrency-host': {
                        writeViaStream: async (stream) => {
                            const values = [];
                            for await (const value of stream) {
                                values.push(value);
                            }
                            assert.deepEqual(values, toTypedArrayChunks(Uint8Array, [42]));
                            return 42;
                        },
                    },
                },
            },
        });

        try {
            await instance['jco:test-components/local-run-async'].run();
        } finally {
            await cleanup();
        }
    });

    test('host stream can be unblocked by a guest sibling task', async () => {
        const signaled = Promise.withResolvers();
        let yielded = false;

        const stream = {
            [Symbol.asyncIterator]() {
                return {
                    next: async () => {
                        await signaled.promise;
                        if (yielded) {
                            return { value: undefined, done: true };
                        }
                        yielded = true;
                        return { value: 42, done: false };
                    },
                };
            },
        };

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-concurrency.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/stream-concurrency-host': {
                        signal: () => signaled.resolve(),
                        zeroReadComplete: () => {},
                    },
                },
            },
        });

        try {
            assert.deepEqual(
                await instance['jco:test-components/stream-concurrency-test'].readAfterSignal(stream),
                new Uint8Array([42]),
            );
        } finally {
            await cleanup();
        }
    });

    test('zero-length read after cancellation waits for host readiness', async () => {
        const signaled = Promise.withResolvers();
        let readStarted = false;
        let signalCalled = false;
        let yielded = false;

        const stream = {
            [Symbol.asyncIterator]() {
                return {
                    next: async () => {
                        readStarted = true;
                        await signaled.promise;
                        if (yielded) {
                            return { value: undefined, done: true };
                        }
                        yielded = true;
                        return { value: 42, done: false };
                    },
                };
            },
        };

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-concurrency.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/stream-concurrency-host': {
                        signal: () => {
                            assert.isTrue(readStarted);
                            signalCalled = true;
                            signaled.resolve();
                        },
                        zeroReadComplete: () => {
                            assert.isTrue(signalCalled);
                        },
                    },
                },
            },
        });

        try {
            assert.deepEqual(
                await instance['jco:test-components/stream-concurrency-test'].zeroReadAfterCancel(stream),
                new Uint8Array([42]),
            );
        } finally {
            await cleanup();
        }
    });

    // Regression guard for host-injected stream data lost across read cancellation
    // (originally seen as a flaky `p3-sockets-tcp-streams` failure under real socket I/O).
    //
    // Failure scenario this reproduces:
    //   - The guest reads a host-backed (lowered) stream in a loop: poll the read once
    //     with a no-op waker and, if it is not immediately ready, CANCEL it -- then issue a
    //     zero-length read to wait for host readiness before looping (see
    //     `read_with_cancellation` in the `stream_concurrency` test component).
    //   - Bug 1: the zero-length read used to DRAIN one item from the source and rendezvous
    //     it with the zero-capacity read buffer, which stored it as a pending write in the
    //     shared buffer slot -- corrupting the next real read's rendezvous.
    //   - Bug 2: when a just-in-time host write then found no reader buffer (its target read
    //     had been cancelled), its in-flight items were stranded and dropped when the stream
    //     ended, instead of being returned to the source for redelivery.
    //   - Net effect: the tail of the stream (exactly the in-flight chunk) was silently lost,
    //     so the guest received fewer bytes than were sent.
    //
    // The loss only manifests when cancel completion wins the race against the in-flight
    // write. In production that deferral is a `setTimeout(fn, 0)`, and real socket latency is
    // what usually opens the window; a microtask-based host iterator alone does not. To make
    // the race deterministic here we collapse zero-delay timers onto the microtask queue for
    // the duration of the guest call (test-only; no production behavior changes) so cancel
    // completion reliably precedes delivery. Without the fix this loses the final chunk.
    test('cancelled host stream reads preserve every value in order', async () => {
        const expected = Uint8Array.from({ length: 2 * 1024 * 1024 }, (_, index) => index & 0xff);
        let offset = 0;
        const stream = {
            [Symbol.asyncIterator]() {
                return {
                    next() {
                        return new Promise((resolve) => {
                            queueMicrotask(() => {
                                if (offset === expected.length) {
                                    resolve({ value: undefined, done: true });
                                    return;
                                }
                                const end = Math.min(offset + 64 * 1024, expected.length);
                                const value = expected.slice(offset, end);
                                offset = end;
                                resolve({ value, done: false });
                            });
                        });
                    },
                };
            },
        };

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-concurrency.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/stream-concurrency-host': {
                        signal: () => {},
                        zeroReadComplete: () => {},
                    },
                },
            },
        });

        // Force zero-delay `setTimeout` (used to defer stream cancel completion) onto the
        // microtask queue so cancel completion deterministically races ahead of the in-flight
        // host write -- the timing real socket I/O produces. Restored in `finally`.
        const realSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = (fn, delay, ...args) => {
            if (!delay) {
                queueMicrotask(() => fn(...args));
                return 0;
            }
            return realSetTimeout(fn, delay, ...args);
        };

        try {
            const actual = await instance['jco:test-components/stream-concurrency-test'].readWithCancellation(stream);
            // Explicit length check first: a regression drops the final in-flight chunk, so
            // the clearest symptom is a short result rather than a mismatched byte.
            assert.strictEqual(
                actual.length,
                expected.length,
                `expected ${expected.length} bytes but received ${actual.length} (lost the in-flight tail)`,
            );
            assert.deepEqual(actual, expected);
        } finally {
            globalThis.setTimeout = realSetTimeout;
            await cleanup();
        }
    });

    test('dropping a guest stream does not synchronously re-enter its producer', async () => {
        const secondWriteStarted = Promise.withResolvers<void>();
        let writesStarted = 0;
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-concurrency.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/stream-concurrency-host': {
                        signal: () => {
                            writesStarted += 1;
                            if (writesStarted === 2) {
                                secondWriteStarted.resolve();
                            }
                        },
                        zeroReadComplete: () => {},
                    },
                },
            },
        });

        try {
            const stream = await instance['jco:test-components/stream-concurrency-test'].writeUntilDropped();
            assert.deepEqual(await stream.next(), {
                done: false,
                value: new Uint8Array([42]),
            });
            await secondWriteStarted.promise;
            stream[Symbol.dispose]();
        } finally {
            await cleanup();
        }
    });

    test('disposing a lifted stream with a completed read wakes its pending writer', async () => {
        const secondWriteStarted = Promise.withResolvers<void>();
        const writerStopped = Promise.withResolvers<void>();
        const disposed = Promise.withResolvers<void>();
        let writesStarted = 0;
        let stream;
        let read;
        let disposeError;
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-concurrency.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/stream-concurrency-host': {
                        signal: () => {
                            writesStarted += 1;
                            if (writesStarted === 2) {
                                // Register a host read before this synchronous import returns
                                // and the guest performs its second write. Dispose in the next
                                // microtask, after that write publishes the read event but before
                                // the blocked host read's polling loop consumes it.
                                read = stream.next();
                                queueMicrotask(() => {
                                    try {
                                        stream[Symbol.dispose]();
                                        stream[Symbol.dispose]();
                                    } catch (error) {
                                        disposeError = error;
                                    } finally {
                                        disposed.resolve();
                                    }
                                });
                                secondWriteStarted.resolve();
                            } else if (writesStarted === 3) {
                                writerStopped.resolve();
                            }
                        },
                        zeroReadComplete: () => {},
                    },
                },
            },
        });

        try {
            stream = await instance['jco:test-components/stream-concurrency-test'].writeUntilDropped();
            assert.deepEqual(await stream.next(), {
                done: false,
                value: new Uint8Array([42]),
            });
            await secondWriteStarted.promise;
            await disposed.promise;
            assert.isUndefined(disposeError);

            await Promise.race([
                read.catch(() => undefined),
                new Promise((_, reject) => setTimeout(() => reject(new Error('pending read did not settle')), 1_000)),
            ]);
            await Promise.race([
                writerStopped.promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('pending writer was not woken')), 1_000)),
            ]);
        } finally {
            await cleanup();
        }
    });

    test('disposing a blocked lifted read before completion wakes both endpoints', async () => {
        const writerStopped = Promise.withResolvers<void>();
        const disposed = Promise.withResolvers<void>();
        let writesStarted = 0;
        let stream;
        let read;
        let disposeError;

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-concurrency.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/stream-concurrency-host': {
                        signal: () => {
                            writesStarted += 1;
                            if (writesStarted === 2) {
                                // Dispose synchronously, before this import returns and
                                // lets the guest publish its next write.
                                read = stream.next();
                                try {
                                    stream[Symbol.dispose]();
                                } catch (error) {
                                    disposeError = error;
                                } finally {
                                    disposed.resolve();
                                }
                            } else if (writesStarted === 3) {
                                writerStopped.resolve();
                            }
                        },
                        zeroReadComplete: () => {},
                    },
                },
            },
        });

        try {
            stream = await instance['jco:test-components/stream-concurrency-test'].writeUntilDropped();
            assert.deepEqual(await stream.next(), {
                done: false,
                value: new Uint8Array([42]),
            });
            await disposed.promise;
            assert.isUndefined(disposeError);
            await Promise.race([
                read.catch(() => undefined),
                new Promise((_, reject) => setTimeout(() => reject(new Error('blocked read did not settle')), 1_000)),
            ]);
            await Promise.race([
                writerStopped.promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('pending writer was not woken')), 1_000)),
            ]);
        } finally {
            await cleanup();
        }
    });
});
