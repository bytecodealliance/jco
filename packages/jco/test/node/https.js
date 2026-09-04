import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, test, vi } from "vitest";

import { withDefaultNodeCapabilities } from "../../src/cmd/transpile.js";
import { nodeBuiltinPlugin } from "../../src/node-builtins.js";
import {
    HTTP_WIT_REQUIREMENT,
    HTTPS_WASI_HTTP_WIT_REQUIREMENTS,
    HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS,
    HTTPS_WIT_REQUIREMENT,
    injectNodeWitImports,
} from "../../src/node-wit.js";
import { componentizeFixture, exec, getTmpDir, setupAsyncTest } from "../helpers.js";

const modulePaths = {
    httpModule: "/jco/http.js",
    httpCoreModule: "/jco/http/core.js",
    httpWasiSocketsImplementationModule: "/jco/http/wasi-sockets.js",
    httpWasiHttpImplementationModule: "/jco/http/wasi-http.js",
    httpsModule: "/jco/https.js",
    httpsCoreModule: "/jco/https/core.js",
};

const HTTPS_EXPORTS = ["Agent", "Server", "createServer", "get", "globalAgent", "request"];

const NODE_HOST = pathToFileURL(
    fileURLToPath(new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/http-host-node.js", import.meta.url)),
).href;

describe("node:https builtin adapter", () => {
    test.each([
        ["direct", "jco:node/http@0.1.0", "/jco/https.js"],
        ["wasi-sockets", "wasi:sockets/instance-network@0.2.12", "/jco/https/core.js"],
        ["wasi-http", "wasi:http/outgoing-handler@0.2.12", "/jco/https/core.js"],
    ])("generates the %s implementation facade", (nodejsHttpVia, capability, implementationModule) => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { ...modulePaths, nodejsHttpVia, onWitRequirement },
        );
        const id = plugin.resolveId("node:https");
        expect(id).toBe("\0jco-node-builtin:node:https");
        const source = plugin.load(id);
        expect(source).toContain(implementationModule);
        expect(source).toContain("export default https");
        for (const name of HTTPS_EXPORTS) {
            expect(source).toMatch(new RegExp(`\\b${name}\\b`));
        }
        // The six-export surface must not leak node:http-only names.
        expect(source).not.toContain("validateHeaderValue");
        expect(source).not.toContain("STATUS_CODES");
        if (nodejsHttpVia !== "direct") {
            expect(source).toContain("createHttps(");
        }
        expect(onWitRequirement).toHaveBeenCalledWith(
            expect.objectContaining({ witImport: capability, nodeSpecifier: "node:https" }),
        );
    });

    test.concurrent("shares the direct host interface and callback export with node:http", () => {
        expect(HTTPS_WIT_REQUIREMENT.witImport).toBe(HTTP_WIT_REQUIREMENT.witImport);
        expect(HTTPS_WIT_REQUIREMENT.guestExports).toEqual(HTTP_WIT_REQUIREMENT.guestExports);
        expect(HTTPS_WIT_REQUIREMENT.dependencySources).toEqual(HTTP_WIT_REQUIREMENT.dependencySources);
        for (const [https, http] of [
            [HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS, "wasi:sockets/instance-network@0.2.12"],
            [HTTPS_WASI_HTTP_WIT_REQUIREMENTS, "wasi:http/outgoing-handler@0.2.12"],
        ]) {
            expect(https.map(({ witImport }) => witImport)).toContain(http);
            expect(https.every(({ nodeSpecifier }) => nodeSpecifier === "node:https")).toBe(true);
        }
    });

    test.concurrent("resolves node:https without touching the node:http entry points", () => {
        // Only the https path is configured; resolving the real package for node:http would fail.
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { httpsModule: "/jco/https.js" });
        const id = plugin.resolveId("node:https");
        expect(plugin.load(id)).toContain('from "/jco/https.js"');
    });

    test.concurrent("does not intercept the bare https specifier", () => {
        expect(nodeBuiltinPlugin({ imports: [], exports: [] }, modulePaths).resolveId("https")).toBeNull();
    });

    test.each([
        ["wasi-sockets", "sockets"],
        ["wasi-http", "http"],
    ])("rejects an incompatible Preview 2 package for %s, naming node:https", (nodejsHttpVia, packageName) => {
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
        expect(() => plugin.resolveId("node:https")).toThrow(/node:https via .* requires wasi:.*@0\.2\.12/);
    });
});

describe("node:https WIT installation", () => {
    test.concurrent("injects one shared import when a guest uses both protocol modules", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(world, "package test:https;\nworld component {}\n");
        const result = await injectNodeWitImports(root, undefined, [HTTP_WIT_REQUIREMENT, HTTPS_WIT_REQUIREMENT]);
        expect(result).toMatchObject({
            imports: ["jco:node/http@0.1.0"],
            exports: ["jco:node/http-callbacks@0.1.0"],
        });
        const worldSource = await readFile(world, "utf8");
        expect(worldSource.match(/import jco:node\/http@0\.1\.0;/g)).toHaveLength(1);
        expect(worldSource.match(/export jco:node\/http-callbacks@0\.1\.0;/g)).toHaveLength(1);
        const source = await readFile(join(root, "deps/jco-node-0.1.0/http.wit"), "utf8");
        expect(source).toContain("record tls-options");
        expect(source).toContain("tls: option<tls-options>");
        expect(await injectNodeWitImports(root, undefined, [HTTPS_WIT_REQUIREMENT])).toBeUndefined();
    });

    test.concurrent("names node:https in the generated comment for an https-only guest", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(world, "package test:https;\nworld component {}\n");
        await injectNodeWitImports(root, undefined, [HTTPS_WIT_REQUIREMENT]);
        const worldSource = await readFile(world, "utf8");
        expect(worldSource).toContain("bundled source imports node:https");
        expect(worldSource).toContain("import jco:node/http@0.1.0;");
    });
});

// The direct mode's guest tests need two things before they can run: a published jco-std that
// carries the node:https exports, and a working direct round trip. Today a transpiled component
// also imports `jco:node/http-callbacks` (the `http` interface `use`s it, so the world imports it
// transitively) and the JSPI-suspended `request` import hands `undefined` back to the guest; the
// same happens for plain node:http, see the sibling tests in http.js.
describe("node:https in a component", () => {
    // TODO(unskip): use the published jco-std node:https exports once a release containing them
    // is available, and remove the callbacks/JSPI blockers described above.
    test.skip("terminates TLS for a guest server through the host node:https", async () => {
        const { componentPath, stderr } = await componentizeFixture({
            fixture: "node-https-server",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "starlingmonkey", "--with-nodejs-http-via", "direct"],
        });
        expect(stderr).toContain("Jco added generated WIT import jco:node/http@0.1.0");
        expect(stderr).toContain("jco:node/http-callbacks@0.1.0");
        const { esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: { name: "node-https-server", path: componentPath, skipInstantiation: true },
            jco: {
                transpile: {
                    // The same defaults the CLI applies: JSPI plus the async host imports.
                    extraArgs: withDefaultNodeCapabilities({
                        asyncExports: ["*"],
                        map: { "jco:node/http@0.1.0": NODE_HOST },
                    }),
                },
            },
        });
        try {
            const runner = fileURLToPath(new URL("../fixtures/componentize/node-https-server/run.js", import.meta.url));
            const output = await exec(runner, esModuleOutputPath, NODE_HOST);
            expect(output.stdout.trim()).toBe("POST /items: hello");
        } finally {
            await cleanup();
        }
    }, 600_000);

    // TODO(unskip): same blockers as above.
    test.skip("performs a verified HTTPS request from a guest through the host node:https", async () => {
        const { componentPath, stderr } = await componentizeFixture({
            fixture: "node-https",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", "starlingmonkey", "--with-nodejs-http-via", "direct"],
        });
        expect(stderr).toContain("Jco added generated WIT import jco:node/http@0.1.0");
        const { esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: { name: "node-https-direct", path: componentPath, skipInstantiation: true },
            jco: {
                transpile: {
                    extraArgs: withDefaultNodeCapabilities({
                        asyncExports: ["run"],
                        map: { "jco:node/http@0.1.0": NODE_HOST },
                    }),
                },
            },
        });
        try {
            const runner = fileURLToPath(new URL("../fixtures/componentize/node-https/run.js", import.meta.url));
            const output = await exec(runner, esModuleOutputPath, NODE_HOST);
            expect(JSON.parse(output.stdout)).toEqual({
                statusCode: 200,
                contentType: "text/plain",
                body: "hello from node:https",
            });
        } finally {
            await cleanup();
        }
    }, 600_000);
});
