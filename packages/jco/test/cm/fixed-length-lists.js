import { join } from "node:path";

import { suite, test } from "vitest";

import { setupAsyncTest } from "../helpers.js";
import { LOCAL_TEST_COMPONENTS_DIR } from "../common.js";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

suite("fixed length lists", () => {
    test("transpile", async () => {
        const { cleanup } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, "fixed-length-lists.wasm"),
                imports: new WASIShim().getImportObject(),
            },
            jco: {
                transpile: {},
            },
        });

        await cleanup();
    });
});
