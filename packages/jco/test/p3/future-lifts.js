import { join } from "node:path";

import { suite, test, assert, beforeAll, beforeEach, afterAll, expect } from "vitest";

import { setupAsyncTest } from "../helpers.js";
import {
    AsyncFunction,
    LOCAL_TEST_COMPONENTS_DIR,
    checkFutureValues,
    createReadableStreamFromValues,
} from "../common.js";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

suite("future<T> lifts", () => {
    let esModule, cleanup, instance;

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
        const name = "future-tx";
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
        //console.log("OUTPUT DIR", setupRes.outputDir);
    });

    afterAll(async () => {
        await cleanup();
    });

    beforeEach(async () => {
        instance = await esModule.instantiate(undefined, {
            ...new WASIShim().getImportObject(),
            "jco:test-components/resources": {
                ExampleResource,
            },
        });
    });

    test.concurrent("bool", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureBool, AsyncFunction);
        const vals = [true, false];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureBool,
            typeName: "bool",
        });
    });

    test.concurrent("u8/s8", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureU8, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureS8, AsyncFunction);

        let vals = [0, 1, 255];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureU8,
            typeName: "u8",
        });

        let invalidVals = [-1, 256];
        for (const invalid of invalidVals) {
            await expect(() => instance["jco:test-components/get-future-async"].getFutureU8(invalid)).rejects.toThrow(
                /invalid u8 value/,
            );
        }

        vals = [-11, -22, -33, -128, 127];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureS8,
            typeName: "s8",
        });

        invalidVals = [-129, 128];
        for (const invalid of invalidVals) {
            await expect(() => instance["jco:test-components/get-future-async"].getFutureS8(invalid)).rejects.toThrow(
                /invalid s8 value/,
            );
        }
    });

    test.concurrent("u16/s16", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureU16, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureS16, AsyncFunction);

        let vals = [0, 100, 65535];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureU16,
            typeName: "u16",
        });

        vals = [-32_768, 0, 32_767];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureS16,
            typeName: "s16",
        });
    });

    test.concurrent("u32/s32", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureU32, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureS32, AsyncFunction);

        let vals = [11, 22, 33];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureU32,
            typeName: "u32",
        });

        vals = [-11, -22, -33];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureS32,
            typeName: "s32",
        });
    });

    test.concurrent("u64/s64", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureU64, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureS64, AsyncFunction);

        let vals = [0n, 100n, 65535n];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureU64,
            typeName: "u64",
        });

        let invalidVals = [-1n, 18446744073709551616n];
        for (const invalid of invalidVals) {
            await expect(() => instance["jco:test-components/get-future-async"].getFutureU64(invalid)).rejects.toThrow(
                /invalid u64 value/,
            );
        }

        vals = [-32_768n, 0n, 32_767n];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureS64,
            typeName: "s64",
        });

        invalidVals = [-9223372036854775809n, 9223372036854775808n];
        for (const invalid of invalidVals) {
            await expect(() => instance["jco:test-components/get-future-async"].getFutureS64(invalid)).rejects.toThrow(
                /invalid s64 value/,
            );
        }
    });

    test.concurrent("f32/f64", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureF64, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureF32, AsyncFunction);

        let vals = [-300.01235, -1.5, -0.0, 0.0, 1.5, 300.01235];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureF32,
            typeName: "f32",
            assertEqFn: (value, expected) => {
                assert.closeTo(value, expected, 0.00001);
            },
        });

        vals = [-300.01235, -1.5, -0.0, 0.0, 1.5, -300.01235];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureF64,
            typeName: "f64",
            assertEqFn: (value, expected) => {
                assert.closeTo(value, expected, 0.00001);
            },
        });
    });

    test.concurrent("string", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureString, AsyncFunction);

        let vals = ["hello", "world", "!"];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureString,
            typeName: "string",
        });
    });

    test.concurrent("record", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureRecord, AsyncFunction);

        let vals = [
            { id: 1, idStr: "one" },
            { id: 2, idStr: "two" },
            { id: 3, idStr: "three" },
        ];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureRecord,
            typeName: "record",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("variant", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureVariant, AsyncFunction);

        let vals = [
            { tag: "maybe-u32", val: 123 },
            { tag: "maybe-u32", val: null },
        ];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureVariant,
            typeName: "variant<maybe-u32>",
            expectedValues: [
                // TODO: wit type representation smoothing mismatch,
                // non-nullable option<t> values are *not* wrapped as objects
                { tag: "maybe-u32", val: { tag: "some", val: 123 } },
                { tag: "maybe-u32", val: { tag: "none" } },
            ],
            assertEqFn: assert.deepEqual,
        });

        vals = [{ tag: "float", val: 123.1 }];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureVariant,
            typeName: "variant<float>",
            assertEqFn: (value, expected) => {
                {
                    assert.equal(value.tag, expected.tag);
                    assert.closeTo(value.val, expected.val, 0.00001);
                }
            },
        });

        vals = [
            { tag: "str", val: "string-value" },
            { tag: "num", val: 1 },
        ];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureVariant,
            typeName: "variant<rest>",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("tuple", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureTuple, AsyncFunction);

        let vals = [
            [0, 1, "first"],
            [2, 3, "second"],
            [3, 4, "third"],
        ];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureTuple,
            typeName: "tuple",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("flags", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureFlags, AsyncFunction);

        let vals = [
            { first: true, second: false, third: false },
            { first: false, second: true, third: false },
            { first: false, second: false, third: true },
        ];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureFlags,
            typeName: "tuple",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("enum", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureEnum, AsyncFunction);

        let vals = ["first", "second", "third"];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureEnum,
            typeName: "enum",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("option<string>", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureOptionString, AsyncFunction);

        let vals = ["present string", null];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureOptionString,
            typeName: "option<string>",
            expectedValues: [
                // TODO: wit type representation smoothing mismatch
                { tag: "some", val: "present string" },
                { tag: "none" },
            ],
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("list<u8>", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureListU8, AsyncFunction);
        let vals = [[0x01, 0x02, 0x03, 0x04, 0x05], new Uint8Array([0x05, 0x04, 0x03, 0x02, 0x01]), []];

        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureListU8,
            typeName: "list<u8>",
            expectedValues: [
                // TODO: wit type representation smoothing mismatch
                vals[0],
                [...vals[1]],
                [],
            ],
            assertEqFn: assert.deepEqual,
        });
    });

    // TODO(fix): add tests for optimized UintXArrays (js_array_ty)

    test.concurrent("list<string>", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureListString, AsyncFunction);
        let vals = [["first", "second", "third"], []];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureListString,
            typeName: "list<string>",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("list<u32, 5>", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureFixedListU32, AsyncFunction);
        let vals = [
            [1, 2, 3, 4, 5],
            [0, 0, 0, 0, 0],
        ];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureFixedListU32,
            typeName: "list<u32, 5>",
            assertEqFn: assert.deepEqual,
        });
        // TODO: test misuse of fixed length list
    });

    test.concurrent("list<record>", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureListRecord, AsyncFunction);
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
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureListRecord,
            typeName: "list<record>",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("result<string>", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureResultString, AsyncFunction);
        let vals = [
            { tag: "ok", val: "present string" },
            { tag: "err", val: "nope" },
        ];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureResultString,
            typeName: "result<string>",
            assertEqFn: assert.deepEqual,
        });
    });

    test.concurrent("example-resource", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureExampleResourceOwn, AsyncFunction);
        const disposeSymbol = Symbol.dispose || Symbol.for("dispose");

        let vals = [2, 1, 0];
        const resources = [];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureExampleResourceOwn,
            typeName: "example-guest-resource",
            assertEqFn: (resource, expectedResourceId) => {
                assert.isNotNull(resource);
                assert.instanceOf(resource, instance["jco:test-components/get-future-async"].ExampleGuestResource);
                assert.strictEqual(resource.getId(), expectedResourceId);
                resources.push(resource);
            },
        });

        let numDisposed = 0;
        for (const resource of resources) {
            assert.strictEqual(resource.getId(), await resource.getIdAsync());
            assert.doesNotThrow(() => resource[disposeSymbol]());
            numDisposed += 1;
            assert.strictEqual(
                instance["jco:test-components/get-future-async"].getExampleResourceOwnDisposes(),
                numDisposed,
            );
        }
    });

    test.concurrent("example-resource#get-id", async () => {
        assert.instanceOf(
            instance["jco:test-components/get-future-async"].getFutureExampleResourceOwnAttr,
            AsyncFunction,
        );

        let vals = [new ExampleResource(2), new ExampleResource(1), new ExampleResource(0)];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureExampleResourceOwnAttr,
            typeName: "example-resource#get-id (output)",
            assertEqFn: assert.deepEqual,
            expectedValues: [2, 1, 0],
        });
    });

    test.concurrent("future<string>", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureFutureString, AsyncFunction);

        let vals = ["first", "third", "second"];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureFutureString,
            assertEqFn: async (v, expected) => {
                // NOTE: nested Promises are automatically resolved together/collapsed in JS.
                // by the time this assert eq function runs, the future will have been awaited
                // and nested inner future will *also* have been resolved.
                assert.strictEqual(v, expected);
            },
        });
    });

    test.concurrent("future<stream<string>> (spooled)", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureStreamStringSpool, AsyncFunction);

        let vals = [
            // NOTE: this fn takes a *list* of strings to return, and vals are used as input one at a time
            ["first", "third", "second"],
        ];
        await checkFutureValues({
            vals,
            func: instance["jco:test-components/get-future-async"].getFutureStreamStringSpool,
            assertEqFn: async (nestedStream, expected) => {
                let idx = 0;
                for await (const value of nestedStream) {
                    assert.strictEqual(value, expected[idx]);
                    idx++;
                }
            },
        });
    });

    // NOTE: when this test runs the host-only read/write optimization should be in place
    // this component is *not* acting like a spool for the values
    test.concurrent("future<stream<string>>", async () => {
        assert.instanceOf(instance["jco:test-components/get-future-async"].getFutureFutureString, AsyncFunction);

        let vals = [["first", "third", "second"]];
        let resIdx = 0;
        await checkFutureValues({
            vals: vals.map(createReadableStreamFromValues),
            func: instance["jco:test-components/get-future-async"].getFutureStreamString,
            assertEqFn: async (stream, _expected) => {
                let elemIdx = 0;
                for await (const value of stream) {
                    assert.strictEqual(value, vals[resIdx][elemIdx]);
                    elemIdx++;
                }
                resIdx++;
            },
        });
    });
});
