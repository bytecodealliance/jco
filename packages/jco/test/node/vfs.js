import { setTimeout as delay } from "node:timers/promises";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { VFS_WIT_REQUIREMENT, VFS_WASI_FILESYSTEM_WIT_REQUIREMENTS } from "../../src/node-wit.js";
import { withDefaultNodeCapabilities } from "../../src/cmd/transpile.js";
import { exec, getTmpDir, jcoPath, setupAsyncTest } from "../helpers.js";
import { hasJspi } from "../common.js";
import * as denied from "../../../jco-std/src/wasi/0.2.x/node/24.x.x/fs-host.js";
import * as nodeHost from "../../../jco-std/src/wasi/0.2.x/node/24.x.x/fs-host-node.js";

const fixture = fileURLToPath(new URL("../fixtures/componentize/node-vfs/", import.meta.url));
const vfsModule = fileURLToPath(new URL("../../../jco-std/src/wasi/0.2.x/node/26.x.x/vfs.ts", import.meta.url));
const wasiImplementation = fileURLToPath(
    new URL("../../../jco-std/src/wasi/0.2.x/node/26.x.x/vfs/wasi-filesystem.ts", import.meta.url),
);

const syncExpected = {
    sync: "hello world",
    bytes: "world",
    descriptorSize: 11,
    realpath: "/dir/sub/file",
    symlink: true,
    readlink: "sub/file",
    directoryEntry: "file",
    listing: ["hardlink", "link", "moved", "sub"],
    truncated: "Hello",
    temporary: true,
    missing: "ENOENT",
    removed: true,
};

const expected = { ...syncExpected, callback: "hello world", promise: "hello world" };

test("VFS selects the direct or WASI capability without intercepting bare specifiers", () => {
    for (const nodejsVfsVia of ["direct", "wasi-filesystem"]) {
        const onWitRequirement = vi.fn();
        const plugin = nodeBuiltinPlugin(
            { imports: [], exports: [] },
            { nodejsVfsVia, vfsModule, vfsWasiFilesystemImplementationModule: wasiImplementation, onWitRequirement },
        );
        expect(plugin.resolveId("vfs")).toBeNull();
        expect(plugin.resolveId("node:vfs/missing")).toBeNull();
        expect(plugin.resolveId("node:vfs")).toBe("\0jco-node-builtin:node:vfs");
        const requirements = nodejsVfsVia === "direct" ? [VFS_WIT_REQUIREMENT] : VFS_WASI_FILESYSTEM_WIT_REQUIREMENTS;
        expect(onWitRequirement.mock.calls.map(([value]) => value)).toEqual(requirements);
    }
    expect(withDefaultNodeCapabilities({}).map["jco:node/fs@0.1.0"]).toMatch(/fs\/host$/);
});

test("WASI VFS diagnoses an incompatible existing filesystem import only when used", () => {
    const plugin = nodeBuiltinPlugin(
        {
            imports: [
                {
                    namespace: "wasi",
                    package: "filesystem",
                    interface: "preopens",
                    version: { major: 0n, minor: 2n, patch: 3n },
                },
            ],
            exports: [],
        },
        { nodejsVfsVia: "wasi-filesystem" },
    );
    expect(plugin.resolveId("unrelated")).toBeNull();
    expect(() => plugin.resolveId("node:vfs")).toThrow(/requires wasi:filesystem@0.2.12/);
});

describe.skipIf(!hasJspi)("node:vfs components", () => {
    for (const backend of ["starlingmonkey", "quickjs"]) {
        for (const mode of ["direct", "wasi-filesystem", "wasi-custom"]) {
            const via = mode === "wasi-custom" ? "wasi-filesystem" : mode;
            const guestRoot = mode === "wasi-custom" ? "/tenant" : "/data/storage";
            describe(`${backend} via ${mode}`, () => {
                let componentPath;
                beforeAll(async () => {
                    const output = await getTmpDir();
                    const wit = join(output, "wit");
                    await cp(join(fixture, "wit"), wit, { recursive: true });
                    const requirements =
                        via === "direct" ? [VFS_WIT_REQUIREMENT] : VFS_WASI_FILESYSTEM_WIT_REQUIREMENTS;
                    const entry = join(output, "component.js");
                    await cp(join(fixture, "component.js"), entry);
                    const args = ["--bundle", "--with-nodejs-vfs-via", via];
                    if (mode === "wasi-custom") {
                        const config = join(output, "storage.js");
                        await writeFile(
                            config,
                            `export function resolveRoot(rootPath, preopens) {
                            if (rootPath !== "/tenant") throw new Error("Unexpected VFS root");
                            const entry = preopens.find(([, name]) => name === "/data");
                            return { descriptor: entry[0], directory: "storage" };
                        }`,
                        );
                        args.push("--with-nodejs-vfs-wasi-config", config);
                    }
                    componentPath = join(output, "component.wasm");
                    await exec(
                        jcoPath,
                        "componentize",
                        entry,
                        "--backend",
                        backend,
                        "-w",
                        wit,
                        "-o",
                        componentPath,
                        ...args,
                        { closeStdin: true },
                    );
                    const world = await readFile(join(wit, "component.wit"), "utf8");
                    for (const requirement of requirements) {
                        expect(world).toContain(`import ${requirement.witImport};`);
                    }
                }, 600_000);

                async function instantiate(host, root) {
                    const wasi = new WASIShim({ sandbox: { preopens: root ? { "/data": root } : {} } });
                    return setupAsyncTest({
                        component: {
                            name: "node-vfs",
                            path: componentPath,
                            imports: {
                                ...wasi.getImportObject(),
                                ...(via === "direct" ? { "jco:node/fs@0.1.0": host } : {}),
                            },
                        },
                        jco: {
                            transpile: {
                                extraArgs: {
                                    asyncMode: "jspi",
                                    asyncExports: ["*"],
                                    map: via === "direct" ? { "jco:node/fs@0.1.0": "jco:node/fs@0.1.0" } : {},
                                },
                            },
                        },
                    });
                }

                test("synchronous memory API and default denial work inside the guest", async () => {
                    const result = await instantiate(denied);
                    try {
                        expect(JSON.parse(await result.instance.syncMemory())).toEqual(syncExpected);
                        if (via === "direct") {
                            expect(await result.instance.denied()).toBe("ERR_JCO_FS_ADAPTER_REQUIRED");
                        }
                    } finally {
                        await result.cleanup();
                    }
                });

                // TODO(unskip): QuickJS lowers WIT u64 arguments as f64 and traps on
                // BigInt file offsets (direct read and WASI descriptor.write).
                test.skipIf(backend === "quickjs")(
                    "synchronous real storage uses the selected implementation",
                    async () => {
                        const root = await getTmpDir();
                        await mkdir(join(root, "storage"));
                        const result = await instantiate(nodeHost, root);
                        try {
                            expect(
                                JSON.parse(
                                    await result.instance.syncFilesystem(
                                        via === "direct" ? join(root, "storage") : guestRoot,
                                    ),
                                ),
                            ).toEqual(syncExpected);
                            expect(await readFile(join(root, "storage", "placement.txt"), "utf8")).toBe("vfs contents");
                        } finally {
                            await result.cleanup();
                        }
                    },
                );

                // TODO(unskip): QuickJS does not drain guest Promise jobs; synchronous coverage runs on both engines.
                test.skipIf(backend === "quickjs")("memory exercises the API without a filesystem grant", async () => {
                    const result = await instantiate(denied);
                    try {
                        expect(await runReport(result.instance, "startMemory")).toEqual({
                            ...expected,
                            namespace: true,
                            provider: true,
                            isolated: true,
                            readOnlyError: "EROFS",
                        });
                        if (via === "direct") {
                            expect(await result.instance.denied()).toBe("ERR_JCO_FS_ADAPTER_REQUIRED");
                        }
                    } finally {
                        await result.cleanup();
                    }
                });

                // TODO(unskip): QuickJS does not drain guest Promise jobs after synchronous exports.
                test.skipIf(backend === "quickjs")(
                    "real storage exercises sync, callbacks, promises, descriptors and links",
                    async () => {
                        const root = await getTmpDir();
                        await mkdir(join(root, "storage"));
                        const result = await instantiate(nodeHost, root);
                        try {
                            expect(
                                await runReport(
                                    result.instance,
                                    "startFilesystem",
                                    via === "direct" ? join(root, "storage") : guestRoot,
                                ),
                            ).toEqual(expected);
                            expect(await readFile(join(root, "storage", "placement.txt"), "utf8")).toBe("vfs contents");
                            expect(
                                await readFile(join(root, "storage", "dir", "sub", "file"), "utf8").catch(
                                    (error) => error.code,
                                ),
                            ).toBe("ENOENT");
                        } finally {
                            await result.cleanup();
                        }
                    },
                );
            });
        }
    }
});

async function runReport(instance, start, root) {
    await instance[start](...(root === undefined ? [] : [root]));
    for (let attempt = 0; attempt < 100; attempt++) {
        const report = await instance.takeReport();
        if (report) {
            return JSON.parse(report);
        }
        await delay(10);
    }
    throw new Error("VFS report did not complete");
}
