import { describe, expect, test } from "vitest";
import { nodeBuiltinPlugin } from "../src/node-builtins.js";

const environment = (patch = 6n) => ({
    imports: [
        { namespace: "wasi", package: "cli", interface: "environment", version: { major: 0n, minor: 2n, patch } },
    ],
    exports: [],
});

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

    test("ignores unsupported and legacy bare specifiers", () => {
        const plugin = nodeBuiltinPlugin(environment(), { pathFactory: "/jco/node/path.js" });
        expect(plugin.resolveId("path")).toBeNull();
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
