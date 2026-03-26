import { join } from "node:path";

import { assert, suite, test } from "vitest";

import { buildAndTranspile, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/streams.rs
//
suite("closed stream scenario", () => {
    test("sync instantly dropped stream", async () => {
        const componentPath = join(COMPONENT_FIXTURES_DIR, "p3/streams/async-closed-stream.wasm");
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                transpile: {
                    extraArgs: {
                        minify: false,
                    }
                }
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            const stream = instance["local:local/closed-stream"].get();
            const v = await stream.next();
            assert.strictEqual(v, undefined);

        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
