import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { suite, test } from "vitest";
import { componentizeFixture, transpileComponent } from "../helpers.js";

const isNode24 = process.versions.node.split(".")[0] === "24";
let hasUrlExport = true;
try {
    createRequire(import.meta.url).resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/url");
} catch (error) {
    if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
        throw error;
    }
    hasUrlExport = false;
}

suite("node:url in components", () => {
    // TODO(unskip): update to the next jco-std release with resolvable TTY host exports, and
    // verify that generated WIT does not leave imports without dependencies for the next backend.
    // Keep the URL-export and Node 24 oracle guards when restoring this test.
    test.skip.skipIf(!hasUrlExport || !isNode24).each(["qjs", "starlingmonkey"])(
        "matches Node 24 extensively through %s",
        async (backend) => {
            // Avoid importing Node 24-only named exports during collection on other hosts.
            const { run: runInNode } = await import("../fixtures/componentize/node-url/source.js");
            const expected = JSON.parse(runInNode());
            assert.strictEqual(expected.stableSort, "a=2&a=1&z=1&z=0");
            assert.deepEqual(expected.identity, Array(10).fill(true));
            const { componentPath } = await componentizeFixture({
                fixture: "node-url",
                entry: "source.js",
                wit: "source.wit",
                world: "test",
                bundle: true,
                extraArgs: ["--backend", backend],
            });
            const { modulePath } = await transpileComponent({ componentPath, name: "node-url" });
            const component = await import(modulePath);
            const actual = JSON.parse(component.run());
            // Compare groups separately so a failure identifies the API, not a giant report.
            assert.deepEqual(Object.keys(actual), Object.keys(expected));
            for (const key of Object.keys(expected)) {
                assert.deepEqual(actual[key], expected[key], key);
            }
            assert.deepEqual(
                JSON.parse(component.run()),
                actual,
                "repeated calls retain module and constructor identity",
            );
            const policy = JSON.parse(component.policy());
            assert.strictEqual(policy.touched, false);
            assert.deepEqual(
                policy.errors.map((error) => error.code),
                [
                    ...Array(6).fill("ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API"),
                    ...Array(2).fill("ERR_JCO_UNSUPPORTED_NODE_API"),
                ],
            );
            assert.match(policy.missingCwd, /node:url.*wasi:cli\/environment@0\.2\.x/);
        },
        180_000,
    );
    // TODO(unskip): update to the next jco-std release and verify its TTY host export resolves
    // from transpiled temporary directories. Both engines currently fail to import
    // @bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tty/host in CI.
    test.skip.each(["qjs", "starlingmonkey"])(
        "uses the WIT world's WASI cwd through %s",
        async (backend) => {
            const { componentPath } = await componentizeFixture({
                fixture: "node-url",
                entry: "cwd.js",
                world: "cwd",
                bundle: true,
                extraArgs: ["--backend", backend],
            });
            const { modulePath } = await transpileComponent({ componentPath, name: "node-url-cwd" });
            const component = await import(modulePath);
            for (const path of ["relative", "a/../two words#?%", "", "/absolute"]) {
                assert.deepEqual(JSON.parse(component.fromCwd(path)), {
                    href: pathToFileURL(path).href,
                    path: resolve(path),
                });
            }
        },
        180_000,
    );
});

suite("node:url builtin integration", () => {
    test("resolves without capabilities and preserves installed bare packages and unaudited imports", async () => {
        const { nodeBuiltinPlugin } = await import("../../src/node-builtins/index.js");
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { urlFactory: "/test/url.js" });
        const id = plugin.resolveId("node:url");
        assert.ok(id.startsWith("\0jco-node-builtin:"));
        assert.ok(plugin.load(id));
        assert.equal(await plugin.resolveId.call({ resolve: async () => null }, "url"), id);
        assert.equal(await plugin.resolveId.call({ resolve: async () => ({ id: "/installed/url.js" }) }, "url"), null);
        for (const other of ["node:punycode", "node:unrelated", "node:url/unknown"]) {
            assert.equal(plugin.resolveId(other), null);
        }
        assert.equal(plugin.resolveId("./encoding", "/application/whatwg.js"), null);
        assert.equal(plugin.resolveId("webidl-conversions", "/application/whatwg.js"), null);
    });
});

suite("node:url optional environment selection", () => {
    test("defers missing and ambiguous environment errors until cwd is used", async () => {
        const { nodeBuiltinPlugin } = await import("../../src/node-builtins/index.js");
        const environment = (patch) => ({
            namespace: "wasi",
            package: "cli",
            interface: "environment",
            version: { major: 0n, minor: 2n, patch },
        });
        // Execute the generated provider wiring with a tiny factory. Behavioral
        // component tests above exercise the real implementation and WASI import.
        for (const imports of [[], [environment(6n), environment(12n)]]) {
            const factory = `data:text/javascript,${encodeURIComponent("export function createUrl(providers) { return { pathToFileURL: providers.initialCwd }; }")}`;
            const plugin = nodeBuiltinPlugin({ imports, exports: [] }, { urlFactory: factory });
            const source = plugin.load(plugin.resolveId("node:url"));
            const globals = [globalThis.URL, globalThis.URLSearchParams, globalThis.URLPattern];
            try {
                const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
                assert.throws(
                    () => module.pathToFileURL("relative"),
                    imports.length ? /multiple.*environment/ : /requires.*environment/,
                );
            } finally {
                [globalThis.URL, globalThis.URLSearchParams, globalThis.URLPattern] = globals;
            }
        }
    });
});
