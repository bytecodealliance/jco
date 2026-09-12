import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { WORKER_THREADS_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { bundleNodeGuestExportsWrapper } from "../../src/cmd/componentize.js";
import { withDefaultNodeCapabilities } from "../../src/cmd/transpile.js";
import { exec, getTmpDir, jcoPath, setupAsyncTest } from "../helpers.js";
import { hasJspi } from "../common.js";
import * as denied from "../../../jco-std/src/wasi/0.2.x/node/24.x.x/worker-threads-host.js";
import { loadNodeProvider } from "../../../jco-std/test/wasi/0.2.x/node/24.x.x/helpers/worker-threads.js";

const fixture = fileURLToPath(new URL("../fixtures/componentize/node-worker-threads/", import.meta.url));
const workerThreadsModule = fileURLToPath(
    new URL("../../../jco-std/src/wasi/0.2.x/node/24.x.x/worker-threads.ts", import.meta.url),
);

test("worker_threads requests its own capability and callback and keeps bare imports unresolved", async () => {
    const onWitRequirement = vi.fn();
    const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { workerThreadsModule, onWitRequirement });
    expect(plugin.resolveId("worker_threads")).toBeNull();
    expect(plugin.resolveId("node:worker_threads/missing")).toBeNull();
    expect(plugin.resolveId("node:worker_threads")).toBe("\0jco-node-builtin:node:worker_threads");
    expect(onWitRequirement).toHaveBeenCalledExactlyOnceWith(WORKER_THREADS_WIT_REQUIREMENT);
    expect(plugin.load(plugin.resolveId("jco:node-worker-threads-callbacks"))).toContain("workerThreadsCallbacks");
    const root = await getTmpDir();
    await writeFile(join(root, "component.wit"), "package test:workers; world component {}\n");
    await injectNodeWitImports(root, undefined, [WORKER_THREADS_WIT_REQUIREMENT]);
    expect(await injectNodeWitImports(root, undefined, [WORKER_THREADS_WIT_REQUIREMENT])).toBeUndefined();
    expect(await readFile(join(root, "component.wit"), "utf8")).toContain(
        "export jco:node/worker-threads-callbacks@0.1.0",
    );
    expect(withDefaultNodeCapabilities({}).map["jco:node/worker-threads@0.1.0"]).toMatch(/worker-threads\/host$/);
});

describe.skipIf(!hasJspi)("node:worker_threads components", () => {
    for (const backend of ["starlingmonkey", "quickjs"]) {
        describe(backend, () => {
            let componentPath;
            beforeAll(async () => {
                const output = await getTmpDir();
                const wit = join(output, "wit");
                await cp(join(fixture, "wit"), wit, { recursive: true });
                await injectNodeWitImports(wit, undefined, [WORKER_THREADS_WIT_REQUIREMENT]);
                const source = await bundleNodeGuestExportsWrapper(
                    join(fixture, "component.js"),
                    WORKER_THREADS_WIT_REQUIREMENT.guestExports,
                    {
                        external: ["jco:node/worker-threads@0.1.0"],
                        plugins: [nodeBuiltinPlugin({ imports: [], exports: [] }, { workerThreadsModule })],
                    },
                );
                const entry = join(output, "component.js");
                await writeFile(entry, source);
                componentPath = join(output, "component.wasm");
                await exec(jcoPath, "componentize", entry, "--backend", backend, "-w", wit, "-o", componentPath, {
                    closeStdin: true,
                });
            }, 600_000);

            async function instantiate(host) {
                return setupAsyncTest({
                    component: {
                        name: "node-worker-threads",
                        path: componentPath,
                        imports: { ...new WASIShim().getImportObject(), "jco:node/worker-threads@0.1.0": host },
                    },
                    jco: {
                        transpile: {
                            extraArgs: {
                                asyncMode: "jspi",
                                asyncExports: ["*"],
                                map: { "jco:node/worker-threads@0.1.0": "jco:node/worker-threads@0.1.0" },
                            },
                        },
                    },
                });
            }
            test("module, environment, marking, unsupported surface and catchable denial", async () => {
                const result = await instantiate(denied);
                try {
                    expect(JSON.parse(await result.instance.contract())).toEqual({
                        module: true,
                        environment: true,
                        marking: true,
                        unsupported: true,
                    });
                    expect(await result.instance.denied()).toBe("ERR_JCO_WORKER_THREADS_ADAPTER_REQUIRED");
                } finally {
                    await result.cleanup();
                }
            });

            // TODO(unskip): QuickJS exported resource callbacks trap; enable alongside
            // the equivalent node:dgram and node:inspector callback tests when fixed.
            test.skipIf(backend === "quickjs")(
                "real host workers exchange structured messages with isolated component instances",
                async () => {
                    const { createWorkerThreadsHost } = await loadNodeProvider();
                    let first;
                    let second;
                    first = await instantiate(createWorkerThreadsHost(() => first.instance.workerThreadsCallbacks));
                    second = await instantiate(createWorkerThreadsHost(() => second.instance.workerThreadsCallbacks));
                    try {
                        const ids = [await first.instance.start(7), await second.instance.start(9)];
                        expect(ids[0]).not.toBe(ids[1]);
                        for (const [result, token] of [
                            [first, 7],
                            [second, 9],
                        ]) {
                            let state;
                            for (let attempt = 0; attempt < 300; attempt++) {
                                state = JSON.parse(await result.instance.status());
                                if (state.exit !== null) {
                                    break;
                                }
                                await delay(10);
                            }
                            expect(state.errors).toEqual([]);
                            expect(state.events).toEqual(["online", "message", "exit"]);
                            expect(state.message).toEqual({
                                token,
                                data: { token },
                                main: false,
                                cycle: true,
                                bigint: "123",
                                map: 42,
                                undefinedPresent: true,
                            });
                            expect(state.exit).toBe(0);
                            expect(state.threadId).toBe(-1);
                            await result.instance.stop();
                        }
                    } finally {
                        await first.instance.stop();
                        await second.instance.stop();
                        await first.cleanup();
                        await second.cleanup();
                    }
                },
                30_000,
            );
        });
    }
});
