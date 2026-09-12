import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import nodeHttp from "node:http";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { worldMetadataFor } from "../../src/cmd/componentize.js";
import { describe, expect, test, vi } from "vitest";

import { withDefaultNodeCapabilities } from "../../src/cmd/transpile.js";
import { bundleNodeGuestExportsWrapper } from "../../src/cmd/componentize.js";
import { HTTP_CALLBACKS_SPECIFIER, nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import {
    HTTP_WASI_HTTP_WIT_REQUIREMENTS,
    HTTP_WASI_SOCKETS_WIT_REQUIREMENTS,
    HTTP_WIT_REQUIREMENT,
    injectNodeWitImports,
} from "../../src/node-wit.js";
import { componentizeFixture, exec, getTmpDir, setupAsyncTest } from "../helpers.js";
import { hasJspi } from "../common.js";

const modulePaths = {
    httpModule: "/jco/http.js",
    httpCoreModule: "/jco/http/core.js",
    httpWasiSocketsImplementationModule: "/jco/http/wasi-sockets.js",
    httpWasiHttpImplementationModule: "/jco/http/wasi-http.js",
};

const NODE_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host/node");

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
            "export const httpCallbacks = { RequestListener: class {}, takeRequestListener() {} }; export default {};\n",
        );
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { httpModule });
        const bundleOptions = { plugins: [plugin] };
        const source = await bundleNodeGuestExportsWrapper(entry, HTTP_WIT_REQUIREMENT.guestExports, bundleOptions);
        expect(source).toContain("httpCallbacks");
        expect(source).toMatch(/export\s*\{[^}]*httpCallbacks/);
    });

    test.concurrent("resolves bare http when no installed package shadows it", async () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, modulePaths);
        expect(await plugin.resolveId.call({ resolve: async () => null }, "http")).toBe("\0jco-node-builtin:node:http");
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
        const metadata = await worldMetadataFor(root, "component");
        expect(metadata.imports).not.toContainEqual(
            expect.objectContaining({ namespace: "jco", package: "node", interface: "http-callbacks" }),
        );
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
            const metadata = await worldMetadataFor(root, "component");
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

describe.skipIf(!hasJspi)("node:http in a component", () => {
    test("serves a request through guest -> WIT callback resource -> host node:http", async () => {
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

    test.concurrent("serves a request over wasi:sockets", async () => {
        const { componentPath } = await componentizeFixture({
            fixture: "node-http-sockets-server",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "starlingmonkey", "--with-nodejs-http-via", "wasi-sockets"],
        });
        const { esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: { name: "node-http-sockets-server", path: componentPath, skipInstantiation: true },
            jco: { transpile: { extraArgs: { asyncExports: ["start", "stop"] } } },
        });
        const runner = fileURLToPath(
            new URL("../fixtures/componentize/node-http-sockets-server/run.js", import.meta.url),
        );
        // The guest blocks inside `start()` to accept connections, so it runs as its own
        // process and reports the port it chose on stderr.
        const server = spawn(process.execPath, [runner, esModuleOutputPath]);
        try {
            const port = await new Promise((resolve, reject) => {
                let output = "";
                const timer = setTimeout(() => reject(new Error(`no port in: ${output}`)), 120_000);
                server.stderr.on("data", (chunk) => {
                    output += chunk;
                    const match = /listening on (\d+)/.exec(output);
                    if (match) {
                        clearTimeout(timer);
                        resolve(Number(match[1]));
                    }
                });
                server.once("error", (error) => {
                    clearTimeout(timer);
                    reject(error);
                });
                server.once("exit", (code) => {
                    clearTimeout(timer);
                    reject(new Error(`exited with ${code}: ${output}`));
                });
            });

            const body = await new Promise((resolve, reject) => {
                const request = nodeHttp.request(`http://127.0.0.1:${port}/items`, { method: "POST" }, (response) => {
                    response.setEncoding("utf8");
                    const chunks = [];
                    response.on("data", (chunk) => chunks.push(chunk));
                    response.once("end", () => resolve(chunks.join("")));
                });
                request.once("error", reject);
                request.end("hello");
            });
            expect(body).toBe("POST /items: hello");
        } finally {
            server.kill();
            await cleanup();
        }
    }, 600_000);

    test.concurrent.each(["direct", "wasi-sockets", "wasi-http"])(
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
                "wasi-sockets": "wasi:sockets/instance-network@0.2.10",
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
