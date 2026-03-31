import { join } from "node:path";

import { suite, test } from "vitest";

const { WASIShim } = await import("@bytecodealliance/preview2-shim/instantiation");

import { COMPONENT_FIXTURES_DIR } from "./common.js";
import { createReadableStreamFromValues } from "../../../../common.js";
import { setupAsyncTest } from "../../../../helpers.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/streams.rs
//
suite("read resource stream", () => {
    test.skip("component", async () => {
        class X {
            foo() {}
        }

        const name = "async-read-resource-stream";
        const { esModule, cleanup } = await setupAsyncTest({
            asyncMode: "jspi",
            component: {
                name,
                path: join(COMPONENT_FIXTURES_DIR, `p3/streams/${name}.wasm`),
                skipInstantiation: true,
            },
            // jco: {
            //     transpile: {
            //         extraArgs: {
            //             minify: false,
            //         },
            //     },
            // },
        });

        const instance = await esModule.instantiate(undefined, {
            ...new WASIShim().getImportObject(),
            "local:local/resource-stream": {
                X,
                foo: (count) => {
                    return createReadableStreamFromValues(
                        [...new Array(count)].map(() => new X())
                    );
                },
            },
        });

        // TODO(fix): broken due to lower stream from host being broken

        await instance["local:local/run"].run();

        await cleanup();
    });
});
