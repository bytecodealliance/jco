import { join } from "node:path";
import { memoryUsage } from "node:process";

import { suite, test, expect, assert } from "vitest";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

import { setupAsyncTest } from "./helpers.js";
import { LOCAL_TEST_COMPONENTS_DIR } from "./common.js";

suite("imports", () => {
    // see: https://github.com/bytecodealliance/jco/issues/1676
    test.concurrent("host throw", async () => {
        const name = "host-instant-throw";
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                imports: {
                    ...new WASIShim().getImportObject(),
                    "jco:test-components/throw": {
                        throw: () => {
                            throw 42;
                        },
                    },
                },
            },
            // jco: {
            //     transpile: {
            //         extraArgs: {
            //             minify: false,
            //         },
            //     },
            // },
        });

        expect(instance["jco:test-components/local-run"].run).toThrow(42);

        await cleanup();
    });

    // see: https://github.com/bytecodealliance/jco/issues/1675
    test.only("host call loop", async () => {
        let ticks = 1000;

        const name = "host-call-loop-sync";
        const { instance, cleanup, outputDir } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                imports: {
                    ...new WASIShim().getImportObject(),
                    "jco:test-components/tick": {
                        tick: () => {
                            ticks -= 1;
                        },
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            },
        });

        console.log("OUTPUT DIR", outputDir);

        const before = memoryUsage();
        instance["jco:test-components/local-run-n"].run(ticks);
        assert.strictEqual(ticks, 0);
        const after = memoryUsage();
        const bytesUsed = after.rss - before.rss;
        console.log(`bytes used = ${bytesUsed / (1000 * 1000)}MB`);
        assert.isBelow(bytesUsed, 1000 * 1000 * 1, "no more than 1MB should be additionally used");

        await cleanup();
    });
});
