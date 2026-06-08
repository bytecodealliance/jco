import { join, relative } from "node:path";
import { opendir } from "node:fs/promises";

import { suite, test, assert } from "vitest";

import { COMPONENT_MODEL_FIXTURES_WAST_DIR } from "../../../common.js";

// These tests are ported from the component-model repo
//
// see: https://github.com/WebAssembly/component-model/tree/main/test
//
suite("component-model", async () => {
    const walker = await opendir(COMPONENT_MODEL_FIXTURES_WAST_DIR, { recursive: true });
    for await (const dirent of walker) {
        if (!dirent.isFile) {
            continue;
        }
        const relPath = relative(COMPONENT_MODEL_FIXTURES_WAST_DIR, join(dirent.parentPath, dirent.name));

        test.concurrent(relPath, async () => {
            // TODO: convert WAST test to WAT + executable JS
            console.log(`path [${relPath}]`);
            assert.strictEqual(true, true);
        });
    }
});
