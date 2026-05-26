import { join } from "node:path";

import { suite, test } from "vitest";

import { buildAndTranspile, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/transmit.rs
//
suite("poll scenario", () => {
    test.skip("stackless", async () => {
        let cleanup;
        const componentPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-poll-stackless.wasm");
        try {
            const res = await buildAndTranspile({
                componentPath,
                // instantiation: {
                //     imports: {
                //         "local:local/borrowing-types": {
                //             X: class XResource {
                //                 foo() {
                //                     calls += 1;
                //                 }
                //             },
                //         },
                //     },
                // },

                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            await instance["local:local/run"].run();

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip("synchronous", async () => {
        let cleanup;
        const componentPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-poll-synchronous.wasm");
        try {
            const res = await buildAndTranspile({
                componentPath,
                // instantiation: {
                //     imports: {
                //         "local:local/borrowing-types": {
                //             X: class XResource {
                //                 foo() {
                //                     calls += 1;
                //                 }
                //             },
                //         },
                //     },
                // },

                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            await instance["local:local/run"].run();

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
