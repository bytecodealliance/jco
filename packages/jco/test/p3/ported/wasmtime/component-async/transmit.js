import { join } from "node:path";

import { suite, test } from "vitest";

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/transmit.rs
//
suite("transmit scenario", () => {
    test.skip("callee & caller", async () => {
        let cleanup;

        try {
            const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-transmit-caller.wasm");
            const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-transmit-callee.wasm");
            const componentPath = await composeCallerCallee({
                callerPath,
                calleePath,
            });

            const res = await buildAndTranspile({
                componentPath,
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;
            void [instance, cleanup];

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip("callee", async () => {
        let cleanup;

        try {
            const componentPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-transmit-callee.wasm");
            const res = await buildAndTranspile({
                componentPath,
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;
            void [instance, cleanup];

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip("readiness", async () => {
        let cleanup;

        try {
            const componentPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-readiness.wasm");
            const res = await buildAndTranspile({
                componentPath,
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;
            void [instance, cleanup];

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
