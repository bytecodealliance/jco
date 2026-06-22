import { join } from "node:path";

import { suite, test, assert } from "vitest";

import { setupAsyncTest, getTmpDir, exec, jcoPath } from "./helpers.js";
import { COMPONENT_JS_FIXTURES_DIR } from "./common.js";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

suite("import", () => {
    // see: https://github.com/bytecodealliance/jco/issues/1668
    test("import with manual result", async () => {
        const name = "import-returning-manual-result";

        // Build the component
        const witPath = join(COMPONENT_JS_FIXTURES_DIR, `${name}/component.wit`);
        const jsPath = join(COMPONENT_JS_FIXTURES_DIR, `${name}/component.js`);
        const outputDir = await getTmpDir();
        const outputPath = join(outputDir, "component.wasm");
        const { stderr } = await exec(jcoPath, "componentize", jsPath, "-w", witPath, "-o", outputPath);
        assert.strictEqual(stderr, "");

        // Perform transpilation
        const { instance, cleanup: setupCleanup } = await setupAsyncTest({
            component: {
                path: outputPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    "jco:test/returns-result": {
                        returnOk() {
                            return { tag: "ok", val: 42 };
                        },
                        returnErrNull() {
                            return { tag: "err", val: null };
                        },
                        returnErrString() {
                            return { tag: "err", val: "error" };
                        },
                        throwErrNull() {
                            throw null;
                        },
                        throwErrString() {
                            throw "error";
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

        const okResult = instance["jco:test/returns-result"].returnOk();
        assert.isObject(okResult);
        assert.deepStrictEqual(okResult, { tag: "ok", val: 42 });

        const errNull = instance["jco:test/returns-result"].returnErrNull();
        assert.isObject(errNull);
        assert.deepStrictEqual(errNull, { tag: "err", val: null });

        const errString = instance["jco:test/returns-result"].returnErrString();
        assert.isObject(errString);
        assert.deepStrictEqual(errString, { tag: "err", val: "error" });

        const thrownErrNull = instance["jco:test/returns-result"].throwErrNull();
        assert.isObject(thrownErrNull);
        assert.deepStrictEqual(thrownErrNull, { tag: "err", val: null });

        const thrownErrString = instance["jco:test/returns-result"].throwErrString();
        assert.isObject(thrownErrString);
        assert.deepStrictEqual(thrownErrString, { tag: "err", val: "error" });

        await componentBuildCleanup();
        await setupCleanup();
    });
});
