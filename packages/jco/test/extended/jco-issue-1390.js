import { join } from "node:path";

import { suite, test, assert } from "vitest";

import { exec, jcoPath, fileExists } from "../helpers.js";
import { EXTENDED_TEST_COMPONENTS_DIR } from "../common.js";

suite("jco-issue-1390", () => {
    // TODO(unskip): Enable after jco depends on a jco-transpile release containing the task metadata fix.
    test.skip("composed component runs", async () => {
        const combinedComponentPath = join(EXTENDED_TEST_COMPONENTS_DIR, "jco-issue-1390/composed.wasm");
        assert(await fileExists(combinedComponentPath), "built composed component must be in place");

        const { stdout, stderr } = await exec(jcoPath, "run", combinedComponentPath);
        assert.strictEqual(stdout, "");
        assert.strictEqual(stderr, "");
    });
});
