// End-to-end coverage for `node:path` in a componentized source.
//
// The adapter unit tests (`node-builtins.js`) call the plugin's hooks directly, which cannot
// tell whether `jco componentize` uses it at all. These build a real component and run it.
import { cwd } from "node:process";
import { join } from "node:path";

import { assert, expect, suite, test } from "vitest";

import { componentizeFixture, setupAsyncTest } from "../helpers.js";

suite("node:path in a component", () => {
    // TODO(unskip): jco pins @bytecodealliance/jco-std/node24.x/path, which the published
    // jco-std does not export yet -- it only has the ./node/path alias. Unskip once a jco-std
    // release carrying the node24.x entry points is published and jco's range is bumped to it.
    test.skip("componentizes and runs lexical and cwd-backed path operations", async () => {
        const { componentPath, stderr } = await componentizeFixture({ fixture: "node-path", bundle: true });
        assert.strictEqual(stderr, "");

        const { instance, cleanup } = await setupAsyncTest({
            component: { name: "node-path", path: componentPath },
        });

        try {
            // Lexical behavior, including the real win32 namespace and matchesGlob, both of
            // which distinguish jco-std's implementation from a POSIX-only shim.
            assert.strictEqual(instance.lexical(), "a/c|C:\\a\\b|\\|true");

            // resolve() of a relative path goes through wasi:cli/environment#initial-cwd.
            assert.strictEqual(instance.fromCwd(), join(cwd(), "relative"));
        } finally {
            await cleanup();
        }
    });

    test("requires the world to import wasi:cli/environment", async () => {
        await expect(componentizeFixture({ fixture: "node-path-missing-environment", bundle: true })).rejects.toThrow(
            /import wasi:cli\/environment@0\.2\.x/,
        );
    });
});
