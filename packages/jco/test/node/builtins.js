import { describe, expect, test } from "vitest";
import { nodeBuiltinPlugin } from "../../src/node-builtins.js";

const environment = (patch = 6n) => ({
    imports: [
        { namespace: "wasi", package: "cli", interface: "environment", version: { major: 0n, minor: 2n, patch } },
    ],
    exports: [],
});

const unenvAliases = {
    "node:assert": "/unenv/assert.js",
    "node:buffer": "/unenv/buffer.js",
    "node:path": "/unenv/path.js",
    "node:querystring": "/unenv/querystring.js",
    "unenv:buffer-core": "/unenv/buffer-core.js",
};

describe("Node builtin adapters", () => {
    test.each(["node:path", "node:path/posix", "node:path/win32"])("generates an adapter for %s", (specifier) => {
        const plugin = nodeBuiltinPlugin(environment(), { pathFactory: "/jco/node/path.js" });
        const id = plugin.resolveId(specifier);
        expect(id).toContain("@0.2.6");
        const source = plugin.load(id);
        expect(source).toContain("jco-node-builtin:path-core@0.2.6");
        expect(source).toContain("export default path");
        const coreId = plugin.resolveId("\0jco-node-builtin:path-core@0.2.6");
        const core = plugin.load(coreId);
        expect(core).toContain('from "wasi:cli/environment@0.2.6"');
        expect(core).toContain('from "/jco/node/path.js"');
    });

    test.each(["node:assert", "node:assert/strict"])("generates a capability-free adapter for %s", (specifier) => {
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { assertModule: "/jco/node/assert.js", unenvAliases },
        );
        const id = plugin.resolveId(specifier);
        expect(id).toBe(`\0jco-node-builtin:${specifier}`);
        expect(plugin.load(id)).toEqual(expect.any(String));
    });

    test("layers audited unenv modules below Jco overrides", () => {
        const plugin = nodeBuiltinPlugin(environment(), {
            assertModule: "/jco/node/assert.js",
            pathFactory: "/jco/node/path.js",
            unenvAliases,
        });

        expect(plugin.resolveId("node:assert")).toBe("\0jco-node-builtin:node:assert");
        expect(plugin.resolveId("node:path")).toBe("\0jco-node-builtin:node:path@0.2.6");
        expect(plugin.resolveId("node:buffer")).toBe("\0jco-node-builtin:node:buffer");
        expect(plugin.resolveId("node:querystring")).toBe("\0jco-node-builtin:node:querystring");
        expect(plugin.load("\0jco-node-builtin:node:buffer")).toEqual(expect.any(String));
        expect(plugin.load("\0jco-node-builtin:node:querystring")).toEqual(expect.any(String));
    });

    test("resolves audited unenv modules without unrelated WASI capabilities", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { unenvAliases });
        expect(plugin.resolveId("node:buffer")).toBe("\0jco-node-builtin:node:buffer");
        expect(plugin.resolveId("node:querystring")).toBe("\0jco-node-builtin:node:querystring");
    });

    test("reports missing transitive unenv implementations", () => {
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            {
                unenvAliases: {
                    "node:buffer": "/unenv/buffer.js",
                    "node:querystring": "/unenv/querystring.js",
                },
            },
        );
        expect(plugin.resolveId("node:querystring")).toBe("\0jco-node-builtin:node:querystring");
        expect(() => plugin.load("\0jco-node-builtin:unenv-buffer-core")).toThrow(/audited builtin unenv:buffer-core/);
    });

    test("ignores unsupported and legacy bare specifiers", () => {
        const plugin = nodeBuiltinPlugin(environment(), { pathFactory: "/jco/node/path.js" });
        expect(plugin.resolveId("path")).toBeNull();
        expect(plugin.resolveId("assert")).toBeNull();
        expect(plugin.resolveId("assert/strict")).toBeNull();
        expect(plugin.resolveId("buffer")).toBeNull();
        expect(plugin.resolveId("querystring")).toBeNull();
        expect(plugin.resolveId("node:fs")).toBeNull();
    });

    test("reports a missing environment capability only when node:path is used", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { pathFactory: "/jco/node/path.js" });
        expect(plugin.resolveId("./local.js")).toBeNull();
        expect(() => plugin.resolveId("node:path")).toThrow(/import wasi:cli\/environment@0\.2\.x/);
    });

    test("rejects ambiguous environment versions", () => {
        const metadata = environment();
        metadata.imports.push(environment(3n).imports[0]);
        const plugin = nodeBuiltinPlugin(metadata, { pathFactory: "/jco/node/path.js" });
        expect(() => plugin.resolveId("node:path")).toThrow(/multiple wasi:cli\/environment/);
    });
});
