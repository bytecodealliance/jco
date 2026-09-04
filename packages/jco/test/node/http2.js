import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { componentWitMetadataForWorld } from "@bytecodealliance/jco-transpile";
import { describe, expect, test, vi } from "vitest";

import { bundleComponentSource } from "../../src/bundle.js";
import { bundleNodeGuestExportsWrapper } from "../../src/cmd/componentize.js";
import { withDefaultNodeCapabilities } from "../../src/cmd/transpile.js";
import { HTTP2_CALLBACKS_SPECIFIER, nodeBuiltinPlugin } from "../../src/node-builtins.js";
import { HTTP2_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { componentizeFixture, exec, getTmpDir, setupAsyncTest } from "../helpers.js";

const modulePaths = {
    http2Module: "/jco/http2.js",
    http2CoreModule: "/jco/http2/core.js",
    http2WasiSocketsImplementationModule: "/jco/http2/wasi-sockets.js",
    http2WasiHttpImplementationModule: "/jco/http2/wasi-http.js",
};

describe("node:http2 builtin adapter", () => {
    test.each([
        ["direct", "/jco/http2.js", "jco:node/http2@0.1.0"],
        ["wasi-sockets", "/jco/http2/wasi-sockets.js", "wasi:sockets/instance-network@0.2.12"],
        ["wasi-http", "/jco/http2/wasi-http.js", undefined],
    ])("generates the %s implementation facade", (nodejsHttp2Via, implementationModule, capability) => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { ...modulePaths, nodejsHttp2Via, onWitRequirement },
        );
        const id = plugin.resolveId("node:http2");
        expect(id).toBe("\0jco-node-builtin:node:http2");
        const source = plugin.load(id);
        expect(source).toContain(implementationModule);
        expect(source).toContain("export default http2");
        expect(source).toContain("getPackedSettings");
        if (capability) {
            expect(onWitRequirement).toHaveBeenCalledWith(expect.objectContaining({ witImport: capability }));
        }
        if (nodejsHttp2Via === "direct") {
            expect(onWitRequirement).toHaveBeenCalledWith(HTTP2_WIT_REQUIREMENT);
            expect(onWitRequirement).toHaveBeenCalledWith(
                expect.objectContaining({
                    guestExports: [
                        {
                            witExport: "jco:node/http2-callbacks@0.1.0",
                            jsExport: "http2Callbacks",
                            moduleSpecifier: HTTP2_CALLBACKS_SPECIFIER,
                        },
                    ],
                }),
            );
        } else if (nodejsHttp2Via === "wasi-http") {
            expect(onWitRequirement).not.toHaveBeenCalled();
        }
        if (nodejsHttp2Via === "wasi-sockets") {
            expect(source).toContain("wasi:sockets/tcp-create-socket@0.2.12");
        }
    });

    test("resolves the direct callback implementation for an entry wrapper", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { ...modulePaths, nodejsHttp2Via: "direct" });
        const id = plugin.resolveId(HTTP2_CALLBACKS_SPECIFIER);
        expect(id).toBe("\0jco-node-builtin:http2-callbacks");
        expect(plugin.load(id)).toBe('export { http2Callbacks } from "/jco/http2.js";');
    });

    test("keeps the direct callback resource as an entry export", async () => {
        const root = await getTmpDir();
        const entry = join(root, "entry.js");
        const http2Module = join(root, "http2.js");
        await writeFile(entry, 'import { createServer } from "node:http2"; export { createServer };\n');
        await writeFile(
            http2Module,
            "export const http2Callbacks = { StreamListener: class StreamListener {} }; export default {};\n",
        );
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { http2Module });
        const source = await bundleNodeGuestExportsWrapper(entry, HTTP2_WIT_REQUIREMENT.guestExports, {
            plugins: [plugin],
        });
        expect(source).toContain("http2Callbacks");
        expect(source).toMatch(/export\s*\{[^}]*http2Callbacks/);
    });

    test("does not intercept bare http2 and tree-shakes an unused builtin", async () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, modulePaths);
        expect(plugin.resolveId("http2")).toBeNull();
        const root = await getTmpDir();
        const entry = join(root, "entry.js");
        await writeFile(entry, "export const answer = 42;\n");
        const source = await bundleComponentSource(entry, { plugins: [plugin] });
        expect(source).not.toContain("jco.node.http2");
        expect(source).not.toContain("http2Callbacks");
    });

    test("configures the direct Node provider for JSPI", () => {
        const opts = withDefaultNodeCapabilities({
            map: { "jco:node/http2@0.1.0": "/application/http2-host.js" },
        });
        expect(opts.asyncMode).toBe("jspi");
        expect(opts.asyncImports).toEqual([
            "jco:node/http2@0.1.0#[method]client-session.ready",
            "jco:node/http2@0.1.0#[method]client-stream.finish",
            "jco:node/http2@0.1.0#[method]client-session.close",
            "jco:node/http2@0.1.0#[method]client-session.settings",
            "jco:node/http2@0.1.0#[method]client-session.ping",
            "jco:node/http2@0.1.0#[method]server.listen",
            "jco:node/http2@0.1.0#[method]server.close",
        ]);
        expect(opts.asyncExports).toEqual(["*"]);
        expect(opts.map).toMatchObject({
            "jco:node/http2@0.1.0": "/application/http2-host.js",
        });
    });
});

describe("node:http2 WIT installation", () => {
    test("installs the typed resource boundary idempotently", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(world, "package test:http2;\nworld component {}\n");
        const first = await injectNodeWitImports(root, undefined, [HTTP2_WIT_REQUIREMENT]);
        expect(first).toMatchObject({
            imports: ["jco:node/http2@0.1.0"],
            exports: ["jco:node/http2-callbacks@0.1.0"],
        });
        expect(await injectNodeWitImports(root, undefined, [HTTP2_WIT_REQUIREMENT])).toBeUndefined();
        const source = await readFile(join(root, "deps/jco-node-0.1.0/http2.wit"), "utf8");
        expect(source).toContain("resource client-session");
        expect(source).toContain("resource client-stream");
        expect(source).toContain("resource stream-listener");
        const metadata = await componentWitMetadataForWorld({ tag: "path", val: root }, "component");
        expect(metadata.imports).toContainEqual(
            expect.objectContaining({ namespace: "jco", package: "node", interface: "http2" }),
        );
        expect(metadata.exports).toContainEqual(
            expect.objectContaining({ namespace: "jco", package: "node", interface: "http2-callbacks" }),
        );
    });

    test("adds only missing declarations and recognizes aliases", async () => {
        const root = await getTmpDir();
        const world = join(root, "worlds.wit");
        await writeFile(
            world,
            "package test:http2;\nworld unused {}\nworld component {\n  import h2: jco:node/http2@0.1.0;\n}\n",
        );
        const result = await injectNodeWitImports(root, "test:http2/component", [HTTP2_WIT_REQUIREMENT]);
        expect(result).toMatchObject({ imports: [], exports: ["jco:node/http2-callbacks@0.1.0"] });
        const updated = await readFile(world, "utf8");
        expect(updated.match(/http2@0\.1\.0;/g)).toHaveLength(1);
        expect(updated).toContain("export jco:node/http2-callbacks@0.1.0;");
    });

    test("preserves an aliased export while adding a missing import", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(
            world,
            "package test:http2;\nworld component {\n  export callbacks: jco:node/http2-callbacks@0.1.0;\n}\n",
        );
        const result = await injectNodeWitImports(root, undefined, [HTTP2_WIT_REQUIREMENT]);
        expect(result).toMatchObject({ imports: ["jco:node/http2@0.1.0"], exports: [] });
    });
});

describe("node:http2 in a fully formed component", () => {
    const expectedLocalReport = {
        local: { status: 201, contentType: "text/plain", body: "large:POST:/large:131072:x:x" },
        guest: { length: 131072, first: "s", last: "s" },
    };

    // TODO(unskip): enable after a published jco-std release contains the HTTP/2 exports.
    test.skip("runs a fully formed wasi:sockets component against local HTTP/2 clients and servers", async () => {
        const { componentPath, stderr } = await componentizeFixture({
            fixture: "node-http2",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "quickjs", "--with-nodejs-http2-via", "wasi-sockets"],
        });
        expect(stderr).toContain("wasi:sockets/instance-network@0.2.12");
        const { esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: { name: "node-http2-wasi-sockets", path: componentPath, skipInstantiation: true },
            jco: { transpile: { extraArgs: { asyncExports: ["*"] } } },
        });
        try {
            const runner = fileURLToPath(new URL("../fixtures/componentize/node-http2/run.js", import.meta.url));
            const output = await exec(runner, esModuleOutputPath);
            expect(JSON.parse(output.stdout)).toEqual(expectedLocalReport);
        } finally {
            await cleanup();
        }
    }, 600_000);

    // TODO(unskip): enable after a published jco-std release contains the HTTP/2 exports.
    test.skip("runs the same wasi:sockets component under StarlingMonkey", async () => {
        const { componentPath, stderr } = await componentizeFixture({
            fixture: "node-http2",
            wit: "wit-starling",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "starlingmonkey", "--with-nodejs-http2-via", "wasi-sockets"],
        });
        expect(stderr).toContain("wasi:sockets/instance-network@0.2.10");
        const { esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: { name: "node-http2-starling-wasi-sockets", path: componentPath, skipInstantiation: true },
            jco: { transpile: { extraArgs: { asyncExports: ["*"] } } },
        });
        try {
            const runner = fileURLToPath(new URL("../fixtures/componentize/node-http2/run.js", import.meta.url));
            const output = await exec(runner, esModuleOutputPath);
            expect(JSON.parse(output.stdout)).toEqual(expectedLocalReport);
        } finally {
            await cleanup();
        }
    }, 600_000);

    // TODO(unskip): enable after a published jco-std release contains the HTTP/2 exports.
    test.skip("runs the component against the public nghttp2.org h2c server", async () => {
        const { componentPath } = await componentizeFixture({
            fixture: "node-http2",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "quickjs", "--with-nodejs-http2-via", "wasi-sockets"],
        });
        const { esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: { name: "node-http2-wasi-sockets-external", path: componentPath, skipInstantiation: true },
            jco: { transpile: { extraArgs: { asyncExports: ["*"] } } },
        });
        try {
            const runner = fileURLToPath(new URL("../fixtures/componentize/node-http2/run.js", import.meta.url));
            const output = await exec(runner, esModuleOutputPath, "external");
            const report = JSON.parse(output.stdout);
            expect(report.external).toMatchObject({ status: 200, contentType: "application/json" });
            expect(JSON.parse(report.external.body).data).toBe("client");
        } finally {
            await cleanup();
        }
    }, 600_000);

    // TODO(unskip): enable after a published jco-std release contains the HTTP/2 exports.
    test.skip("componentizes idiomatic client and server code through the direct boundary", async () => {
        const { stderr } = await componentizeFixture({
            fixture: "node-http2",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "starlingmonkey", "--with-nodejs-http2-via", "direct"],
        });
        expect(stderr).toContain("Jco added generated WIT import jco:node/http2@0.1.0");
        expect(stderr).toContain("jco:node/http2-callbacks@0.1.0");
    }, 600_000);
});
