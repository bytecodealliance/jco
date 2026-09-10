import nodeDgram from "node:dgram";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { DGRAM_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { withDefaultNodeCapabilities } from "../../src/cmd/transpile.js";
import { worldMetadataFor } from "../../src/cmd/componentize.js";
import { componentizeFixture, exec, getTmpDir, setupAsyncTest } from "../helpers.js";
import { hasJspi } from "../common.js";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import * as deniedHost from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dgram/host";

const NODE_HOST = import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dgram/host/node");

test("node:dgram requests only its UDP capability and callback export", async () => {
    const onWitRequirement = vi.fn();
    const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { dgramModule: "/test/dgram.js", onWitRequirement });
    expect(plugin.resolveId("dgram")).toBeNull();
    expect(plugin.resolveId("node:dgram")).toBe("\0jco-node-builtin:node:dgram");
    expect(onWitRequirement).toHaveBeenCalledExactlyOnceWith(DGRAM_WIT_REQUIREMENT);
    expect(plugin.load(plugin.resolveId("node:dgram"))).toContain("/test/dgram.js");
    expect(plugin.load(plugin.resolveId("jco:node-dgram-callbacks"))).toContain("dgramCallbacks");
    const root = await getTmpDir();
    await writeFile(join(root, "component.wit"), "package test:udp; world component {}\n");
    await injectNodeWitImports(root, undefined, [DGRAM_WIT_REQUIREMENT]);
    expect(await injectNodeWitImports(root, undefined, [DGRAM_WIT_REQUIREMENT])).toBeUndefined();
    const metadata = await worldMetadataFor(root, "component");
    expect(metadata.imports).toHaveLength(1);
    expect(metadata.exports).toHaveLength(1);
    expect(await readFile(join(root, "deps/jco-node-0.1.0/dgram.wit"), "utf8")).toContain("resource socket");
});

test("UDP defaults to denial and preserves explicit host mappings", () => {
    expect(withDefaultNodeCapabilities({}).map["jco:node/dgram@0.1.0"]).toMatch(/dgram\/host$/);
    expect(
        withDefaultNodeCapabilities({ map: { "jco:node/dgram@0.1.0": "jco:node/dgram@0.1.0" } }).map[
            "jco:node/dgram@0.1.0"
        ],
    ).toBe("jco:node/dgram@0.1.0");
});

const hasSyncUdp =
    typeof nodeDgram.Socket.prototype.bindSync === "function" &&
    typeof nodeDgram.Socket.prototype.connectSync === "function";

describe.skipIf(!hasJspi)("node:dgram components", () => {
    for (const backend of ["starlingmonkey", "quickjs"]) {
        describe(backend, () => {
            let componentPath;
            beforeAll(async () => {
                ({ componentPath } = await componentizeFixture({
                    fixture: "node-dgram",
                    bundle: true,
                    copy: true,
                    extraArgs: ["--backend", backend],
                }));
            }, 600_000);
            test("module shape, 35 guest contract checks and catchable denial", async () => {
                const denied = await setupAsyncTest({
                    component: {
                        name: "node-dgram-denied",
                        path: componentPath,
                        imports: {
                            ...new WASIShim().getImportObject(),
                            "jco:node/dgram@0.1.0": deniedHost,
                        },
                    },
                    jco: {
                        transpile: {
                            extraArgs: {
                                map: { "jco:node/dgram@0.1.0": "jco:node/dgram@0.1.0" },
                            },
                        },
                    },
                });
                try {
                    expect(JSON.parse(await denied.instance.shape()).identity).toBe(true);
                    expect(await denied.instance.contract()).toBe(35);
                    expect(await denied.instance.denied()).toMatch(/^ERR_JCO_DGRAM_ADAPTER_REQUIRED:/);
                } finally {
                    await denied.cleanup();
                }
            });
            // TODO(quickjs): host-invoked exported resource methods trap (also
            // documented by node:inspector). Node 22 lacks bindSync/connectSync.
            test.skipIf(backend === "quickjs" || !hasSyncUdp)(
                "real IPv4/IPv6 UDP client/server with isolated Node providers",
                async () => {
                    const granted = await setupAsyncTest({
                        component: { name: "node-dgram", path: componentPath, skipInstantiation: true },
                        jco: {
                            transpile: {
                                extraArgs: {
                                    asyncMode: "jspi",
                                    asyncExports: ["*"],
                                    map: { "jco:node/dgram@0.1.0": "jco:node/dgram@0.1.0" },
                                },
                            },
                        },
                    });
                    try {
                        const runner = fileURLToPath(
                            new URL("../fixtures/componentize/node-dgram/run.js", import.meta.url),
                        );
                        expect((await exec(runner, granted.esModuleOutputPath, NODE_HOST)).stdout.trim()).toBe(
                            "UDP component passthrough OK",
                        );
                    } finally {
                        await granted.cleanup();
                    }
                },
                600_000,
            );
        });
    }
});
