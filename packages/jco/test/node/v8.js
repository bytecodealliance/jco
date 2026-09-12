import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { expect, test, vi } from "vitest";
import { V8_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { withDefaultNodeCapabilities } from "../../src/cmd/transpile.js";
import { componentizeFixture, getTmpDir, setupAsyncTest } from "../helpers.js";

const NODE_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/v8/host/node");
const DENY_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/v8/host");

test("resolves node:v8 with only its explicit capability", () => {
    const onWitRequirement = vi.fn();
    const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { v8Module: "/v8.js", onWitRequirement });

    expect(plugin.resolveId("v8")).toBeNull();
    expect(plugin.resolveId("node:v8/missing")).toBeNull();
    expect(onWitRequirement).not.toHaveBeenCalled();

    const id = plugin.resolveId("node:v8");

    expect(plugin.load(id)).toContain('from "/v8.js"');
    expect(onWitRequirement).toHaveBeenCalledExactlyOnceWith(V8_WIT_REQUIREMENT);
    expect(withDefaultNodeCapabilities({}).map["jco:node/v8@0.1.0"]).toMatch(/v8\/host$/);
    expect(withDefaultNodeCapabilities({ map: { "jco:node/v8@0.1.0": NODE_HOST } }).map["jco:node/v8@0.1.0"]).toBe(
        NODE_HOST,
    );
});

test("installs the matching V8 WIT contract once", async () => {
    const root = await getTmpDir();

    await writeFile(join(root, "component.wit"), "package test:v8;\nworld component {}\n");

    const result = await injectNodeWitImports(root, undefined, [V8_WIT_REQUIREMENT]);

    expect(result.imports).toEqual(["jco:node/v8@0.1.0"]);
    expect(await readFile(join(root, "deps/jco-node-0.1.0/v8.wit"), "utf8")).toEqual(
        await readFile(new URL("../../../jco-std/wit/node-0.1.0/v8.wit", import.meta.url), "utf8"),
    );
    expect(await injectNodeWitImports(root, undefined, [V8_WIT_REQUIREMENT])).toBeUndefined();
});

test.each(["quickjs", "starlingmonkey"])(
    "node:v8 with native and denied providers in %s",
    async (backend) => {
        const { componentPath } = await componentizeFixture({
            fixture: "node-v8",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", backend],
        });

        for (const mode of ["node", "denied"]) {
            const hostSpecifier = mode === "node" ? NODE_HOST : DENY_HOST;
            const { instance, cleanup } = await setupAsyncTest({
                component: {
                    name: `node-v8-${backend}-${mode}`,
                    path: componentPath,
                    imports: { ...new WASIShim().getImportObject(), [hostSpecifier]: await import(hostSpecifier) },
                },
                jco: { transpile: { extraArgs: { map: { "jco:node/v8@0.1.0": hostSpecifier } } } },
            });

            try {
                const report = JSON.parse(instance.run(mode === "denied"));

                if (mode === "denied") {
                    expect(report).toEqual({
                        errors: Array(3).fill({ name: "Error", code: "ERR_JCO_V8_ADAPTER_REQUIRED" }),
                        buildingSnapshot: false,
                    });
                } else {
                    expect(report).toEqual({
                        module: true,
                        graph: true,
                        bytes: true,
                        types: true,
                        special: true,
                        scalar: [0xffffffff, [0xffffffff, 0xfffffffe], -0.25, "abc"],
                        identity: true,
                        tag: true,
                        heap: true,
                        spaces: true,
                        code: true,
                        cpp: true,
                        gc: true,
                        cpu: true,
                        unsupported: Array(3).fill("ERR_JCO_UNSUPPORTED_NODE_API"),
                    });
                }
            } finally {
                await cleanup();
            }
        }
    },
    600_000,
);
