import { join } from "node:path";

import { suite, test } from "vitest";

import { COMPONENT_FIXTURES_DIR } from "./common.js";
import { setupAsyncTest } from "../../../../helpers.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/streams.rs
//
suite("read resource stream", () => {
    test("component", async () => {
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

        // TODO(fix): broken due to _isHostProvided

        const instance = await esModule.instantiate(undefined, {
            "local:local/resource-stream": {
                X,
            },
        });

        await instance["local:local/run"].get();

        await cleanup();
    });
});
