import { join } from "node:path";

import { suite, test } from "vitest";

import { buildAndTranspile, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/streams.rs
//
suite.skip("inter-task communications scenario", () => {
    test("component", async () => {
        const componentPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-intertask-communication.wasm");
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     }
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            // TODO(fix): requires futures!

            await instance["local:local/run"].run();
            await instance["local:local/run"].run();
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
