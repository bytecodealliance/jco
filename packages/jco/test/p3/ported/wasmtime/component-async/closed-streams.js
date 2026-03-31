import { join } from "node:path";

import { suite, test } from "vitest";

import { buildAndTranspile, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/streams.rs
//
suite.skip("closed streams scenario", () => {
    test("host->host", async () => {
        // TODO: use direct & indirect producer, direct & indirect consumer (all combinations)
        // TODO: create 2 host streams which will send 1 object
        // TODO: create an array of values to send (3)
        // TODO: create an single value
        // TODO: at the same time:
        //     - send all the values on the stream, then drop the stream
        //     - wait to get the values out (options that contain a value), then get an null
        // TODO: Wait for both to complete
    });

    test("host->guest", async () => {
        const componentPath = join(COMPONENT_FIXTURES_DIR, "p3/streams/async-closed-streams.wasm");
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                component: {
                    path: componentPath,
                    skipInstantiation: true,
                },
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            });
            cleanup = res.cleanup;

            // TODO: create single element stream on host side (tx, rx)
            // TODO: create listof values (3 u32s is fine)
            // TODO: At the same time:
            //     - send all values down the stream
            //     - call the read_stream guest export (local:local/closed#read-stream), w/ values
            // TODO: Wait for both to complete
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
