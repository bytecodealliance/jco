import { join } from "node:path";
import { ReadableStream } from "node:stream/web";

import { suite, test, assert, beforeAll, beforeEach, afterAll } from "vitest";

import { setupAsyncTest } from "../helpers.js";
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from "../common.js";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

suite("stream<T> lowers", () => {
    let esModule, cleanup, instance;

    beforeAll(async () => {
        const name = "stream-rx";
        const setupRes = await setupAsyncTest({
            asyncMode: "jspi",
            component: {
                name,
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            },
        });

        esModule = setupRes.esModule;
        cleanup = setupRes.cleanup;
    });

    afterAll(async () => {
        await cleanup();
    });

    beforeEach(async () => {
        instance = await esModule.instantiate(undefined, {
            ...new WASIShim().getImportObject(),
        });
    });

    test.only("sync passthrough", async () => {
        assert.notInstanceOf(instance["jco:test-components/use-stream-sync"].streamPassthrough, AsyncFunction);

        let vals = [0, 5, 10];
        const readerStream = new ReadableStream({
            start(ctrl) {
                vals.forEach((v) => ctrl.enqueue(v));
                ctrl.close();
            },
        });

        let returnedStream = instance["jco:test-components/use-stream-sync"].streamPassthrough(readerStream);

        // NOTE: Returned streams conform to the async iterator protocol -- they *do not* confirm to
        // any other interface, though an object that is a ReadableStream may have been passed in.
        //
        let returnedVals = [];
        for await (const v of returnedStream) {
            returnedVals.push(v);
        }
        assert.deepEqual(vals, returnedVals);

        // Test late writer -- component should block until a value is written,
        // and we should handle a final value + done from an iterator properly
        const lateStream = {
            [Symbol.asyncIterator]() {
                let returned = 0;
                return {
                    async next() {
                        await new Promise((resolve) => setTimeout(resolve, 300));
                        if (returned === 2) {
                            return { value: 42, done: true };
                        }
                        returned += 1;
                        return { value: 42, done: false };
                    },
                };
            },
        };
        returnedStream = instance["jco:test-components/use-stream-sync"].streamPassthrough(lateStream);

        returnedVals = [];
        for await (const v of returnedStream) {
            returnedVals.push(v);
        }
        assert.deepEqual([42, 42, 42], returnedVals);
    });

    test.concurrent("async passthrough", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].streamPassthrough, AsyncFunction);
        // TODO: same as sync passthrough, and we do the async stream reading on this side
    });

    test.concurrent("u32/s32", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesU32, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesS32, AsyncFunction);

        // TODO: same as async pass through test except we get the list back and can compare directly

        // TODO:
        // let vals = [11, 22, 33];
        // let stream = await instance["jco:test-components/get-stream-async"].getStreamU32(vals);
    });
});
