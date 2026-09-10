// End-to-end coverage for `node:tty`: the world gains `jco:node/tty@0.1.0`, the component runs
// against the deny host, a scripted provider, and jco-std's Node provider -- the last both
// without a terminal (where it fails exactly as Node does) and on a real pseudo-terminal.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert, expect, suite, test } from "vitest";
import which from "which";
import { worldMetadataFor } from "../../src/cmd/componentize.js";
import { TTY_WIT_REQUIREMENT, injectNodeWitImports } from "../../src/node-wit.js";
import { componentizeFixture, getTmpDir, setupAsyncTest } from "../helpers.js";

const FIXTURE = fileURLToPath(new URL("../fixtures/componentize/node-tty/", import.meta.url));
const python = which.sync("python3", { nothrow: true });

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

suite("node:tty", () => {
    test.concurrent("installs the typed tty WIT dependency and its shared types idempotently", async () => {
        const root = await getTmpDir();
        const world = join(root, "component.wit");
        await writeFile(world, "package test:tty;\nworld component {}\n");

        const result = await injectNodeWitImports(root, undefined, [TTY_WIT_REQUIREMENT]);
        expect(result?.imports).toEqual(["jco:node/tty@0.1.0"]);
        for (const name of ["types.wit", "tty.wit"]) {
            expect(await readFile(join(root, "deps/jco-node-0.1.0", name), "utf8")).toEqual(
                await readFile(new URL(`../../../jco-std/wit/node-0.1.0/${name}`, import.meta.url), "utf8"),
            );
        }
        const ttyWit = await readFile(join(root, "deps/jco-node-0.1.0/tty.wit"), "utf8");
        expect(ttyWit).toContain("interface tty");
        expect(ttyWit).toContain("use types.{env-vars};");
        expect(ttyWit).toContain("set-raw-mode: func(");
        // The injected package must parse: WIT shares one namespace per interface.
        const metadata = await worldMetadataFor(root, "component");
        expect(metadata.imports).toContainEqual(
            expect.objectContaining({ namespace: "jco", package: "node", interface: "tty" }),
        );
        expect(await injectNodeWitImports(root, undefined, [TTY_WIT_REQUIREMENT])).toBeUndefined();
        expect((await readFile(world, "utf8")).match(/import jco:node\/tty@0\.1\.0;/g)).toHaveLength(1);
    });

    // TODO(unskip): publish and depend on a jco-std release with the `wasi/0.2.x/node/24.x.x/tty`
    // export; the workspace copy has it, the published 0.3.x does not, and jco componentizes
    // against the published package.
    test.skip.each(["quickjs", "starlingmonkey"])(
        "componentizes and runs against the deny, scripted, and Node terminal providers (%s)",
        async (backend) => {
            const { componentPath, fixtureDir, stderr } = await componentizeFixture({
                fixture: "node-tty",
                bundle: true,
                copy: true,
                extraArgs: ["--backend", backend],
            });
            assert.include(stderr, "Jco added generated WIT import jco:node/tty@0.1.0");
            assert.include(await readFile(join(fixtureDir, "wit/component.wit"), "utf8"), "import jco:node/tty@0.1.0;");

            const { esModuleOutputPath, cleanup } = await setupAsyncTest({
                component: { name: `node-tty-${backend}`, path: componentPath, skipInstantiation: true },
            });
            const runner = join(FIXTURE, "run.js");
            try {
                const denied = await run(process.execPath, [runner, esModuleOutputPath, "denied"]);
                expect(denied.status, denied.stderr).toBe(0);
                const { guest: deniedGuest } = resultOf(denied.stdout);
                expect(deniedGuest.identity).toBe(true);
                expect(deniedGuest.outOfRange).toEqual([false, false, false, false, false]);
                expect(deniedGuest.invalidFd).toMatchObject({ code: "ERR_INVALID_FD", rangeError: true });
                expect(deniedGuest.denied).toEqual(Array(4).fill("ERR_JCO_TTY_ADAPTER_REQUIRED"));

                const scripted = await run(process.execPath, [runner, esModuleOutputPath, "scripted"]);
                expect(scripted.status, scripted.stderr).toBe(0);
                const { guest, terminal } = resultOf(scripted.stdout);
                // The bundled EventEmitter core names its class `_EventEmitter`; everything above
                // it in the chain is tty's own.
                expect(guest.chain.slice(0, 5)).toEqual([
                    "WriteStream",
                    "TerminalOutput",
                    "Duplex",
                    "Readable",
                    "Stream",
                ]);
                expect(guest.chain[5]).toMatch(/EventEmitter$/);
                expect({ ...guest, chain: undefined }).toEqual({
                    identity: true,
                    outOfRange: [false, false, false, false, false],
                    invalidFd: {
                        name: "RangeError",
                        code: "ERR_INVALID_FD",
                        message: '"fd" must be a positive integer: -1',
                        rangeError: true,
                        info: null,
                    },
                    isatty: [true, true, true, false],
                    notATerminal: {
                        name: "SystemError",
                        code: "ERR_TTY_INIT_FAILED",
                        message: "TTY initialization failed: uv_tty_init returned EINVAL (invalid argument)",
                        errno: -22,
                        syscall: "uv_tty_init",
                        info: { errno: -22, code: "EINVAL", message: "invalid argument", syscall: "uv_tty_init" },
                        rangeError: false,
                    },
                    size: [100, 30],
                    isTTY: [true, true, false],
                    depth: 8,
                    hasColors: [true, false, true],
                    chain: undefined,
                    terminal: true,
                    rawDuringQuestion: true,
                    answer: "Ada",
                    rawAfter: false,
                    events: [],
                });
                expect(terminal.raw).toEqual([true, false]);
                expect(terminal.output).toContain("\x1b[1G\x1b[2KHello ");
                expect(terminal.output).toContain("Name? ");
                expect(terminal.output).toContain("Ada");
                expect(terminal.output).toContain(`REPORT ${JSON.stringify(guest)}\n`);
                expect(terminal.calls).toContain("read 0 65536");
                expect(terminal.calls.slice(-2)).toEqual(["close 0 read", "close 1 write"]);

                // Without a terminal the Node provider answers exactly as Node does on the same
                // descriptors: libuv accepts a pipe as a tty handle but refuses a file or a closed
                // descriptor, so the outcomes are compared rather than assumed.
                const plain = await run(process.execPath, [runner, esModuleOutputPath, "node"]);
                expect(plain.status, plain.stderr).toBe(0);
                const { guest: plainGuest, native } = resultOf(plain.stdout);
                expect(plainGuest.isatty).toEqual(native.isatty);
                expect(plainGuest.isatty[1]).toBe(false);
                expect(plainGuest.invalidFd).toEqual(native.invalidFd);
                expect(plainGuest.notATerminal).toEqual(native.notATerminal);
                expect(plainGuest.notATerminal.code).toBe("ERR_TTY_INIT_FAILED");
                expect(plainGuest.init).toEqual(native.init);

                if (!python || process.platform === "win32") {
                    return;
                }
                const steps = [{ expect: "Name? " }, { send: "Ada\r" }, { expect: "REPORT " }, { send: "\n" }];
                const pty = await run(python, [
                    join(FIXTURE, "tty-pty.py"),
                    "40",
                    "120",
                    JSON.stringify(steps),
                    process.execPath,
                    runner,
                    esModuleOutputPath,
                    "node",
                ]);
                expect(pty.status, pty.stderr).toBe(0);
                const { output, status } = JSON.parse(pty.stdout);
                expect(status, output).toBe(0);
                const { guest: ptyGuest, native: ptyNative } = resultOf(output);
                expect(ptyGuest.isatty).toEqual([true, true, true, false]);
                expect(ptyNative.isatty).toEqual([true, true, true, false]);
                expect(ptyGuest.notATerminal).toEqual(ptyNative.notATerminal);
                expect(ptyGuest).toMatchObject({
                    size: [120, 40],
                    isTTY: [true, true, false],
                    depth: 8,
                    hasColors: [true, false, true],
                    terminal: true,
                    rawDuringQuestion: true,
                    answer: "Ada",
                    rawAfter: false,
                    events: [],
                });
                expect(output).toContain("Hello ");
                expect(output).toContain("Name? ");
                expect(output).toContain(`REPORT ${JSON.stringify(ptyGuest)}`);
            } finally {
                await cleanup();
            }
        },
        600_000,
    );
});
