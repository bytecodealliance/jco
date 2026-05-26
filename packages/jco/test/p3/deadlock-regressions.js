import { join } from "node:path";

import { suite, test, assert } from "vitest";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

import { setupAsyncTest } from "../helpers.js";
import { LOCAL_TEST_COMPONENTS_DIR, toTypedArrayChunks } from "../common.js";

suite("async scheduling regressions", () => {
    test("host future can be completed by a guest sibling task", async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: "jspi",
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, "future-concurrency.wasm"),
                imports: {
                    ...new WASIShim().getImportObject(),
                    "jco:test-components/future-concurrency-host": {
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
            await instance["jco:test-components/local-run-async"].run();
        } finally {
            await cleanup();
        }
    });

    test("host stream can be unblocked by a guest sibling task", async () => {
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
            asyncMode: "jspi",
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, "stream-concurrency.wasm"),
                imports: {
                    ...new WASIShim().getImportObject(),
                    "jco:test-components/stream-concurrency-host": {
                        signal: () => signaled.resolve(),
                        zeroReadComplete: () => {},
                    },
                },
            },
        });

        try {
            assert.deepEqual(
                await instance["jco:test-components/stream-concurrency-test"].readAfterSignal(stream),
                new Uint8Array([42]),
            );
        } finally {
            await cleanup();
        }
    });

    test("zero-length read after cancellation waits for host readiness", async () => {
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
            asyncMode: "jspi",
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, "stream-concurrency.wasm"),
                imports: {
                    ...new WASIShim().getImportObject(),
                    "jco:test-components/stream-concurrency-host": {
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
                await instance["jco:test-components/stream-concurrency-test"].zeroReadAfterCancel(stream),
                new Uint8Array([42]),
            );
        } finally {
            await cleanup();
        }
    });
});
