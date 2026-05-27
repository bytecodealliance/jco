import { join } from "node:path";

import { suite, test } from "vitest";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

import { setupAsyncTest } from "./helpers.js";
import { LOCAL_TEST_COMPONENTS_DIR } from "./common.js";

suite("resources", () => {
    // Ensure trampoline code is called on external object with relevant `this`.
    // see: https://github.com/bytecodealliance/jco/issues/1313
    test("simple imported resource call", async () => {
        class IncrementingExampleResource {
            constructor(id) {
                this.id = id;
            }
            getId() {
                this.id += 1;
                return this.id;
            }
        }

        const name = "resource-incrementing-id";
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                imports: {
                    ...new WASIShim().getImportObject(),
                    "jco:test-components/resources": { ExampleResource: IncrementingExampleResource },
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

        instance["jco:test-components/local-run"].run();

        await cleanup();
    });
});
