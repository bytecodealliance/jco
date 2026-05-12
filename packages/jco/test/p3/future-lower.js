import { join } from "node:path";

import { suite, test, assert, beforeAll, afterAll, describe, expect } from "vitest";

import { setupAsyncTest } from "../helpers.js";
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR, toTypedArray } from "../common.js";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

suite("future<T> lowers", () => {
    let esModule, cleanup, getInstance, instance;

    class ExampleResource {
        #id;

        dropped = false;

        constructor(id) {
            this.#id = id;
        }

        getId() {
            return this.#id;
        }
    }

    beforeAll(async () => {
        const name = "future-lower";
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

    describe("sync", () => {
        test.concurrent("sync passthrough", async () => {
            const instance = await getInstance();
            assert.notInstanceOf(instance["jco:test-components/future-lower-sync"].futurePassthrough, AsyncFunction);

            let vals = [0, 5, 10];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-sync"].futurePassthrough(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        // Test late writer -- component should block until a value is written,
        // and we should handle a final value + done from an iterator properly
        test.concurrent("sync passthrough (slow writer)", async () => {
            const instance = await getInstance();
            assert.notInstanceOf(instance["jco:test-components/future-lower-sync"].futurePassthrough, AsyncFunction);

            const delayed = new Promise((resolve) => setTimeout(() => resolve(42), 300));
            assert.strictEqual(await instance["jco:test-components/future-lower-sync"].futurePassthrough(delayed), 42);
        });
    });

    describe("async", () => {
        test.concurrent("async passthrough", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].futurePassthrough, AsyncFunction);

            let vals = [10, 5, 0];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-async"].futurePassthrough(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        test.concurrent("async passthrough (slow writer)", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].futurePassthrough, AsyncFunction);

            const delayed = new Promise((resolve) => setTimeout(() => resolve(42), 300));
            assert.strictEqual(await instance["jco:test-components/future-lower-async"].futurePassthrough(delayed), 42);
        });

        test.concurrent("bool", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueBool, AsyncFunction);

            let vals = [true, false];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueBool(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        test.concurrent("u8/s8", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueU8, AsyncFunction);
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueS8, AsyncFunction);

            let vals = [0, 1, 255];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueU8(Promise.resolve(v)),
                    vals[idx],
                );
            }

            vals = [-128, 0, 1, 127];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueS8(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        test.concurrent("u16/s16", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueU16, AsyncFunction);
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueS16, AsyncFunction);

            let vals = [0, 100, 65535];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueU16(Promise.resolve(v)),
                    vals[idx],
                );
            }

            vals = [-32_768, 0, 32_767];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueS16(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        test.concurrent("u32/s32", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueU32, AsyncFunction);
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueS32, AsyncFunction);

            let vals = [10, 5, 0];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueU32(Promise.resolve(v)),
                    vals[idx],
                );
            }

            vals = [-32, 90001, 3200000];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueS32(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        test.concurrent("u64/s64", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueU64, AsyncFunction);
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueS64, AsyncFunction);

            let vals = [0n, 100n, 65535n];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueU64(Promise.resolve(v)),
                    vals[idx],
                );
            }

            vals = [-32_768n, 0n, 32_767n];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueS64(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        test.concurrent("f32/f64", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueF32, AsyncFunction);
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueF64, AsyncFunction);

            let vals = [-300.01235, -1.5, -0.0, 0.0, 1.5, 300.01235];
            for (const [idx, v] of vals.entries()) {
                assert.closeTo(
                    await instance["jco:test-components/future-lower-async"].readFutureValueF32(Promise.resolve(v)),
                    vals[idx],
                    0.01,
                );
                assert.closeTo(
                    await instance["jco:test-components/future-lower-async"].readFutureValueF64(Promise.resolve(v)),
                    vals[idx],
                    0.01,
                );
            }

            vals = [-60000.01235, -1.5, -0.0, 0.0, 1.5, -60000.01235];
            for (const [idx, v] of vals.entries()) {
                assert.closeTo(
                    await instance["jco:test-components/future-lower-async"].readFutureValueF32(Promise.resolve(v)),
                    vals[idx],
                    0.01,
                );
                assert.closeTo(
                    await instance["jco:test-components/future-lower-async"].readFutureValueF64(Promise.resolve(v)),
                    vals[idx],
                    0.01,
                );
            }
        });

        test.concurrent("string", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueString, AsyncFunction);

            let vals = ["hello", "world", "!"];
            for (const [idx, v] of vals.entries()) {
                assert.strictEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueString(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        test.concurrent("record", async () => {
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueRecord, AsyncFunction);

            let vals = [
                { id: 3, idStr: "three" },
                { id: 2, idStr: "two" },
                { id: 1, idStr: "one" },
            ];
            for (const [idx, v] of vals.entries()) {
                assert.deepEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueRecord(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        // TODO(FIX): https://github.com/bytecodealliance/jco/issues/1428
        test.skip("variant", async () => {
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueVariant, AsyncFunction);

            let vals = [
                { tag: "maybe-u32", val: 123 },
                { tag: "maybe-u32", val: null },
                { tag: "str", val: "string-value" },
                { tag: "num", val: 1 },
            ];
            let expected = [
                // TODO: wit type representation smoothing mismatch
                { tag: "maybe-u32", val: { tag: "some", val: 123 } },
                { tag: "maybe-u32", val: { tag: "none" } },
                { tag: "str", val: "string-value" },
                { tag: "num", val: 1 },
            ];
            for (const [idx, v] of vals.entries()) {
                assert.deepEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueVariant(Promise.resolve(v)),
                    expected[idx],
                    0.01,
                );
            }

            vals = [{ tag: "float", val: 123.1 }];
            for (const [idx, v] of vals.entries()) {
                const returned = await instance["jco:test-components/future-lower-async"].readFutureValueVariant(
                    Promise.resolve(v),
                );
                assert.closeTo(returned.val, vals[idx].val, 0.01);
            }
        });

        // TODO(FIX): https://github.com/bytecodealliance/jco/issues/1428
        test.skip("tuple", async () => {
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueTuple, AsyncFunction);

            let vals = [
                [1, -1, "one"],
                [2, -2, "two"],
                [3, -3, "two"],
            ];
            for (const [idx, v] of vals.entries()) {
                assert.deepEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueTuple(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        test.concurrent("flags", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueFlags, AsyncFunction);

            let vals = [
                { first: true, second: false, third: false },
                { first: false, second: true, third: false },
                { first: false, second: false, third: true },
            ];
            for (const [idx, v] of vals.entries()) {
                assert.deepEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueFlags(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        test.concurrent("enum", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueEnum, AsyncFunction);

            let vals = ["first", "second", "third"];
            for (const [idx, v] of vals.entries()) {
                assert.deepEqual(
                    await instance["jco:test-components/future-lower-async"].readFutureValueEnum(Promise.resolve(v)),
                    vals[idx],
                );
            }
        });

        test.concurrent("option<string>", async () => {
            const instance = await getInstance();
            assert.instanceOf(
                instance["jco:test-components/future-lower-async"].readFutureValueOptionString,
                AsyncFunction,
            );

            let vals = ["present string", null];
            let returnedVals = [];
            for (const v of vals) {
                returnedVals.push(
                    await instance["jco:test-components/future-lower-async"].readFutureValueOptionString(
                        Promise.resolve(v),
                    ),
                );
            }
            assert.deepEqual(returnedVals, [
                // TODO: wit type representation smoothing mismatch
                { tag: "some", val: "present string" },
                { tag: "none" },
            ]);
        });

        // TODO(FIX): it's returning the actual nope value if it's an error??
        // A future that resolves to an error actually gets thrown!
        test.concurrent("result<string>", async () => {
            const instance = await getInstance();
            assert.instanceOf(
                instance["jco:test-components/future-lower-async"].readFutureValueResultString,
                AsyncFunction,
            );

            let vals = [{ tag: "ok", val: "present string" }, "bare string (ok)"];
            let returnedVals = [];
            for (const v of vals) {
                returnedVals.push(
                    await instance["jco:test-components/future-lower-async"].readFutureValueResultString(
                        Promise.resolve(v),
                    ),
                );
            }
            assert.deepEqual(returnedVals, ["present string", "bare string (ok)"]);

            // NOTE: Result errors (result<string>) are converted into JS errors,
            // and when passed through a Promise, they throw.
            vals = [{ tag: "err", val: "nope" }];
            for (const v of vals) {
                await expect(
                    instance["jco:test-components/future-lower-async"].readFutureValueResultString(Promise.resolve(v)),
                ).rejects.toThrow(v.val);
            }

            await expect(
                instance["jco:test-components/future-lower-async"].readFutureValueResultString(
                    Promise.reject("rejected result payload"),
                ),
            ).rejects.toThrow("rejected result payload");
        });

        test.concurrent("list<u8>", async () => {
            const instance = await getInstance();
            assert.instanceOf(instance["jco:test-components/future-lower-async"].readFutureValueListU8, AsyncFunction);

            let vals = [[0x01, 0x02, 0x03, 0x04, 0x05], new Uint8Array([0x05, 0x04, 0x03, 0x02, 0x01]), []];
            let returnedVals = [];
            for (const v of vals) {
                returnedVals.push(
                    await instance["jco:test-components/future-lower-async"].readFutureValueListU8(Promise.resolve(v)),
                );
            }
            assert.deepEqual(
                returnedVals,
                vals.map((value) => toTypedArray(Uint8Array, value)),
            );
        });

        test.concurrent("list<string>", async () => {
            const instance = await getInstance();
            assert.instanceOf(
                instance["jco:test-components/future-lower-async"].readFutureValueListString,
                AsyncFunction,
            );

            let vals = [["first", "second", "third"], []];
            let returnedVals = [];
            for (const v of vals) {
                returnedVals.push(
                    await instance["jco:test-components/future-lower-async"].readFutureValueListString(
                        Promise.resolve(v),
                    ),
                );
            }
            assert.deepEqual(returnedVals, vals);
        });

        test.concurrent("list<list<u32, 5>>", async () => {
            const instance = await getInstance();
            assert.instanceOf(
                instance["jco:test-components/future-lower-async"].readFutureValueFixedListU32,
                AsyncFunction,
            );

            let vals = [[1, 2, 3, 4, 5], [0, 0, 0, 0, 0], new Uint32Array([0x05, 0x04, 0x03, 0x02, 0x01])];
            let returnedVals = [];
            for (const v of vals) {
                returnedVals.push(
                    await instance["jco:test-components/future-lower-async"].readFutureValueFixedListU32(
                        Promise.resolve(v),
                    ),
                );
            }
            assert.deepEqual(returnedVals, [
                [1, 2, 3, 4, 5],
                [0, 0, 0, 0, 0],
                [0x05, 0x04, 0x03, 0x02, 0x01],
            ]);
        });

        test.concurrent("list<example-record>", async () => {
            const instance = await getInstance();
            assert.instanceOf(
                instance["jco:test-components/future-lower-async"].readFutureValueListRecord,
                AsyncFunction,
            );

            let vals = [
                [
                    { id: 3, idStr: "three" },
                    { id: 2, idStr: "two" },
                    { id: 1, idStr: "one" },
                ],
                [
                    { id: 1, idStr: "one-one" },
                    { id: 2, idStr: "two-two" },
                    { id: 3, idStr: "three-three" },
                ],
            ];
            let returnedVals = [];
            for (const v of vals) {
                returnedVals.push(
                    await instance["jco:test-components/future-lower-async"].readFutureValueListRecord(
                        Promise.resolve(v),
                    ),
                );
            }
            assert.deepEqual(returnedVals, vals);
        });

        test.concurrent("example-resource", async () => {
            const instance = await getInstance();
            assert.instanceOf(
                instance["jco:test-components/future-lower-async"].readFutureValueExampleResourceOwn,
                AsyncFunction,
            );

            let vals = [new ExampleResource(0), new ExampleResource(1), new ExampleResource(2)];
            let returnedVals = [];
            for (const v of vals) {
                returnedVals.push(
                    await instance["jco:test-components/future-lower-async"].readFutureValueExampleResourceOwn(
                        Promise.resolve(v),
                    ),
                );
            }
            // TODO(fix): we should be able to ensure destructor call, at some point
            // see: https://github.com/bytecodealliance/jco/issues/989
            // assert(vals.every(r => r.dropped));
        });

        test.concurrent("example-resource#get-id", async () => {
            const instance = await getInstance();
            assert.instanceOf(
                instance["jco:test-components/future-lower-async"].readFutureValueExampleResourceOwnAttr,
                AsyncFunction,
            );

            let vals = [2, 1, 0];
            let returnedVals = [];
            for (const v of vals) {
                returnedVals.push(
                    await instance["jco:test-components/future-lower-async"].readFutureValueExampleResourceOwnAttr(
                        Promise.resolve(new ExampleResource(v)),
                    ),
                );
            }
            assert.deepEqual(returnedVals, [2, 1, 0]);
        });

        // NOTE: NodeJS will *collapse* a future<future<t>> -- Promise<Promise<T>> is turned into Promise<T>
        // TODO: implement flat lower for (inner) future<t>
        test.skip("future<string>", async () => {
            const instance = await getInstance();
            assert.instanceOf(
                instance["jco:test-components/future-lower-async"].readFutureValueFutureString,
                AsyncFunction,
            );

            let vals = [
                Promise.resolve(["first", "future", "values"]),
                Promise.resolve(["second", "future", "here"]),
                Promise.resolve(["third", "values", "in future"]),
            ];
            let returnedVals = [];
            for (const v of vals) {
                returnedVals.push(
                    await instance["jco:test-components/future-lower-async"].readFutureValueFutureString(
                        Promise.resolve(v),
                    ),
                );
            }
            assert.deepEqual(returnedVals, [
                ["first", "future", "values"],
                ["second", "future", "here"],
                ["third", "values", "in future"],
            ]);
        });
    });
});
