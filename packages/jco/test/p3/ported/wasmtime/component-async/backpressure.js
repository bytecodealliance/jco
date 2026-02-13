import { join } from "node:path";

import { suite, test } from "vitest";

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/backpressure.rs
//
suite("backpressure scenario", () => {
    test("caller & callee", async () => {
        const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/backpressure/async-backpressure-caller.wasm");
        const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/backpressure/async-backpressure-callee.wasm");
        const componentPath = await composeCallerCallee({
            callerPath,
            calleePath,
        });

        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            });
            const instance = res.instance;
            cleanup = res.cleanup;
            await instance["local:local/run"].run();
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
