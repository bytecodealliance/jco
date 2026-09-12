import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import ts from "typescript-compiler-api";
import { PROCESS_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { componentizeFixture, getTmpDir, setupAsyncTest } from "../helpers.js";

function runNode(args) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [...process.execArgv, ...args], { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "",
            stderr = "";
        child.stdout.on("data", (data) => {
            stdout += data;
        });
        child.stderr.on("data", (data) => {
            stderr += data;
        });
        child.on("error", reject);
        child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
}
const NODE_HOST = "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host/node";
const DENY_HOST = "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host";

test.concurrent("process installs only its mirrored WIT dependency, idempotently", async () => {
    const root = await getTmpDir();
    await writeFile(join(root, "world.wit"), "package test:process;\nworld component {}\n");
    expect((await injectNodeWitImports(root, undefined, [PROCESS_WIT_REQUIREMENT])).imports).toEqual([
        "jco:node/process@0.1.0",
    ]);
    expect(await readFile(join(root, "deps/jco-node-0.1.0/process.wit"), "utf8")).toEqual(
        await readFile(new URL("../../../jco-std/wit/node-0.1.0/process.wit", import.meta.url), "utf8"),
    );
    expect(await injectNodeWitImports(root, undefined, [PROCESS_WIT_REQUIREMENT])).toBeUndefined();
});
test.concurrent("process builtin resolves lazily and preserves installed bare packages", async () => {
    const requirements = [];
    const plugin = nodeBuiltinPlugin(
        { imports: [], exports: [] },
        { processModule: "/process.js", onWitRequirement: (r) => requirements.push(r) },
    );
    const id = plugin.resolveId("node:process");
    expect(id).toBe("\0jco-node-builtin:node:process");
    expect(requirements).toEqual([PROCESS_WIT_REQUIREMENT]);
    expect(
        await plugin.resolveId.call({ resolve: async () => ({ id: "/installed/process.js" }) }, "process"),
    ).toBeNull();
    expect(plugin.load(id)).toContain('from "/process.js"');
});
function expectTypeChecks(paths) {
    const program = ts.createProgram(paths, {
        allowJs: true,
        checkJs: true,
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([]);
}

// TODO(unskip): publish and depend on a jco-std release with the process exports and ProcessHost type.
test.concurrent.skip("custom process provider conforms to the public ProcessHost type", () => {
    const provider = fileURLToPath(
        new URL("../fixtures/componentize/node-process-custom/provider.js", import.meta.url),
    );
    expectTypeChecks([provider]);
});

// TODO(unskip): publish and depend on a jco-std release with the process facade and host providers.
test.concurrent.skip.each(["quickjs", "starlingmonkey"])(
    "process component runs with native and default-denied providers (%s)",
    async (backend) => {
        const nodeHost = import.meta.resolve(NODE_HOST);
        const { componentPath } = await componentizeFixture({
            fixture: "node-process",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", backend],
        });
        const runner = fileURLToPath(new URL("../fixtures/componentize/node-process/run.js", import.meta.url));
        for (const mode of ["node", "denied"]) {
            const specifier = mode === "node" ? nodeHost : DENY_HOST;
            const { esModuleOutputPath, cleanup } = await setupAsyncTest({
                component: { name: `node-process-${backend}-${mode}`, path: componentPath, skipInstantiation: true },
                jco: {
                    transpile: { extraArgs: mode === "node" ? { map: { "jco:node/process@0.1.0": specifier } } : {} },
                },
            });
            try {
                const output = await runNode([runner, esModuleOutputPath, specifier, mode, backend]);

                expect(output.status, output.stderr).toBe(0);
                const { guest, native, environmentClean } = JSON.parse(output.stdout);
                if (mode === "denied") {
                    expect(guest.errors).toHaveLength(7);
                    for (const error of guest.errors) {
                        expect(error).toMatchObject({ name: "Error", code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" });
                    }
                    continue;
                }
                expect(guest.failure).toBeUndefined();
                expect(guest.identity).toBe(true);
                if (backend === "starlingmonkey") {
                    expect(guest.tick).toEqual(["sync", "tick2"]);
                }
                for (const name of ["pid", "ppid", "arch", "platform", "version", "argv", "cwd", "flagsSize"]) {
                    expect(guest[name]).toEqual(native[name]);
                }
                expect(guest.environment).toEqual({
                    value: "guest",
                    enumerable: true,
                    descriptor: "guest",
                    deleted: true,
                });
                expect(environmentClean).toBe(true);
                expect(guest.events).toEqual(["once"]);
                expect(guest.cpu.user).toBeGreaterThanOrEqual(0);
                expect(guest.memory.rss).toBeGreaterThan(0);
                expect(guest.rss).toBeGreaterThan(0);
                expect(guest.resources.maxRSS).toBeGreaterThan(0);
                expect(guest.time[0]).toBeGreaterThanOrEqual(0);
                expect(BigInt(guest.bigint)).toBeGreaterThan(0n);
                expect(guest.signalZero).toBe(true);
                expect(guest.exitCode).toBe(7);
                expect(guest.ids).toEqual(native.ids);
                expect(guest.flag).toBe(true);
                expect(guest.reportPid).toBe(native.pid);
                expect(guest.missingDirectory).toMatchObject({ name: "Error", code: "ENOENT", syscall: "chdir" });
                expect(guest.unknownSignal).toMatchObject({ code: "ERR_UNKNOWN_SIGNAL" });
                expect(guest.deprecated).toMatchObject({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" });
                expect(guest.unsupported).toMatchObject({ code: "ERR_JCO_UNSUPPORTED_NODE_API" });
                const child = await runNode([runner, esModuleOutputPath, specifier, "exit"]);
                expect(child.stderr).toBe("");
                expect(child.status).toBe(23);
            } finally {
                await cleanup();
            }
        }
    },
    600000,
);

// TODO(unskip): publish and depend on a jco-std release with the process exports and ProcessHost type.
test.concurrent.skip.each(["quickjs", "starlingmonkey"])(
    "custom process provider handles guest exit without exiting the host (%s)",
    async (backend) => {
        const nodeHost = import.meta.resolve(NODE_HOST);
        const { componentPath } = await componentizeFixture({
            fixture: "node-process-custom",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", backend],
        });
        const { esModuleOutputPath, esModuleOutputDir, cleanup } = await setupAsyncTest({
            component: { path: componentPath, name: `node-process-custom-${backend}`, skipInstantiation: true },
        });
        const runner = fileURLToPath(new URL("../fixtures/componentize/node-process-custom/run.js", import.meta.url));
        try {
            const provider = fileURLToPath(
                new URL("../fixtures/componentize/node-process-custom/provider.js", import.meta.url),
            );
            const consumer = join(esModuleOutputDir, "provider-types.ts");
            await writeFile(
                consumer,
                [
                    'import type * as ProcessBinding from "./interfaces/jco-node-process.js";',
                    `import type { ProcessHost } from ${JSON.stringify(fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process")))};`,
                    `import nodeHost from ${JSON.stringify(fileURLToPath(nodeHost))};`,
                    `import { createProcessHost } from ${JSON.stringify(provider)};`,
                    "const host: ProcessHost = createProcessHost().host;",
                    "const customBinding: typeof ProcessBinding = host;",
                    "const nativeBinding: typeof ProcessBinding = nodeHost;",
                    "void customBinding; void nativeBinding;",
                ].join("\n"),
            );
            expectTypeChecks([consumer]);
            // A subprocess makes accidental passthrough exit observable without killing Vitest.
            const output = await runNode([runner, esModuleOutputPath]);
            expect(output.status, output.stderr).toBe(0);
            expect(JSON.parse(output.stdout)).toEqual({ exitRequests: [23], hostAlive: true });
        } finally {
            await cleanup();
        }
    },
    600000,
);
