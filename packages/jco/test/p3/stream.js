import { join } from "node:path";

import { suite, test, assert, expect } from "vitest";

import { setupAsyncTest } from "../helpers.js";
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from "../common.js";

suite("Stream (WASI P3)", () => {
    test("stream<_> (tx)", async () => {
        const name = "stream-tx";
        const { esModule, cleanup } = await setupAsyncTest({
            asyncMode: "jspi",
            component: {
                name,
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        // minify: false,
                        asyncExports: [
                            "jco:test-components/get-stream-async#get-stream-u32",
                            "jco:test-components/get-stream-async#get-stream-s32",
                            "jco:test-components/get-stream-async#get-stream-bool",
                            "jco:test-components/get-stream-async#get-stream-u8",
                            "jco:test-components/get-stream-async#get-stream-s8",
                            "jco:test-components/get-stream-async#get-stream-u16",
                            "jco:test-components/get-stream-async#get-stream-s16",
                            "jco:test-components/get-stream-async#get-stream-u64",
                            "jco:test-components/get-stream-async#get-stream-s64",
                            "jco:test-components/get-stream-async#get-stream-f32",
                            "jco:test-components/get-stream-async#get-stream-f64",
                        ],
                    },
                },
            },
        });

        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
        const instance = await esModule.instantiate(undefined, new WASIShim().getImportObject());

        let vals;
        let stream;

        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU32, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS32, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamBool, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU8, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS8, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU16, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS16, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU64, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS64, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamF64, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamF32, AsyncFunction);

        vals = [11, 22, 33];
        stream = await instance["jco:test-components/get-stream-async"].getStreamU32(vals);
        assert.equal(vals[0], await stream.next(), "first u32 read is incorrect");
        assert.equal(vals[1], await stream.next(), "second u32 read is incorrect");
        assert.equal(vals[2], await stream.next(), "third u32 read is incorrect");

        // TODO(fix): re-enable this test, once we wait for writes and reject after drop()/closure of writer
        //
        // // The fourth read should error, as the writer should have been dropped after writing three values.
        // //
        // // If the writer is dropped while the host attempts a read, the reader should error
        // await expect(vi.waitUntil(
        //     async () => {
        //         await stream.next();
        //         return true; // we should never get here, as an error should occur
        //     },
        //     { timeout: 500, interval: 0 },
        // )).rejects.toThrowError(/dropped/);

        vals = [-11, -22, -33];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS32(vals);
        assert.equal(vals[0], await stream.next());
        assert.equal(vals[1], await stream.next());
        assert.equal(vals[2], await stream.next());

        // TODO(fix): attempting to stream non-null/numeric values traps, and the component cannot currently recover
        // vals = [true];
        // stream = await instance["jco:test-components/get-stream-async"].getStreamBool(vals);
        // await expect(() => stream.next()).rejects.toThrowError(/cannot stream non-numeric types within the same component/);

        // // TODO(fix): stream produces invalid values here (undefined),
        // // likely due to, streams of u8/s8s needing to be a special case
        // vals = [0, 1, 255];
        // stream = await instance["jco:test-components/get-stream-async"].getStreamU8(vals);
        // assert.equal(vals[0], await stream.next());
        // assert.equal(vals[1], await stream.next());
        // assert.equal(vals[2], await stream.next());

        // // TODO(fix): stream gets stuck waiting, u8/s8 require special case
        // vals = [-11, -22, -33, -128, 127, 128];
        // stream = await instance["jco:test-components/get-stream-async"].getStreamS8(vals);
        // assert.equal(vals[0], await stream.next());
        // assert.equal(vals[1], await stream.next());
        // assert.equal(vals[2], await stream.next());
        // assert.equal(vals[3], await stream.next());
        // assert.equal(vals[4], await stream.next());

        vals = [0, 100, 65535];
        stream = await instance["jco:test-components/get-stream-async"].getStreamU16(vals);
        assert.equal(vals[0], await stream.next());
        assert.equal(vals[1], await stream.next());
        assert.equal(vals[2], await stream.next());
        // TODO(fix): under/overflowing values hang

        vals = [-32_768, 0, 32_767];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS16(vals);
        assert.equal(vals[0], await stream.next());
        assert.equal(vals[1], await stream.next());
        assert.equal(vals[2], await stream.next());
        // TODO(fix): under/overflowing values hang

        vals = [0n, 100n, 65535n];
        stream = await instance["jco:test-components/get-stream-async"].getStreamU64(vals);
        assert.equal(vals[0], await stream.next());
        assert.equal(vals[1], await stream.next());
        assert.equal(vals[2], await stream.next());
        // TODO(fix): under/overflowing values hang

        vals = [-32_768n, 0n, 32_767n];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS64(vals);
        assert.equal(vals[0], await stream.next());
        assert.equal(vals[1], await stream.next());
        assert.equal(vals[2], await stream.next());
        // TODO(fix): under/overflowing values hang

        // // TODO(fix): add better edge cases
        // // TODO(fix): valid values hang
        // vals = [-300.01235, -1.5, -0.0, 0.0, 1.5, 300.01235 ];
        // stream = await instance["jco:test-components/get-stream-async"].getStreamF32(vals);
        // assert.closeTo(vals[0], await stream.next(), 0.00001);
        // assert.closeTo(vals[1], await stream.next(), 0.00001);
        // assert.closeTo(vals[2], await stream.next(), 0.00001);
        // assert.closeTo(vals[3], await stream.next(), 0.00001);
        // assert.closeTo(vals[4], await stream.next(), 0.00001);
        // assert.closeTo(vals[5], await stream.next(), 0.00001);

        // // TODO(fix): add better edge cases
        // // TODO(fix): valid values hang
        // vals = [-300.01235, -1.5, -0.0, 0.0, 1.5, -300.01235 ];
        // stream = await instance["jco:test-components/get-stream-async"].getStreamF64(vals);
        // assert.closeTo(vals[0], await stream.next(), 0.00001);
        // assert.closeTo(vals[1], await stream.next(), 0.00001);
        // assert.closeTo(vals[2], await stream.next(), 0.00001);
        // assert.closeTo(vals[3], await stream.next(), 0.00001);
        // assert.closeTo(vals[4], await stream.next(), 0.00001);
        // assert.closeTo(vals[5], await stream.next(), 0.00001);

        await cleanup();
    });

    test("stream<bool> (tx, traps)", async () => {
        const name = "stream-tx";
        const { esModule, cleanup } = await setupAsyncTest({
            asyncMode: "jspi",
            component: {
                name,
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                skipInstantiation: true,
            },
            jco: {
                transpile: {
                    extraArgs: {
                        // minify: false,
                        asyncExports: ["jco:test-components/get-stream-async#get-stream-bool"],
                    },
                },
            },
        });

        const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");
        const instance = await esModule.instantiate(undefined, new WASIShim().getImportObject());

        let vals;
        let stream;

        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamBool, AsyncFunction);

        // TODO(fix): fix this should *not* trap, as the buffer is ont he host side/already passed outside the component
        vals = [true];
        stream = await instance["jco:test-components/get-stream-async"].getStreamBool(vals);
        await expect(() => stream.next()).rejects.toThrowError(
            /cannot stream non-numeric types within the same component/,
        );

        await cleanup();
    });
});
