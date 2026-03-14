import { join } from "node:path";

import { suite, test, assert, expect, vi } from "vitest";

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
                        minify: false,
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
        await checkStreamValues(stream, vals, "u32");

        vals = [true, false];
        stream = await instance["jco:test-components/get-stream-async"].getStreamBool(vals);
        await checkStreamValues(stream, vals, "u32");

        vals = [-11, -22, -33];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS32(vals);
        await checkStreamValues(stream, vals, "u32");

        // TODO(fix): attempting to stream non-null/numeric values traps, and the component cannot currently recover
        // TODO(fix): this is *not* a inter-component non-null/numeric value send!
        //
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

        // TODO(fix): we're stuck waiting for the previous task to complete?? It's waiting for waitable set?
        // read end needs to be dropped at some point, and it's not!
        vals = [0, 100, 65535];
        stream = await instance["jco:test-components/get-stream-async"].getStreamU16(vals);
        await checkStreamValues(stream, vals, "u32");
        // TODO(fix): under/overflowing values hang

        vals = [-32_768, 0, 32_767];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS16(vals);
        await checkStreamValues(stream, vals, "u32");
        // TODO(fix): under/overflowing values hang

        vals = [0n, 100n, 65535n];
        stream = await instance["jco:test-components/get-stream-async"].getStreamU64(vals);
        await checkStreamValues(stream, vals, "u32");
        // TODO(fix): under/overflowing values hang

        vals = [-32_768n, 0n, 32_767n];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS64(vals);
        await checkStreamValues(stream, vals, "u32");
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
});

async function checkStreamValues(stream, vals, typeName) {
    for (const [idx, expected] of vals.entries()) {
        assert.equal(expected, await stream.next(), `${typeName} [${idx}] read is incorrect`);
    }

    // If we get this far, the fourth read will do one of the following:
    //  - time out (hung during wait for writer that will never come)
    //  - report write end was dropped during the read (guest finished writing)
    //  - read end is fully closed after write
    //
    await expect(
        vi.waitUntil(
            async () => {
                await stream.next();
                return true; // we should never get here, as we s error should occur
            },
            { timeout: 500, interval: 0 },
        ),
    ).rejects.toThrowError(/timed out|read end is closed|write end dropped during read/i);
}
