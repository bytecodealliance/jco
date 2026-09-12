// End-to-end coverage for `node:path` in a componentized source.
//
// The adapter unit tests (`builtins.js`) call the plugin's hooks directly, which cannot
// tell whether `jco componentize` uses it at all. These build a real component and run it.
import { cwd } from "node:process";
import { join, posix, win32 } from "node:path";

import { assert, expect, suite, test } from "vitest";

import { componentizeFixture, setupAsyncTest } from "../helpers.js";

suite("node:path in a component", () => {
    // TODO(unskip): update to the next jco-std release and verify warning-free componentization.
    // The injected process fallback currently adds a host TTY capability to path-only bundles;
    // its unresolved import and WIT injection warnings fail the stderr assertion.
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

            // Exercise the lazily loaded matcher, including its brace-expansion dependency.
            // Repeated calls also cover reuse after the first initialization.
            for (const windows of [false, true]) {
                const native = windows ? win32 : posix;
                for (const [value, pattern] of [
                    ["src/component.ts", "**/*.{js,ts}"],
                    ["src/component.md", "**/*.{js,ts}"],
                    ["file2.js", "file{1..3}.js"],
                    ["file4.js", "file{1..3}.js"],
                    ["a/b.js", "@(a|b)/*.js"],
                    ["literal[1].js", "literal[[]1].js"],
                    ["src\\component.ts", "src\\*.{js,ts}"],
                    ["src/component.ts", "**/*.{js,ts}"],
                ]) {
                    assert.strictEqual(instance.match(value, pattern, windows), native.matchesGlob(value, pattern));
                }
            }
        } finally {
            await cleanup();
        }
    });

    test.concurrent("adds wasi:cli/environment to a world that does not import it", async () => {
        // `node:path` reads the working directory from the environment. A world that does not
        // declare it has the import added, the same way the host-backed builtins do, because
        // `node:path` is usually reached through a dependency rather than written by hand.
        const { stderr } = await componentizeFixture({
            fixture: "node-path-missing-environment",
            bundle: true,
            copy: true,
        });
        expect(stderr).toContain("wasi:cli/environment@0.2.12");
    });
});
