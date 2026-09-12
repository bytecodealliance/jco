import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { expect, test } from "vitest";
import { ZLIB_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { withDefaultNodeCapabilityMap } from "../../src/cmd/transpile.js";
import { componentizeFixture, getTmpDir, setupAsyncTest } from "../helpers.js";

const NODE_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/zlib/host/node");
const DENY_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/zlib/host");

test("zlib builtin reports only its compression capability and preserves explicit mappings", async () => {
    const requirements = [];
    const plugin = nodeBuiltinPlugin(
        { imports: [], exports: [] },
        { zlibModule: "/zlib.js", onWitRequirement: (value) => requirements.push(value) },
    );
    // Bare imports prefer an installed package before falling back to the builtin.
    const installedPackage = { id: "/app/node_modules/zlib/index.js" };
    const installedResolution = { resolve: async () => installedPackage };

    expect(await plugin.resolveId.call(installedResolution, "zlib")).toBeNull();
    expect(plugin.resolveId("node:zlib/iter")).toBeNull();
    const id = plugin.resolveId("node:zlib");
    expect(id).toBe("\0jco-node-builtin:node:zlib");
    expect(requirements).toEqual([ZLIB_WIT_REQUIREMENT]);
    expect(plugin.load(id)).toContain('from "/zlib.js"');

    const missingResolution = { resolve: async () => null };

    expect(await plugin.resolveId.call(missingResolution, "zlib")).toBe(id);

    const defaults = withDefaultNodeCapabilityMap({});
    expect(defaults["jco:node/zlib@0.1.0"]).toBe("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/zlib/host");
    expect(withDefaultNodeCapabilityMap({ "jco:node/zlib@0.1.0": NODE_HOST })["jco:node/zlib@0.1.0"]).toBe(NODE_HOST);
});

test("installs the zlib WIT resource once", async () => {
    const root = await getTmpDir();
    const world = join(root, "component.wit");
    await writeFile(world, "package test:zlib;\nworld component {}\n");
    const result = await injectNodeWitImports(root, undefined, [ZLIB_WIT_REQUIREMENT]);
    expect(result.imports).toEqual(["jco:node/zlib@0.1.0"]);
    expect(await readFile(join(root, "deps/jco-node-0.1.0/zlib.wit"), "utf8")).toEqual(
        await readFile(new URL("../../../jco-std/wit/node-0.1.0/zlib.wit", import.meta.url), "utf8"),
    );
    expect(await injectNodeWitImports(root, undefined, [ZLIB_WIT_REQUIREMENT])).toBeUndefined();
});

test.each(["quickjs", "starlingmonkey"])(
    "node:zlib runs with Node and deny providers in %s",
    async (backend) => {
        const { componentPath } = await componentizeFixture({
            fixture: "node-zlib",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", backend],
        });
        for (const mode of ["node", "denied"]) {
            const hostSpecifier = mode === "node" ? NODE_HOST : DENY_HOST;
            const { instance, cleanup } = await setupAsyncTest({
                component: {
                    name: `node-zlib-${backend}-${mode}`,
                    path: componentPath,
                    imports: { ...new WASIShim().getImportObject(), [hostSpecifier]: await import(hostSpecifier) },
                },
                jco: { transpile: { extraArgs: { map: { "jco:node/zlib@0.1.0": hostSpecifier } } } },
            });
            try {
                const report = JSON.parse(instance.run(mode === "denied"));
                if (mode === "node" && backend === "starlingmonkey") {
                    report.callback = await instance.runAsync();
                }

                if (mode === "denied") {
                    expect(report).toEqual({
                        errors: Array(3).fill({ name: "Error", code: "ERR_JCO_ZLIB_ADAPTER_REQUIRED" }),
                        constant: 4,
                    });
                } else {
                    expect(report).toEqual({
                        identity: true,
                        roundTrips: Array(5).fill(true),
                        ...(backend === "starlingmonkey" ? { callback: true } : {}),
                        incremental: true,
                        streamText: "firstsecond",
                        streamType: true,
                        bytesWritten: 11,
                        checksum: 0xcbf43926,
                        info: true,
                        corrupt: { name: "Error", code: "Z_DATA_ERROR" },
                    });
                }
            } finally {
                await cleanup();
            }
        }
    },
    600_000,
);
