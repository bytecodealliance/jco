import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { componentWitMetadataForWorld } from "@bytecodealliance/jco-transpile";
import { describe, expect, test, vi } from "vitest";

import { withDefaultNodeCapabilities } from "../../src/cmd/transpile.js";
import { bundleNodeGuestExportsWrapper } from "../../src/cmd/componentize.js";
import { HTTP_CALLBACKS_SPECIFIER, nodeBuiltinPlugin } from "../../src/node-builtins.js";
import {
    HTTP_WASI_HTTP_WIT_REQUIREMENTS,
    HTTP_WASI_SOCKETS_WIT_REQUIREMENTS,
    HTTP_WIT_REQUIREMENT,
    injectNodeWitImports,
} from "../../src/node-wit.js";
import { componentizeFixture, exec, getTmpDir, setupAsyncTest } from "../helpers.js";

const modulePaths = {
    httpModule: "/jco/http.js",
    httpCoreModule: "/jco/http/core.js",
    httpWasiSocketsImplementationModule: "/jco/http/wasi-sockets.js",
    httpWasiHttpImplementationModule: "/jco/http/wasi-http.js",
};

const NODE_HOST = pathToFileURL(
    fileURLToPath(new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/http-host-node.js", import.meta.url)),
).href;

describe("node:http builtin adapter", () => {
    test.each([
        ["direct", "jco:node/http@0.1.0", "/jco/http.js"],
        ["wasi-sockets", "wasi:sockets/instance-network@0.2.12", "/jco/http/wasi-sockets.js"],
        ["wasi-http", "wasi:http/outgoing-handler@0.2.12", "/jco/http/wasi-http.js"],
    ])("generates the %s implementation facade", (nodejsHttpVia, capability, implementationModule) => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { ...modulePaths, nodejsHttpVia, onWitRequirement },
        );
        const id = plugin.resolveId("node:http");
        expect(id).toBe("\0jco-node-builtin:node:http");
        const source = plugin.load(id);
        expect(source).toContain(implementationModule);
        expect(source).toContain("export default http");
        expect(source).toContain("validateHeaderValue");
        expect(onWitRequirement).toHaveBeenCalledWith(expect.objectContaining({ witImport: capability }));
        if (nodejsHttpVia === "direct") {
            expect(onWitRequirement).toHaveBeenCalledWith(
                expect.objectContaining({
                    guestExports: [
                        {
                            witExport: "jco:node/http-callbacks@0.1.0",
                            jsExport: "httpCallbacks",
                            moduleSpecifier: HTTP_CALLBACKS_SPECIFIER,
                        },
                    ],
                }),
            );
        }
    });

    test.concurrent("resolves the direct callback implementation for an entry wrapper", () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { ...modulePaths, nodejsHttpVia: "direct" });
        const id = plugin.resolveId(HTTP_CALLBACKS_SPECIFIER);
        expect(id).toBe("\0jco-node-builtin:http-callbacks");
        expect(plugin.load(id)).toBe('export { httpCallbacks } from "/jco/http.js";');
    });

    test.concurrent("keeps the callback resource as an entry export after bundling", async () => {
        const root = await getTmpDir();
        const entry = join(root, "entry.js");
        const httpModule = join(root, "http.js");
        await writeFile(entry, 'import { createServer } from "node:http"; export { createServer };\n');
        await writeFile(
            httpModule,
            "export const httpCallbacks = { RequestListener: class RequestListener {} }; export default {};\n",
        );
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { httpModule });
        const bundleOptions = { plugins: [plugin] };
        const source = await bundleNodeGuestExportsWrapper(entry, HTTP_WIT_REQUIREMENT.guestExports, bundleOptions);
        expect(source).toContain("httpCallbacks");
        expect(source).toMatch(/export\s*\{[^}]*httpCallbacks/);
    });

    test.concurrent("does not intercept the bare http specifier", () => {
        expect(nodeBuiltinPlugin({ imports: [], exports: [] }, modulePaths).resolveId("http")).toBeNull();
    });

    test.each([
        ["wasi-sockets", "sockets"],
        ["wasi-http", "http"],
    ])("rejects an incompatible Preview 2 package for %s", (nodejsHttpVia, packageName) => {
        const plugin = nodeBuiltinPlugin(
            {
                imports: [
                    {
                        namespace: "wasi",
                        package: packageName,
                        interface: "types",
                        version: { major: 0n, minor: 2n, patch: 10n },
                    },
                ],
                exports: [],
            },
            { ...modulePaths, nodejsHttpVia },
        );
        expect(() => plugin.resolveId("node:http")).toThrow(/requires wasi:.*@0\.2\.12/);
    });

    test.concurrent("configures an opt-in direct Node provider as a JSPI import", () => {
        const opts = withDefaultNodeCapabilities({
            map: { "jco:node/http@0.1.0": "/application/http-host.js" },
        });
        expect(opts.asyncMode).toBe("jspi");
        expect(opts.asyncImports).toEqual([
            "jco:node/http@0.1.0#request",
            "jco:node/http@0.1.0#[method]server.listen",
            "jco:node/http@0.1.0#[method]server.close",
            "jco:node/http@0.1.0#[method]server.get-connections",
        ]);
        expect(opts.asyncExports).toEqual(["*"]);
    });
});

describe("node:http WIT installation", () => {
    test.concurrent("installs the typed direct interface idempotently", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(world, "package test:http;\nworld component {}\n");
        await injectNodeWitImports(root, undefined, [HTTP_WIT_REQUIREMENT]);
        expect(await injectNodeWitImports(root, undefined, [HTTP_WIT_REQUIREMENT])).toBeUndefined();
        const worldSource = await readFile(world, "utf8");
        expect(worldSource.match(/import jco:node\/http@0\.1\.0;/g)).toHaveLength(1);
        expect(worldSource.match(/export jco:node\/http-callbacks@0\.1\.0;/g)).toHaveLength(1);
        const source = await readFile(join(root, "deps/jco-node-0.1.0/http.wit"), "utf8");
        expect(source).toContain("request: func(options: request-options)");
        expect(source).toContain("resource server");
        const metadata = await componentWitMetadataForWorld({ tag: "path", val: root }, "component");
        expect(metadata.exports).toContainEqual(
            expect.objectContaining({ namespace: "jco", package: "node", interface: "http-callbacks" }),
        );
    });

    test.concurrent("adds only the missing side of the direct callback boundary", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(world, "package test:http;\nworld component {\n  import jco:node/http@0.1.0;\n}\n");
        const result = await injectNodeWitImports(root, undefined, [HTTP_WIT_REQUIREMENT]);
        expect(result).toMatchObject({ imports: [], exports: ["jco:node/http-callbacks@0.1.0"] });
        const source = await readFile(world, "utf8");
        expect(source.match(/import jco:node\/http@0\.1\.0;/g)).toHaveLength(1);
        expect(source.match(/export jco:node\/http-callbacks@0\.1\.0;/g)).toHaveLength(1);
    });

    test.concurrent("preserves an aliased callback export while adding the missing import", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(
            world,
            "package test:http;\nworld component {\n  export callbacks: jco:node/http-callbacks@0.1.0;\n}\n",
        );
        const result = await injectNodeWitImports(root, undefined, [HTTP_WIT_REQUIREMENT]);
        expect(result).toMatchObject({ imports: ["jco:node/http@0.1.0"], exports: [] });
        const source = await readFile(world, "utf8");
        expect(source.match(/import jco:node\/http@0\.1\.0;/g)).toHaveLength(1);
        expect(source.match(/http-callbacks@0\.1\.0;/g)).toHaveLength(1);
    });

    test.each([
        ["wasi-sockets", HTTP_WASI_SOCKETS_WIT_REQUIREMENTS, "wasi-sockets-0.2.12"],
        ["wasi-http", HTTP_WASI_HTTP_WIT_REQUIREMENTS, "wasi-http-0.2.12"],
    ])(
        "installs all %s package dependencies and produces valid selected-world metadata",
        async (_, requirements, dependency) => {
            const root = await getTmpDir();
            await writeFile(
                join(root, "worlds.wit"),
                "package test:http;\nworld unused {}\nworld component { export run: func(); }\n",
            );
            await injectNodeWitImports(root, "component", [...requirements]);
            expect(await injectNodeWitImports(root, "component", [...requirements])).toBeUndefined();
            await expect(stat(join(root, `deps/${dependency}/package.wit`))).resolves.toBeDefined();
            const metadata = await componentWitMetadataForWorld({ tag: "path", val: root }, "component");
            for (const requirement of requirements) {
                const [namespaceAndPackage, interfaceAndVersion] = requirement.witImport.split("/");
                const [namespace, packageName] = namespaceAndPackage.split(":");
                const [interfaceName] = interfaceAndVersion.split("@");
                expect(metadata.imports).toContainEqual(
                    expect.objectContaining({ namespace, package: packageName, interface: interfaceName }),
                );
            }
        },
    );
});

describe("node:http in a component", () => {
    // TODO(unskip): use the published jco-std HTTP server exports once a release containing them is available.
    test.skip("serves a request through guest -> WIT callback resource -> host node:http", async () => {
        const { componentPath, stderr } = await componentizeFixture({
            fixture: "node-http-server",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "starlingmonkey", "--with-nodejs-http-via", "direct"],
        });
        expect(stderr).toContain("Jco added generated WIT import");
        expect(stderr).toContain("jco:node/http-callbacks@0.1.0");
        const { esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: { name: "node-http-server", path: componentPath, skipInstantiation: true },
            jco: {
                transpile: {
                    extraArgs: {
                        asyncExports: ["*"],
                        map: { "jco:node/http@0.1.0": NODE_HOST },
                    },
                },
            },
        });
        try {
            const runner = fileURLToPath(new URL("../fixtures/componentize/node-http-server/run.js", import.meta.url));
            const output = await exec(runner, esModuleOutputPath, NODE_HOST);
            expect(output.stdout.trim()).toBe("POST /items: hello");
        } finally {
            await cleanup();
        }
    }, 600_000);

    // TODO(unskip): use the published jco-std HTTP exports once a release containing them is available.
    test.skip.each(["direct", "wasi-sockets", "wasi-http"])(
        "componentizes and performs a local request via %s",
        async (implementation) => {
            const { componentPath, stderr } = await componentizeFixture({
                fixture: "node-http",
                bundle: true,
                copy: true,
                extraArgs: ["--backend", "starlingmonkey", "--with-nodejs-http-via", implementation],
            });
            // `--with-nodejs-http-via` selects which capability is injected; a wrong mode still
            // injects *something*, so the assertion names the interface the mode must add.
            const injected = {
                direct: "jco:node/http@0.1.0",
                "wasi-sockets": "wasi:sockets/instance-network@0.2.12",
                "wasi-http": "wasi:http/outgoing-handler@0.2.12",
            }[implementation];
            expect(stderr).toContain("Jco added generated WIT import");
            expect(stderr).toContain(injected);
            const map = implementation === "direct" ? { "jco:node/http@0.1.0": NODE_HOST } : undefined;
            const { esModuleOutputPath, cleanup } = await setupAsyncTest({
                component: { name: `node-http-${implementation}`, path: componentPath, skipInstantiation: true },
                jco: { transpile: { extraArgs: { asyncExports: ["run"], map } } },
            });
            try {
                const runner = fileURLToPath(new URL("../fixtures/componentize/node-http/run.js", import.meta.url));
                const output = await exec(runner, esModuleOutputPath, implementation === "direct" ? NODE_HOST : "");
                expect(JSON.parse(output.stdout)).toEqual({
                    statusCode: 200,
                    contentType: "text/plain",
                    body: "hello from node:http",
                });
            } finally {
                await cleanup();
            }
        },
        600_000,
    );
});
