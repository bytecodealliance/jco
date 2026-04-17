/* global Buffer */
import { join } from "node:path";

import { suite, test, assert } from "vitest";
import { COMPONENT_JS_FIXTURES_DIR } from "./common.js";
import { exec, getTmpDir, jcoPath } from "./helpers.js";

// NOTE: we test componentization with the jco CLI to avoid
// triggering errors for the the eval(import) call(s) in cmd/componentize.js
//
// TODO(breaking): once jco-transpile is established as a separate package and
// used widely, we can switch to regular dynamic imports, as componentize-js
// versions are real dependencies now.
suite("componentize", () => {
    test.concurrent("detect older wasi:http", async () => {
        const jsPath = join(COMPONENT_JS_FIXTURES_DIR, "wasi-http-detection-old/component.js");
        const witPath = join(COMPONENT_JS_FIXTURES_DIR, "wasi-http-detection-old/wit");
        const outputDir = await getTmpDir();
        const outputPath = join(outputDir, "component.wasm");
        const { stderr } = await exec(jcoPath, "componentize", jsPath, "-w", witPath, "-o", outputPath);
        assert.strictEqual(stderr, "");
    });

    test.concurrent("detect newer wasi:http", async () => {
        const jsPath = join(COMPONENT_JS_FIXTURES_DIR, "wasi-http-detection-new/component.js");
        const witPath = join(COMPONENT_JS_FIXTURES_DIR, "wasi-http-detection-new/wit");
        const outputDir = await getTmpDir();
        const outputPath = join(outputDir, "component.wasm");
        const { stderr } = await exec(jcoPath, "componentize", jsPath, "-w", witPath, "-o", outputPath);
        assert.strictEqual(stderr, "");
    });
});
