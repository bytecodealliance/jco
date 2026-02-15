import { join } from "node:path";

import { suite, test, assert } from "vitest";

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
        // TODO(tests): we should check that reading with no values remaining blocks?
        // TODO(tests): we should check that reading when writer is closed throws error?

        vals = [-11, -22, -33];
        stream = await instance["jco:test-components/get-stream-async"].getStreamS32(vals);
        assert.equal(vals[0], await stream.next());
        assert.equal(vals[1], await stream.next());
        assert.equal(vals[2], await stream.next());

        await cleanup();
    });
});
