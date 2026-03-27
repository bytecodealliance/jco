import { join } from "node:path";

import { suite, test, assert, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { ReadableStream } from "node:util";

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
        const stream = new ReadableStream({
            start(ctrl) {
                vals.forEach(v => ctrl.enqueue(v));
                ctrl.close();
            }
        });

        const returnedStream = instance["jco:test-components/use-stream-sync"].streamPassthrough(stream);

        const reader = returnedStream.getReader();
        let returnedVals = [];
        let readRes = {};
        while (!readRes.done) {
            readRes = await reader.read();
            returnedVals.push(readRes.value);
        }

        assert.deepEqual(vals, returnedVals);
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
