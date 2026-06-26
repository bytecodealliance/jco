import { join } from "node:path";

import { suite, test } from "vitest";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

import { setupAsyncTest } from "./helpers.js";
import { LOCAL_TEST_COMPONENTS_DIR } from "./common.js";

suite("imports", () => {
    // see: https://github.com/bytecodealliance/jco/issues/1675
    test("host call loop", async () => {
        const name = "host-call-loop-sync";
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                imports: {
                    ...new WASIShim().getImportObject(),
                    "jco:test-components/tick": {
                        tick: { default: () => { } }
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

        instance["jco:test-components/local-run-n"].run(1000);

        await cleanup();
    });
});
