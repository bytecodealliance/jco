import { join } from "node:path";

import { suite, test, assert } from "vitest";

import { exec, jcoPath, fileExists } from "../helpers.js";
import { EXTENDED_TEST_COMPONENTS_DIR } from "../common.js";

suite("jco-issue-1862", () => {
    test("owned resource survives a cross-component round trip", async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, "jco-issue-1862/composed.wasm");
        assert(await fileExists(componentPath), "built composed component must be in place");

        const { stdout, stderr } = await exec(jcoPath, "run", componentPath);

        assert.strictEqual(stdout, "");
        assert.strictEqual(stderr, "");
    });
});
