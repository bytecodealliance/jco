import { join } from "node:path";

import { suite, test, assert } from "vitest";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

import { setupAsyncTest } from "./helpers.js";
import { LOCAL_TEST_COMPONENTS_DIR } from "./common.js";

suite("non-wizered raw initialize export", () => {
    test("sync", async () => {
        const name = "non-wizered-init";
        // NOTE: simply importing the instance will run the initialization function,
        // and it should not fail
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                imports: {
                    ...new WASIShim({ sandbox: { env: { TEST: "YES" } } }).getImportObject(),
                    "jco:test-components/get-string": {
                        getString() {
                            return "FROM IMPORT";
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

        assert.strictEqual(instance["jco:test-components/local-run-string"].run(), "YES");
        assert.strictEqual(instance["jco:test-components/get-string"].getString(), "FROM IMPORT");

        await cleanup();
    });

    // TODO(breaking): remove this once manually specified async is removed
    test("legacy async", async () => {
        if (typeof WebAssembly?.Suspending !== "function") {
            return;
        }

        const name = "non-wizered-init";
        // NOTE: simply importing the instance will run the initialization function,
        // and it should not fail
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                imports: {
                    ...new WASIShim({ sandbox: { env: { TEST: "YES" } } }).getImportObject(),
                    "jco:test-components/get-string": {
                        async getString() {
                            return "FROM IMPORT";
                        },
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                        asyncMode: "jspi",
                        asyncImports: ["jco:test-components/get-string#get-string"],
                        asyncExports: ["jco:test-components/get-string#get-string"],
                    },
                },
            },
        });

        assert.strictEqual(await instance["jco:test-components/get-string"].getString(), "FROM IMPORT");

        await cleanup();
    });
});
