// End-to-end coverage for `node:wasi`: the world gains `jco:node/wasi@0.1.0`, the component
// constructs against the deny host and jco-std's Node provider, and every operation past
// construction is refused with the explanation that a component cannot instantiate a module.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assert, expect, suite, test } from "vitest";
import { worldMetadataFor } from "../../src/cmd/componentize.js";
import { WASI_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { componentizeFixture, getTmpDir, setupAsyncTest } from "../helpers.js";

const FIXTURE = new URL("../fixtures/componentize/node-wasi/", import.meta.url);

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (data) => (stdout += data));
        child.stderr.on("data", (data) => (stderr += data));
        child.on("error", reject);
        child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
}

/** Parse the `RESULT` line the fixture runner prints, wherever it sits in the captured output. */
function resultOf(output) {
    const start = output.indexOf("RESULT ");
    assert.notEqual(start, -1, output);
    return JSON.parse(output.slice(start + "RESULT ".length).split(/\r|\n/)[0]);
}

suite("node:wasi", () => {
    test.concurrent("installs the typed wasi WIT dependency and its shared types idempotently", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(world, "package test:wasi;\nworld component {}\n");

        const result = await injectNodeWitImports(root, undefined, [WASI_WIT_REQUIREMENT]);
        expect(result?.imports).toEqual(["jco:node/wasi@0.1.0"]);
        for (const name of ["types.wit", "wasi.wit"]) {
            expect(await readFile(join(root, "deps/jco-node-0.1.0", name), "utf8")).toEqual(
                await readFile(new URL(`../../../jco-std/wit/node-0.1.0/${name}`, import.meta.url), "utf8"),
            );
        }
        const wasiWit = await readFile(join(root, "deps/jco-node-0.1.0/wasi.wit"), "utf8");
        expect(wasiWit).toContain("interface wasi");
        expect(wasiWit).toContain("use types.{env-vars};");
        expect(wasiWit).toContain("init: func(options: options) -> result<_, error>;");
        // The injected package must parse: WIT shares one namespace per interface.
        const metadata = await worldMetadataFor(root, "component");
        expect(metadata.imports).toContainEqual(
            expect.objectContaining({ namespace: "jco", package: "node", interface: "wasi" }),
        );
        expect(await injectNodeWitImports(root, undefined, [WASI_WIT_REQUIREMENT])).toBeUndefined();
        expect((await readFile(world, "utf8")).match(/import jco:node\/wasi@0\.1\.0;/g)).toHaveLength(1);
    });

    // TODO(unskip): publish and depend on a jco-std release with the `wasi/0.2.x/node/24.x.x/wasi`
    // export; the workspace copy has it, the published 0.3.x does not, and jco componentizes
    // against the published package.
    test.skip.each(["quickjs", "starlingmonkey"])(
        "componentizes and runs against the deny and Node providers (%s)",
        async (backend) => {
            const { componentPath, fixtureDir, stderr } = await componentizeFixture({
                fixture: "node-wasi",
                bundle: true,
                copy: true,
                extraArgs: ["--backend", backend],
            });
            assert.include(stderr, "Jco added generated WIT import jco:node/wasi@0.1.0");
            assert.include(
                await readFile(join(fixtureDir, "wit/component.wit"), "utf8"),
                "import jco:node/wasi@0.1.0;",
            );

            const { esModuleOutputPath, cleanup } = await setupAsyncTest({
                component: { name: `node-wasi-${backend}`, path: componentPath, skipInstantiation: true },
            });
            const runner = join(FIXTURE.pathname, "run.js");
            try {
                const denied = await run(process.execPath, [runner, esModuleOutputPath, "denied"]);
                expect(denied.status, denied.stderr).toBe(0);
                const { guest: deniedGuest, native } = resultOf(denied.stdout);
                expect(deniedGuest.identity).toBe(true);
                expect(deniedGuest.keys).toEqual(["WASI"]);
                expect(deniedGuest.webAssembly).toBe("undefined");
                expect(deniedGuest.badVersion).toEqual(native.badVersion);
                expect(deniedGuest.badStdin).toEqual(native.badStdin);
                expect(deniedGuest.denied).toMatchObject({
                    name: "Error",
                    code: "ERR_JCO_WASI_ADAPTER_REQUIRED",
                    keys: ["code"],
                });
                expect(deniedGuest.denied.message).toMatch(
                    /^node:wasi requires an application-provided host adapter\. Mapping one only makes construction behave as Node's does: running a module through node:wasi is not supported in a WebAssembly component/,
                );

                const plain = await run(process.execPath, [runner, esModuleOutputPath, "node"]);
                expect(plain.status, plain.stderr).toBe(0);
                const { guest, native: nodeNative } = resultOf(plain.stdout);
                expect(guest.importObject).toEqual(["wasi_snapshot_preview1"]);
                expect(guest.unstable).toEqual(["wasi_unstable"]);
                expect(guest.sameTable).toBe(true);
                expect(guest.syscalls).toBe(46);
                expect(guest.procExit).toEqual(["bound wasiReturnOnProcExit", 1]);
                expect(guest.fdWrite).toEqual(["bound fd_write", 4]);
                expect(guest.exitCode).toEqual({ thrown: "symbol" });
                // Everything Node's binding answers before binding a memory is answered the same way.
                for (const key of [
                    "notStarted",
                    "einval",
                    "startShape",
                    "missingPreopen",
                    "filePreopen",
                    "badFd",
                    "lateReturnOnExit",
                ]) {
                    expect(guest[key], key).toEqual(nodeNative[key]);
                }
                expect(guest.missingPreopen).toMatchObject({
                    code: "UVWASI_ENOENT",
                    errno: 44,
                    syscall: "uvwasi_init",
                });
                expect(guest.badFd.code).toBe("UVWASI_EBADF");
                // Where Node would bind the memory, the guest explains why it cannot.
                expect(nodeNative.start.code).toBe("ERR_INVALID_ARG_TYPE");
                for (const key of ["start", "initialize"]) {
                    expect(guest[key], key).toMatchObject({ name: "Error", code: "ERR_JCO_UNSUPPORTED_NODE_API" });
                    expect(guest[key].message).toContain("cannot instantiate a nested WebAssembly module");
                    expect(guest[key].message).toContain("wac or wasm-tools compose");
                }
            } finally {
                await cleanup();
            }
        },
        600_000,
    );
});
