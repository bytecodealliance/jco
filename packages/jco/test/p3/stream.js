import { join } from "node:path";

import { suite, test, assert, vi, expect } from "vitest";

import { setupAsyncTest } from "../helpers.js";
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from "../common.js";

suite("Stream (WASI P3)", () => {
    test("stream<u32> (tx)", async () => {
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

        vals = [11, 22, 33];
        stream = await instance["jco:test-components/get-stream-async"].getStreamU32(vals);
        assert.equal(vals[0], await stream.next(), "first u32 read is incorrect");
        assert.equal(vals[1], await stream.next(), "second u32 read is incorrect");
        assert.equal(vals[2], await stream.next(), "third u32 read is incorrect");
        // The fourth read should error, as the writer should have been dropped after writing three values.
        //
        // If the writer is dropped while the host attempts a read, the reader should error
        await expect(vi.waitUntil(
            async () => {
                await stream.next();
                return true; // we should never get here, as an error should occur
            },
            { timeout: 500, interval: 0 },
        )).rejects.toThrowError(/dropped/);

        // vals = [-11, -22, -33];
        // stream = await instance["jco:test-components/get-stream-async"].getStreamS32(vals);
        // assert.equal(vals[0], await stream.next());
        // assert.equal(vals[1], await stream.next());
        // assert.equal(vals[2], await stream.next());

        await cleanup();
    });
});
