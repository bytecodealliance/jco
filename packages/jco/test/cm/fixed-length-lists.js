import { join } from "node:path";

import { suite, test, assert } from "vitest";

import { setupAsyncTest } from "../helpers.js";
import { LOCAL_TEST_COMPONENTS_DIR } from "../common.js";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

suite("fixed length lists", () => {
    test("transpile", async () => {
        const { cleanup, instance } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, "fixed-length-lists.wasm"),
                imports: new WASIShim().getImportObject(),
            },
            // jco: {
            //     transpile: {
            //         extraArgs: {
            //             minify: false,
            //         }
            //     },
            // },
        });

        const input = [...new Array(17)].map(() => Math.random() <= 0.5);
        const output = instance["jco:test-components/fixed-length-lists-fn"].takesReturnsFixed(input);
        assert.lengthOf(output, 32);
        assert.deepEqual(output, input.map(Number).concat([...new Array(32 - 17)].map(() => 0)));

        await cleanup();
    });
});
