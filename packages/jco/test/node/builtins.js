import { describe, expect, test, vi } from "vitest";
import { nodeBuiltinPlugin } from "../../src/node-builtins.js";
import { withDefaultNodeCapabilities, withDefaultNodeCapabilityMap } from "../../src/cmd/transpile.js";
import * as nodeWit from "../../src/node-wit.js";

const environment = (patch = 6n) => ({
    imports: [
        { namespace: "wasi", package: "cli", interface: "environment", version: { major: 0n, minor: 2n, patch } },
    ],
    exports: [],
});

const childProcess = () => ({
    imports: [
        {
            namespace: "jco",
            package: "node",
            interface: "child-process",
            version: { major: 0n, minor: 1n, patch: 0n },
        },
    ],
    exports: [],
});

const unenvAliases = {
    "node:assert": "/unenv/assert.js",
    "node:buffer": "/unenv/buffer.js",
    "node:events": "/unenv/events.js",
    "node:path": "/unenv/path.js",
    "node:querystring": "/unenv/querystring.js",
    "unenv:buffer-core": "/unenv/buffer-core.js",
};

describe("Node builtin adapters", () => {
    test.concurrent("maps host-backed Node APIs to deny providers unless the application opts in", () => {
        expect(withDefaultNodeCapabilityMap()).toEqual({
            "jco:node/child-process@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process/host",
            "jco:node/cluster@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/cluster/host",
            "jco:node/ffi@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi/host",
            "jco:node/console@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console/host",
            "jco:node/dns@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dns/host",
            "jco:node/fs@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs/host",
            "jco:node/http@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host",
            "jco:node/inspector@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/inspector/host",
            "jco:node/http2@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http2/host",
            "jco:node/os@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/os/host",
        });
        expect(
            withDefaultNodeCapabilityMap({
                "jco:node/console@0.1.0": "/application/console-host.js",
                "jco:node/fs@0.1.0": "/application/fs-host.js",
                "jco:node/os@0.1.0": "/application/os-host.js",
            }),
        ).toEqual({
            "jco:node/child-process@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process/host",
            "jco:node/cluster@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/cluster/host",
            "jco:node/ffi@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/26.x.x/ffi/host",
            "jco:node/console@0.1.0": "/application/console-host.js",
            "jco:node/dns@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dns/host",
            "jco:node/fs@0.1.0": "/application/fs-host.js",
            "jco:node/http@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host",
            "jco:node/inspector@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/inspector/host",
            "jco:node/http2@0.1.0": "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http2/host",
            "jco:node/os@0.1.0": "/application/os-host.js",
        });
    });

    test.concurrent("maps every injected jco:node host interface to a deny provider by default", () => {
        // Derive the expected keys from the WIT requirements themselves so that adding a new
        // host-backed builtin without a default deny mapping fails here instead of surfacing as an
        // unresolved import in a transpiled component.
        const map = withDefaultNodeCapabilityMap();
        const witImports = new Set(
            Object.values(nodeWit)
                .filter((value) => value && typeof value === "object" && typeof value.witImport === "string")
                .map((value) => value.witImport)
                .filter((witImport) => witImport.startsWith("jco:node/")),
        );
        expect(witImports.size).toBeGreaterThan(0);
        for (const witImport of witImports) {
            expect(map, `${witImport} must map to a deny-by-default host provider`).toHaveProperty(witImport);
        }
    });

    test.concurrent("configures custom DNS providers as JSPI imports", () => {
        const opts = withDefaultNodeCapabilities({
            map: { "jco:node/dns@0.1.0": "/application/dns-host.js" },
            asyncImports: ["application:custom/host#load"],
            asyncExports: ["selected-export"],
        });

        expect(opts.asyncMode).toBe("jspi");
        expect(opts.asyncImports).toEqual(["application:custom/host#load", "jco:node/dns@0.1.0#*"]);
        expect(opts.asyncExports).toEqual(["selected-export", "*"]);
        expect(opts.map?.["jco:node/dns@0.1.0"]).toBe("/application/dns-host.js");

        withDefaultNodeCapabilities(opts);
        expect(opts.asyncImports).toHaveLength(2);
        expect(opts.asyncExports).toHaveLength(2);
    });

    test.concurrent("keeps the default DNS deny provider synchronous", () => {
        const opts = withDefaultNodeCapabilities({});
        expect(opts.asyncMode).toBeUndefined();
        expect(opts.asyncImports).toBeUndefined();
        expect(opts.asyncExports).toBeUndefined();
    });

    test.each([
        ["node:fs", "/jco/node/fs.js"],
        ["node:fs/promises", "/jco/node/fs-promises.js"],
    ])("generates a host-backed adapter for %s", (specifier, expectedModule) => {
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            {
                fsModule: "/jco/node/fs.js",
                fsPromisesModule: "/jco/node/fs-promises.js",
            },
        );
        const id = plugin.resolveId(specifier);
        expect(id).toBe(`\0jco-node-builtin:${specifier}`);
        const source = plugin.load(id);
        expect(source).toContain(`from ${JSON.stringify(expectedModule)}`);
        expect(source).toContain("export default fs");
        expect(source).toContain("export *");
    });

    test.each(["node:fs", "node:fs/promises"])("reports the WIT capability required by %s", (specifier) => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            {
                fsModule: "/jco/node/fs.js",
                fsPromisesModule: "/jco/node/fs-promises.js",
                onWitRequirement,
            },
        );
        plugin.resolveId(specifier);
        expect(onWitRequirement).toHaveBeenCalledOnce();
        expect(onWitRequirement).toHaveBeenCalledWith(
            expect.objectContaining({
                nodeSpecifier: "node:fs",
                witImport: "jco:node/fs@0.1.0",
            }),
        );
    });

    test.each(["node:path", "node:path/posix", "node:path/win32"])("generates an adapter for %s", (specifier) => {
        const plugin = nodeBuiltinPlugin(environment(), { pathFactory: "/jco/node/path.js" });
        const id = plugin.resolveId(specifier);
        expect(id).toContain("@0.2.6");
        const source = plugin.load(id);
        expect(source).toContain("jco-node-builtin:path-core@0.2.6");
        expect(source).toContain("export default path");
        expect(source).toContain("export const _makeLong = path._makeLong");
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

    test.concurrent("generates a capability-free adapter for node:string_decoder", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { stringDecoderModule: "/jco/node/string-decoder.js", onWitRequirement },
        );
        const id = plugin.resolveId("node:string_decoder");
        expect(id).toBe("\0jco-node-builtin:node:string_decoder");
        expect(plugin.load(id)).toContain('from "/jco/node/string-decoder.js"');
        expect(plugin.load(id)).toContain("export { StringDecoder }");
        expect(plugin.load(id)).toContain("export default stringDecoder");
        expect(onWitRequirement).not.toHaveBeenCalled();
    });

    test.concurrent("does not intercept the legacy bare string_decoder specifier", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] });
        expect(plugin.resolveId("string_decoder")).toBeNull();
    });

    test.concurrent("loads the Errors globals module lazily", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { errorsModule: "/jco/node/errors.js" });
        const id = plugin.resolveId("jco:node-error-globals");
        expect(id).toBe("\0jco-node-builtin:error-globals");
        expect(plugin.load(id)).toBe('export * from "/jco/node/errors.js";');
    });

    test.concurrent("generates an adapter for node:child_process when its capability is imported", () => {
        const plugin = nodeBuiltinPlugin(childProcess(), { childProcessModule: "/jco/node/child-process.js" });
        const id = plugin.resolveId("node:child_process");
        expect(id).toBe("\0jco-node-builtin:node:child_process");
        const source = plugin.load(id);
        expect(source).toContain('from "/jco/node/child-process.js"');
        expect(source).toContain("spawnSync");
    });

    test.concurrent("generates a capability-free adapter for node:module", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { moduleModule: "/jco/node/module.js" });
        const id = plugin.resolveId("node:module");
        expect(id).toBe("\0jco-node-builtin:node:module");
        const source = plugin.load(id);
        expect(source).toContain('from "/jco/node/module.js"');
        expect(source).toContain("createRequire");
        expect(source).toContain("SourceMap");
    });

    test.concurrent("node:module requires no WIT capability", () => {
        // Nothing reaches a host: what works is computation, and what does not is unimplementable
        // rather than unprovisioned.
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { moduleModule: "/jco/node/module.js", onWitRequirement },
        );
        plugin.resolveId("node:module");
        expect(onWitRequirement).not.toHaveBeenCalled();
    });

    test.concurrent("does not intercept the bare module specifier", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { moduleModule: "/jco/node/module.js" });
        expect(plugin.resolveId("module")).toBeNull();
    });

    test.concurrent("generates a host-backed adapter for node:ffi", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { ffiModule: "/jco/node/ffi.js" });
        const id = plugin.resolveId("node:ffi");
        expect(id).toBe("\0jco-node-builtin:node:ffi");
        const source = plugin.load(id);
        expect(source).toContain('from "/jco/node/ffi.js"');
        expect(source).toContain("DynamicLibrary");
        expect(source).toContain("dlopen");
    });

    test.concurrent("reports the WIT capability required by node:ffi", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { ffiModule: "/jco/node/ffi.js", onWitRequirement },
        );
        plugin.resolveId("node:ffi");
        expect(onWitRequirement).toHaveBeenCalledWith(
            expect.objectContaining({ nodeSpecifier: "node:ffi", witImport: "jco:node/ffi@0.1.0" }),
        );
    });

    test.concurrent("does not intercept the bare ffi specifier", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { ffiModule: "/jco/node/ffi.js" });
        expect(plugin.resolveId("ffi")).toBeNull();
    });

    test.concurrent("generates a host-backed adapter for node:inspector", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { inspectorModule: "/jco/node/inspector.js" });
        const id = plugin.resolveId("node:inspector");
        expect(id).toBe("\0jco-node-builtin:node:inspector");
        const source = plugin.load(id);
        expect(source).toContain('from "/jco/node/inspector.js"');
        expect(source).toContain("Session");
        expect(source).toContain("NetworkResources");
    });

    test.concurrent("generates a shared-core adapter for node:inspector/promises", () => {
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { inspectorPromisesModule: "/jco/node/inspector-promises.js" },
        );
        const id = plugin.resolveId("node:inspector/promises");
        expect(id).toBe("\0jco-node-builtin:node:inspector/promises");
        const source = plugin.load(id);
        expect(source).toContain('from "/jco/node/inspector-promises.js"');
        expect(source).toContain("Session");
    });

    test.concurrent("resolves the callbacks virtual to the base inspector module", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { inspectorModule: "/jco/node/inspector.js" });
        const id = plugin.resolveId("jco:node-inspector-callbacks");
        expect(id).toBe("\0jco-node-builtin:inspector-callbacks");
        const source = plugin.load(id);
        expect(source).toContain("inspectorCallbacks");
        expect(source).toContain('from "/jco/node/inspector.js"');
    });

    test.concurrent("reports the WIT import and export required by node:inspector", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { inspectorModule: "/jco/node/inspector.js", onWitRequirement },
        );
        plugin.resolveId("node:inspector");
        expect(onWitRequirement).toHaveBeenCalledWith(
            expect.objectContaining({
                nodeSpecifier: "node:inspector",
                witImport: "jco:node/inspector@0.1.0",
                witExport: "jco:node/inspector-callbacks@0.1.0",
            }),
        );
    });

    test.concurrent("node:inspector/promises reports the same capability under its own specifier", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { inspectorPromisesModule: "/jco/node/inspector-promises.js", onWitRequirement },
        );
        plugin.resolveId("node:inspector/promises");
        expect(onWitRequirement).toHaveBeenCalledWith(
            expect.objectContaining({
                nodeSpecifier: "node:inspector/promises",
                witImport: "jco:node/inspector@0.1.0",
                witExport: "jco:node/inspector-callbacks@0.1.0",
            }),
        );
    });

    test.concurrent("does not intercept the bare inspector specifier", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { inspectorModule: "/jco/node/inspector.js" });
        expect(plugin.resolveId("inspector")).toBeNull();
    });

    test.concurrent("generates an adapter for node:domain that refuses at runtime", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { domainModule: "/jco/node/domain.js" });
        const id = plugin.resolveId("node:domain");
        expect(id).toBe("\0jco-node-builtin:node:domain");
        const source = plugin.load(id);
        expect(source).toContain('from "/jco/node/domain.js"');
        expect(source).toContain("createDomain");
    });

    test.concurrent("node:domain requires no WIT capability", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { domainModule: "/jco/node/domain.js", onWitRequirement },
        );
        plugin.resolveId("node:domain");
        expect(onWitRequirement).not.toHaveBeenCalled();
    });

    test.concurrent("does not intercept the bare domain specifier", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { domainModule: "/jco/node/domain.js" });
        expect(plugin.resolveId("domain")).toBeNull();
    });

    test.concurrent("generates a capability-free adapter for node:diagnostics_channel", () => {
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { diagnosticsChannelModule: "/jco/node/diagnostics-channel.js" },
        );
        const id = plugin.resolveId("node:diagnostics_channel");
        expect(id).toBe("\0jco-node-builtin:node:diagnostics_channel");
        const source = plugin.load(id);
        expect(source).toContain('from "/jco/node/diagnostics-channel.js"');
        expect(source).toContain("tracingChannel");
    });

    test.concurrent("node:diagnostics_channel requires no WIT capability", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { diagnosticsChannelModule: "/jco/node/diagnostics-channel.js", onWitRequirement },
        );
        plugin.resolveId("node:diagnostics_channel");
        expect(onWitRequirement).not.toHaveBeenCalled();
    });

    test.concurrent("does not intercept the bare diagnostics_channel specifier", () => {
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { diagnosticsChannelModule: "/jco/node/diagnostics-channel.js" },
        );
        expect(plugin.resolveId("diagnostics_channel")).toBeNull();
    });

    test.concurrent("generates a capability-free adapter for node:async_hooks", () => {
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { asyncHooksModule: "/jco/node/async-hooks.js" },
        );
        const id = plugin.resolveId("node:async_hooks");
        expect(id).toBe("\0jco-node-builtin:node:async_hooks");
        const source = plugin.load(id);
        expect(source).toContain('from "/jco/node/async-hooks.js"');
        expect(source).toContain("AsyncLocalStorage");
    });

    test.concurrent("node:async_hooks requires no WIT capability", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { asyncHooksModule: "/jco/node/async-hooks.js", onWitRequirement },
        );
        plugin.resolveId("node:async_hooks");
        expect(onWitRequirement).not.toHaveBeenCalled();
    });

    test.concurrent("does not intercept the bare async_hooks specifier", () => {
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { asyncHooksModule: "/jco/node/async-hooks.js" },
        );
        expect(plugin.resolveId("async_hooks")).toBeNull();
    });

    test.concurrent("generates an adapter for node:cluster", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { clusterModule: "/jco/node/cluster.js" });
        const id = plugin.resolveId("node:cluster");
        expect(id).toBe("\0jco-node-builtin:node:cluster");
        const source = plugin.load(id);
        expect(source).toContain('from "/jco/node/cluster.js"');
        expect(source).toContain("export default cluster");
        expect(source).toContain("SCHED_RR");
    });

    test.concurrent("reports the WIT capability required by node:cluster", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { clusterModule: "/jco/node/cluster.js", onWitRequirement },
        );
        expect(plugin.resolveId("node:cluster")).toBe("\0jco-node-builtin:node:cluster");
        expect(onWitRequirement).toHaveBeenCalledOnce();
        expect(onWitRequirement).toHaveBeenCalledWith(
            expect.objectContaining({
                nodeSpecifier: "node:cluster",
                witImport: "jco:node/cluster@0.1.0",
            }),
        );
    });

    test.concurrent("does not intercept the bare cluster specifier", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { clusterModule: "/jco/node/cluster.js" });
        expect(plugin.resolveId("cluster")).toBeNull();
    });

    test.concurrent("reports the WIT capability required by node:child_process", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            {
                childProcessModule: "/jco/node/child-process.js",
                onWitRequirement,
            },
        );
        expect(plugin.resolveId("node:child_process")).toBe("\0jco-node-builtin:node:child_process");
        expect(onWitRequirement).toHaveBeenCalledOnce();
        expect(onWitRequirement).toHaveBeenCalledWith(
            expect.objectContaining({
                nodeSpecifier: "node:child_process",
                witImport: "jco:node/child-process@0.1.0",
            }),
        );
    });

    test.concurrent("generates an explicitly host-backed node:console adapter", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { consoleModule: "/jco/node/console.js" });
        const id = plugin.resolveId("node:console");
        expect(id).toBe("\0jco-node-builtin:node:console");
        const source = plugin.load(id);
        expect(source).toContain("export default console");
        expect(source).toContain("Console,");
        expect(source).toContain('from "/jco/node/console.js"');
    });

    test.concurrent("generates an explicitly host-backed node:os adapter", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { osModule: "/jco/node/os.js" });
        const id = plugin.resolveId("node:os");
        expect(id).toBe("\0jco-node-builtin:node:os");
        const source = plugin.load(id);
        expect(source).toContain("export default os");
        expect(source).toContain("availableParallelism,");
        expect(source).toContain('from "/jco/node/os.js"');
    });

    test.concurrent("reports the WIT capability required by node:os", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { osModule: "/jco/node/os.js", onWitRequirement },
        );
        expect(plugin.resolveId("node:os")).toBe("\0jco-node-builtin:node:os");
        expect(onWitRequirement).toHaveBeenCalledOnce();
        expect(onWitRequirement).toHaveBeenCalledWith(
            expect.objectContaining({ nodeSpecifier: "node:os", witImport: "jco:node/os@0.1.0" }),
        );
    });

    test.concurrent("does not intercept the bare os specifier", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { osModule: "/jco/node/os.js" });
        expect(plugin.resolveId("os")).toBeNull();
    });

    test.each([
        ["node:dns", "/jco/node/dns.js"],
        ["node:dns/promises", "/jco/node/dns-promises.js"],
    ])("generates a host-backed adapter for %s", (specifier, module) => {
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { dnsModule: "/jco/node/dns.js", dnsPromisesModule: "/jco/node/dns-promises.js" },
        );
        const id = plugin.resolveId(specifier);
        expect(id).toBe(`\0jco-node-builtin:${specifier}`);
        expect(plugin.load(id)).toContain(`from \"${module}\"`);
    });

    test.each(["node:dns", "node:dns/promises"])("reports the WIT capability required by %s", (specifier) => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { dnsModule: "/jco/node/dns.js", dnsPromisesModule: "/jco/node/dns-promises.js", onWitRequirement },
        );
        expect(plugin.resolveId(specifier)).toBe(`\0jco-node-builtin:${specifier}`);
        expect(onWitRequirement).toHaveBeenCalledWith(
            expect.objectContaining({ nodeSpecifier: specifier, witImport: "jco:node/dns@0.1.0" }),
        );
    });

    test.concurrent("layers audited unenv modules below Jco overrides", () => {
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

    test.concurrent("layers jco-std's entry points over unenv's emitter for node:events", () => {
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { unenvAliases, eventsModule: "/jco/node/events.js" },
        );
        expect(plugin.resolveId("node:events")).toBe("\0jco-node-builtin:node:events");
        const source = plugin.load("\0jco-node-builtin:node:events");
        // unenv supplies the emitter; jco-std supplies the three module-level functions unenv
        // ships as stubs, and those exports have to shadow the star re-export to take effect.
        expect(source).toContain("/unenv/events.js");
        expect(source).toContain("/jco/node/events.js");
        expect(source).toContain("export * from");
        for (const name of ["getMaxListeners", "listenerCount", "setMaxListeners"]) {
            expect(source).toContain(`export const ${name} = completed.${name};`);
        }
    });

    test.concurrent("reports a missing unenv emitter for node:events", () => {
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { unenvAliases: {}, eventsModule: "/jco/node/events.js" },
        );
        expect(() => plugin.load("\0jco-node-builtin:node:events")).toThrow(/audited builtin node:events/);
    });

    test.concurrent("node:events requires no WIT capability", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { unenvAliases, eventsModule: "/jco/node/events.js", onWitRequirement },
        );
        expect(plugin.resolveId("node:events")).toBe("\0jco-node-builtin:node:events");
        expect(onWitRequirement).not.toHaveBeenCalled();
    });

    test.concurrent("does not intercept the bare events specifier", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { unenvAliases });
        expect(plugin.resolveId("events")).toBeNull();
    });

    test.each([
        ["node:stream/consumers", "/jco/node/stream-consumers.js", "streamConsumersModule"],
        ["node:stream/iter", "/jco/node/stream-iter.js", "streamIterModule"],
    ])("generates a capability-free adapter for %s", (specifier, module, option) => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { [option]: module, onWitRequirement });
        const id = plugin.resolveId(specifier);
        expect(id).toBe(`\0jco-node-builtin:${specifier}`);
        const source = plugin.load(id);
        expect(source).toContain(`from \"${module}\"`);
        expect(source).toContain("export default streamModule");
        expect(source).toContain("export * from");
        expect(onWitRequirement).not.toHaveBeenCalled();
    });

    test.each(["stream/consumers", "stream/iter"])("does not intercept the legacy bare %s specifier", (specifier) => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] });
        expect(plugin.resolveId(specifier)).toBeNull();
    });

    test.concurrent("resolves audited unenv modules without unrelated WASI capabilities", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { unenvAliases });
        expect(plugin.resolveId("node:buffer")).toBe("\0jco-node-builtin:node:buffer");
        expect(plugin.resolveId("node:querystring")).toBe("\0jco-node-builtin:node:querystring");
    });

    test.concurrent("reports missing transitive unenv implementations", () => {
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

    test.concurrent("ignores unsupported and legacy bare specifiers", () => {
        const plugin = nodeBuiltinPlugin(environment(), { pathFactory: "/jco/node/path.js" });
        expect(plugin.resolveId("path")).toBeNull();
        expect(plugin.resolveId("assert")).toBeNull();
        expect(plugin.resolveId("assert/strict")).toBeNull();
        expect(plugin.resolveId("buffer")).toBeNull();
        expect(plugin.resolveId("querystring")).toBeNull();
        expect(plugin.resolveId("string_decoder")).toBeNull();
        expect(plugin.resolveId("fs")).toBeNull();
        expect(plugin.resolveId("node:errors")).toBeNull();
        expect(plugin.resolveId("errors")).toBeNull();
        expect(plugin.resolveId("console")).toBeNull();
        expect(plugin.resolveId("dns")).toBeNull();
        expect(plugin.resolveId("dns/promises")).toBeNull();
        expect(plugin.resolveId("os")).toBeNull();
    });

    test.concurrent("reports a missing environment capability only when node:path is used", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { pathFactory: "/jco/node/path.js" });
        expect(plugin.resolveId("./local.js")).toBeNull();
        expect(() => plugin.resolveId("node:path")).toThrow(/import wasi:cli\/environment@0\.2\.x/);
    });

    test.concurrent("rejects ambiguous environment versions", () => {
        const metadata = environment();
        metadata.imports.push(environment(3n).imports[0]);
        const plugin = nodeBuiltinPlugin(metadata, { pathFactory: "/jco/node/path.js" });
        expect(() => plugin.resolveId("node:path")).toThrow(/multiple wasi:cli\/environment/);
    });

    test.concurrent("reports the WIT capability required by node:console", () => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { consoleModule: "/jco/node/console.js", onWitRequirement },
        );
        expect(plugin.resolveId("node:console")).toBe("\0jco-node-builtin:node:console");
        expect(onWitRequirement).toHaveBeenCalledOnce();
        expect(onWitRequirement).toHaveBeenCalledWith(
            expect.objectContaining({
                nodeSpecifier: "node:console",
                witImport: "jco:node/console@0.1.0",
            }),
        );
    });
});
