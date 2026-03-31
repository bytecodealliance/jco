import { join } from "node:path";
import { ReadableStream } from "node:stream/web";

import { suite, test, assert, beforeAll, beforeEach, afterAll } from "vitest";

import { setupAsyncTest } from "../helpers.js";
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR, checkStreamValues } from "../common.js";
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

    test.concurrent("sync passthrough", async () => {
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

        let vals = [10, 5, 0];
        const readerStream = new ReadableStream({
            start(ctrl) {
                vals.forEach((v) => ctrl.enqueue(v));
                ctrl.close();
            },
        });

        let stream = await instance["jco:test-components/use-stream-async"].streamPassthrough(readerStream);
        let returnedVals = [];
        for await (const v of stream) {
            returnedVals.push(v);
        }
        assert.deepEqual(vals, returnedVals);
    });

    test.concurrent("bool", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesBool, AsyncFunction);

        let vals = [true, false];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesBool(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);
    });

    test.concurrent("u8/s8", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesU8, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesS8, AsyncFunction);

        let vals = [0, 1, 255];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesU8(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);

        vals = [-128, 0, 1, 127];
        returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesS8(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);
    });

    test.concurrent("u16/s16", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesU16, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesS16, AsyncFunction);

        let vals = [0, 100, 65535];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesU16(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);

        vals = [-32_768, 0, 32_767];
        returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesS16(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);
    });

    test.concurrent("u32/s32", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesU32, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesS32, AsyncFunction);

        let vals = [10, 5, 0];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesU32(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);

        vals = [-32, 90001, 3200000];
        returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesS32(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);
    });

    test.concurrent("u64/s64", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesU64, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesS64, AsyncFunction);

        let vals = [0n, 100n, 65535n];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesU64(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);

        vals = [-32_768n, 0n, 32_767n];
        returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesS64(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);
    });

    test.concurrent("f32/f64", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesF32, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesF64, AsyncFunction);

        let vals = [-300.01235, -1.5, -0.0, 0.0, 1.5, 300.01235];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesF32(
            createReadableStreamFromValues(vals),
        );
        vals.entries().forEach(([idx, v]) => assert.closeTo(v, returnedVals[idx], 0.01));

        vals = [-60000.01235, -1.5, -0.0, 0.0, 1.5, -60000.01235];
        returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesF32(
            createReadableStreamFromValues(vals),
        );
        vals.entries().forEach(([idx, v]) => assert.closeTo(v, returnedVals[idx], 0.01));
    });

    test.concurrent("string", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesString, AsyncFunction);

        let vals = ["hello", "world", "!"];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesString(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);
    });

    test.concurrent("record", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesRecord, AsyncFunction);

        let vals = [
            { id: 3, idStr: "three" },
            { id: 2, idStr: "two" },
            { id: 1, idStr: "one" },
        ];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesRecord(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);
    });

});

function createReadableStreamFromValues(vals) {
    return new ReadableStream({
        start(ctrl) {
            vals.forEach((v) => ctrl.enqueue(v));
            ctrl.close();
        },
    });
}
