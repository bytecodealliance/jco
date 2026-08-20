import { rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { suite, test, assert } from "vitest";

import { exec, jcoPath, fileExists, getTmpDir } from "../helpers.js";
import { EXTENDED_TEST_COMPONENTS_DIR } from "../common.js";

suite("jco-issue-1887", () => {
    test("WASI P3 reactor initializes and runs", async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, "jco-issue-1887/component.wasm");
        assert(await fileExists(componentPath), "built issue component must be in place");

        const outputDir = await getTmpDir();
        try {
            await exec(jcoPath, "transpile", componentPath, "-o", outputDir, "--name", "out");
            const instance = await import(pathToFileURL(join(outputDir, "out.js")));
            assert.strictEqual(instance.bump(), 1);
            assert.strictEqual(instance.bump(), 2);
        } finally {
            await rm(outputDir, { recursive: true, force: true });
        }
    });
});
