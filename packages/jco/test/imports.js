import { join } from "node:path";

import { suite, test, expect } from "vitest";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

import { setupAsyncTest } from "./helpers.js";
import { LOCAL_TEST_COMPONENTS_DIR } from "./common.js";

suite("imports", () => {
    // see: https://github.com/bytecodealliance/jco/issues/1676
    test("host throw", async () => {
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
});
