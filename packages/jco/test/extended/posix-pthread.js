import { rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { suite, test, assert } from "vitest";

import { exec, jcoPath, fileExists, getTmpDir } from "../helpers.js";
import { EXTENDED_TEST_COMPONENTS_DIR } from "../common.js";

suite("posix-pthread-mutex-lock", () => {
    // TODO(unskip): enable once jco implements the Component Model threading intrinsics.
    test.skip("1-1", async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, "posix/pthread-mutex-lock/1-1/component.wasm");
        assert(await fileExists(componentPath), "built posix-pthread-mutex-lock-1-1 component must be in place");

        const outputDir = await getTmpDir();
        try {
            await exec(jcoPath, "transpile", componentPath, "-o", outputDir, "--name", "out");
            const instance = await import(pathToFileURL(join(outputDir, "out.js")));
            // 0 == PTS_PASS
            assert.strictEqual(instance.run(), 0);
        } finally {
            await rm(outputDir, { recursive: true, force: true });
        }
    });
});
