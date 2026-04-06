import { join } from "node:path";
import { ReadableStream } from "node:stream/web";

import { suite, test, assert, beforeAll, beforeEach, afterAll } from "vitest";

import { setupAsyncTest } from "../helpers.js";
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR, createReadableStreamFromValues } from "../common.js";
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

    test.concurrent("variant", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesVariant, AsyncFunction);

        let vals = [
            { tag: "maybe-u32", val: 123 },
            { tag: "maybe-u32", val: null },
            { tag: "str", val: "string-value" },
            { tag: "num", val: 1 },
        ];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesVariant(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, [
            // TODO: wit type representation smoothing mismatch
            { tag: "maybe-u32", val: { tag: "some", val: 123 } },
            { tag: "maybe-u32", val: { tag: "none" } },
            { tag: "str", val: "string-value" },
            { tag: "num", val: 1 },
        ]);

        vals = [{ tag: "float", val: 123.1 }];
        returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesVariant(
            createReadableStreamFromValues(vals),
        );
        assert.closeTo(returnedVals[0].val, 123.1, 0.01);
    });

    test.concurrent("tuple", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesTuple, AsyncFunction);

        let vals = [
            [1, -1, "one"],
            [2, -2, "two"],
            [3, -3, "two"],
        ];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesTuple(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);
    });

    test.concurrent("flags", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesFlags, AsyncFunction);

        let vals = [
            { first: true, second: false, third: false },
            { first: false, second: true, third: false },
            { first: false, second: false, third: true },
        ];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesFlags(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);
    });

    test.concurrent("enum", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesEnum, AsyncFunction);

        let vals = ["first", "second", "third"];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesEnum(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, ["first", "second", "third"]);
    });

    test.concurrent("option<string>", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesOptionString, AsyncFunction);

        let vals = ["present string", null];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesOptionString(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, [
            // TODO: wit type representation smoothing mismatch
            { tag: "some", val: "present string" },
            { tag: "none" },
        ]);
    });

    test.concurrent("result<string>", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesResultString, AsyncFunction);

        let vals = [{ tag: "ok", val: "present string" }, { tag: "err", val: "nope" }, "bare string (ok)"];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesResultString(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, [
            // TODO: wit type representation smoothing mismatch
            { tag: "ok", val: "present string" },
            { tag: "err", val: "nope" },
            { tag: "ok", val: "bare string (ok)" },
        ]);
    });

    test.concurrent("list<u8>", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesListU8, AsyncFunction);

        let vals = [[0x01, 0x02, 0x03, 0x04, 0x05], new Uint8Array([0x05, 0x04, 0x03, 0x02, 0x01]), []];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesListU8(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, [
            // TODO: wit type representation smoothing mismatch
            vals[0],
            [...vals[1]],
            [],
        ]);
    });

    test.concurrent("list<string>", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesListString, AsyncFunction);

        let vals = [["first", "second", "third"], []];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesListString(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);
    });

    test.concurrent("list<list<u32, 5>>", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesFixedListU32, AsyncFunction);

        let vals = [
            [
                [1, 2, 3, 4, 5],
                [0, 0, 0, 0, 0],
            ],
            [[0, 0, 0, 0, 0], new Uint32Array([0x05, 0x04, 0x03, 0x02, 0x01])],
        ];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesFixedListU32(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, [
            // TODO(fix): wit type representation smoothing mismatch
            [
                [1, 2, 3, 4, 5],
                [0, 0, 0, 0, 0],
            ],
            [
                [0, 0, 0, 0, 0],
                [0x05, 0x04, 0x03, 0x02, 0x01],
            ],
        ]);
    });

    test.concurrent("list<example-record>", async () => {
        assert.instanceOf(instance["jco:test-components/use-stream-async"].readStreamValuesListRecord, AsyncFunction);

        let vals = [
            [ { id: 3, idStr: "three" },
              { id: 2, idStr: "two" },
              { id: 1, idStr: "one" }, ],
            [ { id: 1, idStr: "one-one" },
              { id: 2, idStr: "two-two" },
              { id: 3, idStr: "three-three" }, ],
        ];
        let returnedVals = await instance["jco:test-components/use-stream-async"].readStreamValuesListRecord(
            createReadableStreamFromValues(vals),
        );
        assert.deepEqual(returnedVals, vals);
    });

});
