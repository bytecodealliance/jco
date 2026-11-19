import { join } from "node:path";

import { suite, test, assert } from "vitest";

import { exec, jcoPath, fileExists } from "../helpers.js";
import { EXTENDED_TEST_COMPONENTS_DIR } from "../common.js";
import { withWorkspacePreview2Shim } from "../../../../test/helpers/shims.mjs";

// TODO(fix): Drop withWorkspacePreview2Shim after the next preview2-shim release
// includes the accepted socket poll state fix and jco consumes that published version.
suite("jco-issue-2510", () => {
    test("accepted TCP socket drops its streams before its own pollable", async () => {
        const componentPath = join(EXTENDED_TEST_COMPONENTS_DIR, "jco-issue-2510/component.wasm");
        assert(await fileExists(componentPath), "built issue component must be in place");

        // jco run keeps a preview2-shim already linked in its output directory.
        await withWorkspacePreview2Shim(async (dir) => {
            const { stdout } = await exec(jcoPath, "run", "--jco-dir", dir, componentPath);
            assert.strictEqual(stdout, "accepted\nclosed\n");
        });
    });
});
