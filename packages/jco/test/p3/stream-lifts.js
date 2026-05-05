import { join } from "node:path";

import { suite, test, assert, beforeAll, afterAll, expect } from "vitest";

import { setupAsyncTest } from "../helpers.js";
import {
    AsyncFunction,
    LOCAL_TEST_COMPONENTS_DIR,
    checkStreamValues,
    toTypedArrayChunks,
    toTypedArrays,
} from "../common.js";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

suite("stream<T> lifts", () => {
    let esModule, cleanup, getInstance, instance;

    class ExampleResource {
        #id;
        constructor(id) {
            this.#id = id;
        }
        getId() {
            return this.#id;
        }
    }

    beforeAll(async () => {
        const name = "stream-tx";
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

        // We use a completely shared instance because sibling re-entrance
        // is mediated by code in task.enter()
        instance = await esModule.instantiate(undefined, {
            ...new WASIShim().getImportObject(),
            "jco:test-components/resources": {
                ExampleResource,
            },
        });
        getInstance = () => Promise.resolve(instance);

        // NOTE: To use an explicitly new instance per-test, uncomment the lines below
        //
        // getInstance = async () => esModule.instantiate(undefined, {
        //     ...new WASIShim().getImportObject(),
        //     "jco:test-components/resources": {
        //         ExampleResource,
        //     },
        // });
    });

    afterAll(async () => {
        await cleanup();
    });

    test.concurrent("bool", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamBool, AsyncFunction);
        const vals = [true, false];
        const stream = await instance["jco:test-components/get-stream-async"].getStreamBool(vals);
        await checkStreamValues({ stream, vals, typeName: "bool" });
    });

    test.concurrent("u8/s8", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU8, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS8, AsyncFunction);

        let vals = [0, 1, 255];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamU8(vals);
        await checkStreamValues({
            stream,
            vals,
            expectedValues: toTypedArrayChunks(Uint8Array, vals),
            typeName: "u8",
            assertEqFn: assert.deepEqual,
        });

        let invalidVals = [-1, 256];
        for (const invalid of invalidVals) {
            await expect(() => instance["jco:test-components/get-stream-async"].getStreamU8([invalid])).rejects.toThrow(
                /invalid u8 value/,
            );
        }

        vals = [-11, -22, -33, -128, 127];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS8(vals);
        await checkStreamValues({
            stream,
            vals,
            expectedValues: toTypedArrayChunks(Int8Array, vals),
            typeName: "s8",
            assertEqFn: assert.deepEqual,
        });

        invalidVals = [-129, 128];
        for (const invalid of invalidVals) {
            await expect(() => instance["jco:test-components/get-stream-async"].getStreamS8([invalid])).rejects.toThrow(
                /invalid s8 value/,
            );
        }
    });

    test.concurrent("u16/s16", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU16, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS16, AsyncFunction);

        let vals = [0, 100, 65535];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamU16(vals);
        await checkStreamValues({
            stream,
            vals,
            expectedValues: toTypedArrayChunks(Uint16Array, vals),
            typeName: "u16",
            assertEqFn: assert.deepEqual,
        });

        vals = [-32_768, 0, 32_767];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS16(vals);
        await checkStreamValues({
            stream,
            vals,
            expectedValues: toTypedArrayChunks(Int16Array, vals),
            typeName: "s16",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("u32/s32", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU32, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS32, AsyncFunction);

        let vals = [11, 22, 33];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamU32(vals);
        await checkStreamValues({
            stream,
            vals,
            expectedValues: toTypedArrayChunks(Uint32Array, vals),
            typeName: "u32",
            assertEqFn: assert.deepEqual,
        });

        vals = [-11, -22, -33];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS32(vals);
        await checkStreamValues({
            stream,
            vals,
            expectedValues: toTypedArrayChunks(Int32Array, vals),
            typeName: "s32",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("u64/s64", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU64, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS64, AsyncFunction);

        let vals = [0n, 100n, 65535n];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamU64(vals);
        await checkStreamValues({
            stream,
            vals,
            expectedValues: toTypedArrayChunks(BigUint64Array, vals),
            typeName: "u64",
            assertEqFn: assert.deepEqual,
        });

        let invalidVals = [-1n, 18446744073709551616n];
        for (const invalid of invalidVals) {
            await expect(() =>
                instance["jco:test-components/get-stream-async"].getStreamU64([invalid]),
            ).rejects.toThrow(/invalid u64 value/);
        }

        vals = [-32_768n, 0n, 32_767n];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS64(vals);
        await checkStreamValues({
            stream,
            vals,
            expectedValues: toTypedArrayChunks(BigInt64Array, vals),
            typeName: "s64",
            assertEqFn: assert.deepEqual,
        });

        invalidVals = [-9223372036854775809n, 9223372036854775808n];
        for (const invalid of invalidVals) {
            await expect(() =>
                instance["jco:test-components/get-stream-async"].getStreamS64([invalid]),
            ).rejects.toThrow(/invalid s64 value/);
        }
    });

    test.concurrent("f32/f64", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamF64, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamF32, AsyncFunction);

        let vals = [-300.01235, -1.5, -0.0, 0.0, 1.5, 300.01235];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamF32(vals);
        await checkStreamValues({
            stream,
            vals,
            expectedValues: toTypedArrayChunks(Float32Array, vals),
            typeName: "f32",
            assertEqFn: assert.deepEqual,
        });

        vals = [-300.01235, -1.5, -0.0, 0.0, 1.5, -300.01235];
        stream = await instance["jco:test-components/get-stream-async"].getStreamF64(vals);
        await checkStreamValues({
            stream,
            vals,
            expectedValues: toTypedArrayChunks(Float64Array, vals),
            typeName: "f64",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("string", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamString, AsyncFunction);

        let vals = ["hello", "world", "!"];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamString(vals);
        await checkStreamValues({ stream, vals, typeName: "string" });
    });

    test.concurrent("record", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamRecord, AsyncFunction);

        let vals = [
            { id: 1, idStr: "one" },
            { id: 2, idStr: "two" },
            { id: 3, idStr: "three" },
        ];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamRecord(vals);
        await checkStreamValues({ stream, vals, typeName: "record", assertEqFn: assert.deepEqual });
    });

    test.concurrent("variant", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamVariant, AsyncFunction);

        const vals = [
            { tag: "maybe-u32", val: 123 },
            { tag: "maybe-u32", val: null },
            { tag: "float", val: 123.1 },
            { tag: "str", val: "string-value" },
            { tag: "num", val: 1 },
        ];
        const stream = await instance["jco:test-components/get-stream-async"].getStreamVariant(vals);

        // Ensure first two values match
        await checkStreamValues({
            stream,
            vals: [
                // TODO: wit type representation smoothing mismatch,
                // non-nullable option<t> values are *not* wrapped as objects
                { tag: "maybe-u32", val: { tag: "some", val: 123 } },
                { tag: "maybe-u32", val: { tag: "none" } },
            ],
            partial: true,
            typeName: "variant<maybe-u32>",
            assertEqFn: assert.deepEqual,
        });

        // Check float member
        await checkStreamValues({
            stream,
            vals: vals.slice(2, 3),
            typeName: "variant<float>",
            partial: true,
            assertEqFn: (value, expected) => {
                {
                    assert.equal(value.tag, expected.tag);
                    assert.closeTo(value.val, expected.val, 0.00001);
                }
            },
        });

        // Check rest of values
        await checkStreamValues({
            stream,
            vals: vals.slice(3),
            typeName: "variant<rest>",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("tuple", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamTuple, AsyncFunction);

        let vals = [
            [0, 1, "first"],
            [2, 3, "second"],
            [3, 4, "third"],
        ];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamTuple(vals);
        await checkStreamValues({ stream, vals, typeName: "tuple", assertEqFn: assert.deepEqual });
    });

    test.concurrent("flags", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamFlags, AsyncFunction);

        let vals = [
            { first: true, second: false, third: false },
            { first: false, second: true, third: false },
            { first: false, second: false, third: true },
        ];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamFlags(vals);
        await checkStreamValues({ stream, vals, typeName: "flags", assertEqFn: assert.deepEqual });
    });

    test.concurrent("enum", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamEnum, AsyncFunction);

        let vals = ["first", "second", "third"];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamEnum(vals);
        await checkStreamValues({ stream, vals, typeName: "enum", assertEqFn: assert.deepEqual });
    });

    test.concurrent("option<string>", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamOptionString, AsyncFunction);

        let vals = ["present string", null];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamOptionString(vals);
        await checkStreamValues({
            stream,
            vals,
            typeName: "option<string>",
            assertEqFn: assert.deepEqual,
            expectedValues: [
                // TODO: wit type representation smoothing mismatch
                { tag: "some", val: "present string" },
                { tag: "none" },
            ],
        });
    });

    test.concurrent("list<u8>", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamListU8, AsyncFunction);
        let vals = [[0x01, 0x02, 0x03, 0x04, 0x05], new Uint8Array([0x05, 0x04, 0x03, 0x02, 0x01]), []];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamListU8(vals);

        await checkStreamValues({
            stream,
            vals,
            typeName: "list<u8>",
            assertEqFn: assert.deepEqual,
            expectedValues: toTypedArrays(Uint8Array, vals),
        });
    });

    test.concurrent("list<string>", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamListString, AsyncFunction);
        let vals = [["first", "second", "third"], []];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamListString(vals);
        await checkStreamValues({ stream, vals, typeName: "list<string>", assertEqFn: assert.deepEqual });
    });

    test.concurrent("list<u32, 5>", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamFixedListU32, AsyncFunction);
        let vals = [
            [1, 2, 3, 4, 5],
            [0, 0, 0, 0, 0],
        ];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamFixedListU32(vals);
        await checkStreamValues({ stream, vals, typeName: "list<u32, 5>", assertEqFn: assert.deepEqual });
        // TODO: test misuse of fixed length list
    });

    test.concurrent("list<record>", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamListRecord, AsyncFunction);
        let vals = [
            [{ id: 1, idStr: "one" }],
            [
                { id: 1, idStr: "one" },
                { id: 2, idStr: "two" },
            ],
            [
                { id: 1, idStr: "one" },
                { id: 2, idStr: "two" },
                { id: 3, idStr: "three" },
            ],
            [],
        ];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamListRecord(vals);
        await checkStreamValues({ stream, vals, typeName: "list<record>", assertEqFn: assert.deepEqual });
    });

    test.concurrent("result<string>", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamResultString, AsyncFunction);
        let vals = [
            { tag: "ok", val: "present string" },
            { tag: "err", val: "nope" },
        ];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamResultString(vals);
        await checkStreamValues({ stream, vals, typeName: "result<string>", assertEqFn: assert.deepEqual });
    });

    test.concurrent("example-resource", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamExampleResourceOwn, AsyncFunction);
        const disposeSymbol = Symbol.dispose || Symbol.for("dispose");

        let vals = [2, 1, 0];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamExampleResourceOwn(vals);
        const resources = [];
        const retrievedIds = [];
        for await (const resource of stream) {
            assert.isNotNull(resource);
            assert.instanceOf(resource, instance["jco:test-components/get-stream-async"].ExampleGuestResource);
            retrievedIds.push(resource.getId());
            resources.push(resource);
        }
        assert.deepEqual(retrievedIds, vals);

        const finished = await stream.next();
        assert.isTrue(finished.done);
        assert.isUndefined(finished.value);

        // NOTE: we have to pull all objects out of the stream and drop the stream,
        // *before* attempting to call async functions on the resources, to avoid
        // recursive re-entrancy into the same component instance
        //
        // We use the line below to *ensure* the stream is dropped, and
        // correspondingly (somewhat racily) that the async task the writer was undergoing is done.
        stream[disposeSymbol]();

        let numDisposed = 0;
        for (const resource of resources) {
            // NOTE: if runing async operations and sync operations too quickly, the sync operation *can*
            // fail to lock the component async state.
            let expectedID = resource.getId();
            assert.strictEqual(expectedID, await resource.getIdAsync());
            assert.doesNotThrow(() => resource[disposeSymbol]());
            numDisposed += 1;
            assert.strictEqual(
                instance["jco:test-components/get-stream-async"].getExampleResourceOwnDisposes(),
                numDisposed,
            );
        }
    });

    test.concurrent("example-resource#get-id", async () => {
        const instance = await getInstance();
        assert.instanceOf(
            instance["jco:test-components/get-stream-async"].getStreamExampleResourceOwnAttr,
            AsyncFunction,
        );
        let vals = [new ExampleResource(2), new ExampleResource(1), new ExampleResource(0)];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamExampleResourceOwnAttr(vals);

        await checkStreamValues({
            stream,
            vals,
            typeName: "example-resource#get-id (output)",
            expectedValues: [2, 1, 0],
        });
    });

    test.concurrent("stream<string>", async () => {
        const instance = await getInstance();
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamStreamString, AsyncFunction);
        let vals = ["first", "third", "second"];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamStreamString(vals);
        for (const v of vals) {
            const { value: nestedStream, done } = await stream.next();
            assert.isFalse(done);
            let nestedRes = await nestedStream.next();
            assert.isFalse(nestedRes.done);
            assert.strictEqual(nestedRes.value, v);
            nestedRes = await nestedStream.next();
            assert.isTrue(nestedRes.done);
            assert.isUndefined(nestedRes.value);
        }

        // The stream should be done after expected streams are produced
        const { value, done } = await stream.next();
        assert.isTrue(done);
        assert.isUndefined(value);
    });
});
