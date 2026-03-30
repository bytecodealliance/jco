import { join } from "node:path";

import { suite, test } from "vitest";

import { buildAndTranspile, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/streams.rs
//
suite.skip("short reads scenario", () => {
    test("component", async () => {
        const componentPath = join(COMPONENT_FIXTURES_DIR, "p3/streams/async-short-reads.wasm");
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
            // const instance = res.instance;
            cleanup = res.cleanup;

            // TODO: get Thing class from instance
            // TODO: create strings = ["a", "b", "c", "d", "e"]
            // TODO: create things array that is the same length, fill with things with every string as input
            // TODO: create host stream of things array
            // TODO: call short reads passing in a stream, will get a stream back out
            // TODO: read every item of stream one at a time

            // TODO: wait until we've received N things
            // TODO: Get all values out of the things

            // TODO: compare with the strings array (order matters)
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
