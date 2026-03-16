import { join } from "node:path";

import { suite, test, assert, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

import { setupAsyncTest } from "../helpers.js";
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from "../common.js";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

suite("stream<T> lifts", () => {
    let esModule, cleanup, instance;

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
    });

    afterAll(async () => {
        await cleanup();
    });

    beforeEach(async () => {
        instance = await esModule.instantiate(undefined, new WASIShim().getImportObject());
    });

    test("u32/s32", async () => {
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU32, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS32, AsyncFunction);

        let vals = [11, 22, 33];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamU32(vals);
        await checkStreamValues(stream, vals, "u32");

        vals = [-11, -22, -33];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS32(vals);
        await checkStreamValues(stream, vals, "s32");
    });

    test("bool", async () => {
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamBool, AsyncFunction);
        const vals = [true, false];
        const stream = await instance["jco:test-components/get-stream-async"].getStreamBool(vals);
        await checkStreamValues(stream, vals, "bool");
    });

    test("u16/s16", async () => {
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU16, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS16, AsyncFunction);

        let vals = [0, 100, 65535];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamU16(vals);
        await checkStreamValues(stream, vals, "u16");
        // TODO(fix): under/overflowing values hang

        vals = [-32_768, 0, 32_767];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS16(vals);
        await checkStreamValues(stream, vals, "u16");
        // TODO(fix): under/overflowing values hang
    });

    test("u64/s64", async () => {
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU64, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS64, AsyncFunction);

        let vals = [0n, 100n, 65535n];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamU64(vals);
        await checkStreamValues(stream, vals, "u64");
        // TODO(fix): under/overflowing values hang

        vals = [-32_768n, 0n, 32_767n];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS64(vals);
        await checkStreamValues(stream, vals, "s64");
        // TODO(fix): under/overflowing values hang
    });

    // // TODO(fix): stream gets stuck waiting, u8/s8 require special case
    test.skip("u8/s8", async () => {
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamU8, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamS8, AsyncFunction);

        // let vals = [0, 1, 255];
        // let stream = await instance["jco:test-components/get-stream-async"].getStreamU8(vals);
        // await checkStreamValues(stream, vals, "u8");
        //
        // vals = [-11, -22, -33, -128, 127, 128];
        // stream = await instance["jco:test-components/get-stream-async"].getStreamS8(vals);
        // assert.equal(vals[0], await stream.next());
        // assert.equal(vals[1], await stream.next());
        // assert.equal(vals[2], await stream.next());
        // assert.equal(vals[3], await stream.next());
        // assert.equal(vals[4], await stream.next());
    });

    test("f32/f64", async () => {
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamF64, AsyncFunction);
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamF32, AsyncFunction);

        let vals = [-300.01235, -1.5, -0.0, 0.0, 1.5, 300.01235];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamF32(vals);
        assert.closeTo(vals[0], await stream.next(), 0.00001);
        assert.closeTo(vals[1], await stream.next(), 0.00001);
        assert.closeTo(vals[2], await stream.next(), 0.00001);
        assert.closeTo(vals[3], await stream.next(), 0.00001);
        assert.closeTo(vals[4], await stream.next(), 0.00001);
        assert.closeTo(vals[5], await stream.next(), 0.00001);

        vals = [-300.01235, -1.5, -0.0, 0.0, 1.5, -300.01235];
        stream = await instance["jco:test-components/get-stream-async"].getStreamF64(vals);
        assert.closeTo(vals[0], await stream.next(), 0.00001);
        assert.closeTo(vals[1], await stream.next(), 0.00001);
        assert.closeTo(vals[2], await stream.next(), 0.00001);
        assert.closeTo(vals[3], await stream.next(), 0.00001);
        assert.closeTo(vals[4], await stream.next(), 0.00001);
        assert.closeTo(vals[5], await stream.next(), 0.00001);
    });

    test("string", async () => {
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamString, AsyncFunction);

        let vals = ["hello", "world", "!"];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamString(vals);
        await checkStreamValues(stream, vals, "string");
    });

    test.only("record", async () => {
        assert.instanceOf(instance["jco:test-components/get-stream-async"].getStreamRecord, AsyncFunction);

        let vals = [
            { id: 1, idStr: "one" },
            { id: 2, idStr: "two" },
            { id: 3, idStr: "three" },
        ];
        let stream = await instance["jco:test-components/get-stream-async"].getStreamRecord(vals);
        await checkStreamValues(stream, vals, "record");
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
