import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test, vi } from "vitest";

import { bundleComponentSource } from "../../src/bundle.js";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import {
    injectNodeWitImports,
    NET_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS,
    NET_WASI_SOCKETS_WIT_REQUIREMENTS,
} from "../../src/node-wit.js";
import { exec, getTmpDir, jcoPath, setupAsyncTest } from "../helpers.js";
import { hasJspi } from "../common.js";

const NET_EXPORTS = [
    "BlockList",
    "BoundSocket",
    "Server",
    "Socket",
    "SocketAddress",
    "Stream",
    "_createServerHandle",
    "_normalizeArgs",
    "connect",
    "createConnection",
    "createServer",
    "getDefaultAutoSelectFamily",
    "getDefaultAutoSelectFamilyAttemptTimeout",
    "isIP",
    "isIPv4",
    "isIPv6",
    "setDefaultAutoSelectFamily",
    "setDefaultAutoSelectFamilyAttemptTimeout",
];

describe("node:net builtin adapter", () => {
    test.each(["0.2.12", "0.2.10"])("generates the Preview 2 %s facade", (wasiSocketsVersion) => {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { netCoreModule: "/jco/net/core.js", wasiSocketsVersion, onWitRequirement },
        );
        const id = plugin.resolveId("node:net");
        expect(id).toBe("\0jco-node-builtin:node:net");
        const source = plugin.load(id);
        expect(source).toContain('from "/jco/net/core.js"');
        expect(source).toContain(`wasi:sockets/instance-network@${wasiSocketsVersion}`);
        expect(source).toContain(`wasi:sockets/tcp-create-socket@${wasiSocketsVersion}`);
        expect(source).toContain("createNet(");
        expect(source).toContain("export default net");
        for (const name of NET_EXPORTS) {
            expect(source).toMatch(new RegExp(`\\b${name}\\b`));
        }
        expect(onWitRequirement).toHaveBeenCalledTimes(7);
        expect(onWitRequirement).toHaveBeenCalledWith(
            expect.objectContaining({
                nodeSpecifier: "node:net",
                witImport: `wasi:sockets/instance-network@${wasiSocketsVersion}`,
            }),
        );
        if (wasiSocketsVersion === "0.2.10") {
            expect(source).toContain("u64: value => BigInt(value)");
            expect(source).toContain("schedule: task => setTimeout(task, 0)");
        }
    });

    test("resolves bare net and tree-shakes an unused builtin", async () => {
        const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { netCoreModule: "/jco/net/core.js" });
        expect(await plugin.resolveId.call({ resolve: async () => null }, "net")).toBe("\0jco-node-builtin:node:net");
        const root = await getTmpDir();
        const entry = join(root, "entry.js");
        await writeFile(entry, "export const answer = 42;\n");
        const source = await bundleComponentSource(entry, { plugins: [plugin] });
        expect(source).not.toContain("wasi:sockets/instance-network");
        expect(source).not.toContain("/jco/net/core.js");
    });

    test("rejects an incompatible Preview 2 sockets package", () => {
        const plugin = nodeBuiltinPlugin(
            {
                imports: [
                    {
                        namespace: "wasi",
                        package: "sockets",
                        interface: "tcp",
                        version: { major: 0n, minor: 2n, patch: 10n },
                    },
                ],
                exports: [],
            },
            { netCoreModule: "/jco/net/core.js" },
        );
        expect(() => plugin.resolveId("node:net")).toThrow(/node:net via wasi-sockets requires wasi:sockets@0\.2\.12/);
    });
});

describe("node:net WIT installation", () => {
    test.each([
        ["0.2.12", NET_WASI_SOCKETS_WIT_REQUIREMENTS],
        ["0.2.10", NET_WASI_SOCKETS_0_2_10_WIT_REQUIREMENTS],
    ])("installs only standard wasi:sockets %s requirements", async (version, requirements) => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(world, "package test:net;\nworld component {}\n");
        const result = await injectNodeWitImports(root, undefined, requirements);
        expect(result?.imports).toContain(`wasi:sockets/instance-network@${version}`);
        expect(result?.imports).toContain(`wasi:sockets/tcp@${version}`);
        expect(result?.exports).toEqual([]);
        const source = await readFile(world, "utf8");
        expect(source).toContain("bundled source imports node:net");
        expect(source).not.toContain("jco:node/net");
    });
});

// Async component exports require JSPI, which Node 22 lacks even with its experimental flag.
describe.skipIf(!hasJspi)("node:net in a component", () => {
    test.each(["quickjs", "starlingmonkey"])(
        "runs TCP clients and servers using %s",
        async (backend) => {
            const root = await getTmpDir();
            const fixture = fileURLToPath(new URL("../fixtures/componentize/node-net/", import.meta.url));
            const wit = join(root, "wit");
            await cp(join(fixture, backend === "quickjs" ? "wit" : "wit-starling"), wit, { recursive: true });
            const requirements = [];
            // Exercise the actual adapter against the workspace build, independent of npm publication.
            const plugin = nodeBuiltinPlugin(
                { imports: [], exports: [] },
                {
                    netCoreModule: fileURLToPath(
                        new URL("../../../jco-std/dist/wasi/0.2.x/node/24.x.x/net/core.js", import.meta.url),
                    ),
                    wasiSocketsVersion: backend === "quickjs" ? "0.2.12" : "0.2.10",
                    onWitRequirement: (requirement) => requirements.push(requirement),
                },
            );
            const source = await bundleComponentSource(join(fixture, "component.js"), { plugins: [plugin] });
            const entry = join(root, "component.js");
            await writeFile(entry, source);
            await injectNodeWitImports(wit, undefined, requirements);
            const componentPath = join(root, "component.wasm");
            await exec(jcoPath, "componentize", entry, "-w", wit, "-o", componentPath, "--backend", backend);
            const { esModuleOutputPath, cleanup } = await setupAsyncTest({
                component: { name: `node-net-${backend}`, path: componentPath, skipInstantiation: true },
                jco: { transpile: { extraArgs: { asyncExports: ["*"] } } },
            });
            try {
                const output = await exec(join(fixture, "run.js"), esModuleOutputPath);
                expect(JSON.parse(output.stdout)).toEqual({
                    surface: { exports: NET_EXPORTS, aliases: true, ipv6: 6, blocked: true },
                    client: "host:client",
                    server: "guest:runner",
                });
            } finally {
                await cleanup();
            }
        },
        600_000,
    );
});
