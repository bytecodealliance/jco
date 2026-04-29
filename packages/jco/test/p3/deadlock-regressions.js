import { join } from "node:path";

import { suite, test, assert } from "vitest";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

import { setupAsyncTest } from "../helpers.js";
import { LOCAL_TEST_COMPONENTS_DIR } from "../common.js";

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

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
                            assert.deepEqual(values, [42]);
                            return 42;
                        },
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncExports: ["jco:test-components/local-run-async#run"],
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
        const signaled = deferred();
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
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncExports: ["jco:test-components/stream-concurrency-test#read-after-signal"],
                    },
                },
            },
        });

        try {
            assert.deepEqual(
                await instance["jco:test-components/stream-concurrency-test"].readAfterSignal(stream),
                [42],
            );
        } finally {
            await cleanup();
        }
    });
});
