import { join } from "node:path";

import { suite, test, assert } from "vitest";

import { exec, jcoPath, fileExists } from "../helpers.js";
import { EXTENDED_TEST_COMPONENTS_DIR } from "../common.js";

suite("jco-issue-2510", () => {
    // TODO(unskip): Restore after @bytecodealliance/preview2-shim releases the accepted socket
    // poll state fix (after 0.31.1) and Jco's published dependency is updated to that release.
    test.skip("accepted TCP socket drops its streams before its own pollable", async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, "jco-issue-2510/component.wasm");
        assert(await fileExists(componentPath), "built issue component must be in place");

        const { stdout } = await exec(jcoPath, "run", componentPath);
        assert.strictEqual(stdout, "accepted\nclosed\n");
    });
});
