import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { componentWit } from "@bytecodealliance/jco-transpile/wasm-tools";

import type { ComponentizeOptions } from "../componentize.js";

const PERRY_PACKAGE = "@perryts/perry";
const WASI_SETUP = "https://github.com/PerryTS/perry/blob/main/docs/WASI_SUPPORT.md";
const exec = promisify(execFile);

/** These options require bindings or transformations Perry does not implement. */
const UNSUPPORTED_OPTIONS: Array<keyof ComponentizeOptions> = [
    "bundle",
    "bundleConfig",
    "backendQjsDisableAsync",
    "backendQjsStubWasi",
    "wizerBin",
    "nodejsHttpVia",
    "withNodejsHttpVia",
    "nodejsHttp2Via",
    "withNodejsHttp2Via",
    "nodejsVfsVia",
    "withNodejsVfsVia",
    "withNodejsVfsWasiConfig",
    "withNodejsCryptoVia",
];

/** Resolve the user's package, never a global executable or Jco's own dependencies. */
async function resolvePerryCli(packageName: string, cwd: string): Promise<string> {
    const require = createRequire(pathToFileURL(join(cwd, "package.json")));
    let manifestPath: string;
    try {
        manifestPath = require.resolve(`${packageName}/package.json`);
    } catch (cause) {
        throw new Error(
            `Cannot resolve Perry package "${packageName}" from ${cwd}. Install your chosen version in this project (npm install --save-dev ${packageName}), or select a WASI-enabled source build with --backend-perry-cli-path <path>.`,
            { cause },
        );
    }

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.perry;
    if (typeof bin !== "string" || !bin) {
        throw new Error(`Perry package "${packageName}" must declare a "perry" CLI in package.json#bin.`);
    }
    return resolve(dirname(manifestPath), bin);
}

/** Support npm's JS launcher and native executables without a shell or PATH lookup. */
function invocation(cli: string, args: string[]): [string, string[]] {
    return [".js", ".cjs", ".mjs"].includes(extname(cli)) ? [process.execPath, [cli, ...args]] : [cli, args];
}

/** Help/version output cannot distinguish Perry builds with target-wasi enabled. */
async function checkWasiSupport(cli: string, directory: string): Promise<void> {
    const source = join(directory, "probe.ts");
    const output = join(directory, "probe.o");
    await writeFile(source, "export {};\n");
    const [command, args] = invocation(cli, ["compile", source, "--target", "wasi", "--no-link", "-o", output]);
    try {
        // Probe in isolation before compiling user code. No SDK/runtime link is
        // needed, and old CLIs that silently select a native target are detected.
        await exec(command, args, { cwd: directory, timeout: 30_000, maxBuffer: 1024 * 1024 });
        const object = await readFile(output);
        if (![0, 97, 115, 109, 1, 0, 0, 0].every((byte, i) => object[i] === byte)) {
            throw new Error(
                "--target wasi --no-link did not produce a WebAssembly object (the CLI may have selected a native target).",
            );
        }
    } catch (cause) {
        throw new Error(
            `Perry CLI "${cli}" failed the WASI support check. Select a compiler built with the target-wasi Cargo feature using --backend-perry-cli-path <path>, or install a WASI-enabled package. Check that the compiler's own dependencies are available; see ${WASI_SETUP}\n${cause instanceof Error ? cause.message : String(cause)}`,
            { cause },
        );
    }
}

/** Compile with the selected Perry CLI, without changing the caller's cwd. */
export async function componentizePerry(source: string, opts: ComponentizeOptions): Promise<Uint8Array> {
    if (opts.backendPerryCliPath !== undefined && opts.backendPerryPackage !== undefined) {
        throw new Error("Choose either --backend-perry-cli-path or --backend-perry-package, not both.");
    }
    if (opts.wit !== undefined || opts.worldName !== undefined) {
        throw new Error(
            "The perry backend supplies its own WASI P2 command world and does not support custom WIT bindings yet. Omit --wit and --world-name; guest-types declarations do not add runtime bindings to Perry.",
        );
    }
    const unsupported = UNSUPPORTED_OPTIONS.filter((option) => opts[option] !== undefined && opts[option] !== false);
    if (unsupported.length) {
        const flags = unsupported.map((option) => `--${option.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
        throw new Error(
            `The perry backend does not support ${flags.join(", ")}. Perry compiles the original source and supplies its own WASI implementations of supported Node APIs.`,
        );
    }

    const cwd = resolve(opts.cwd ?? dirname(source));
    const cli =
        opts.backendPerryCliPath !== undefined
            ? resolve(opts.backendPerryCliPath)
            : await resolvePerryCli(opts.backendPerryPackage ?? PERRY_PACKAGE, cwd);
    try {
        if (!(await stat(cli)).isFile()) {
            throw new Error("Path is not a file.");
        }
    } catch (cause) {
        throw new Error(
            `Cannot access Perry CLI "${cli}". Set --backend-perry-cli-path to a compiler executable or JS launcher.`,
            { cause },
        );
    }
    const directory = await mkdtemp(join(tmpdir(), "jco-perry-"));
    try {
        await checkWasiSupport(cli, directory);
        const output = join(directory, "component.wasm");
        const [command, args] = invocation(cli, ["compile", source, "--target", "wasi", "-o", output]);
        await new Promise<void>((resolve, reject) => {
            const child = spawn(command, args, {
                cwd,
                stdio: ["ignore", "inherit", "inherit"],
            });
            child.once("error", (cause) => reject(new Error(`Failed to launch Perry CLI ${cli}`, { cause })));
            child.once("close", (code, signal) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(
                        new Error(
                            `Perry compilation failed (${signal ? `signal ${signal}` : `exit code ${code}`}). Check the compiler diagnostics above. Perry needs a build with target-wasi enabled, its WASI runtime, and wasi-sdk; see ${WASI_SETUP}`,
                        ),
                    );
                }
            });
        });

        let component: Uint8Array;
        try {
            component = await readFile(output);
        } catch (cause) {
            throw new Error("Perry exited successfully but its component output could not be read.", { cause });
        }
        const header = [0x00, 0x61, 0x73, 0x6d, 0x0d, 0x00, 0x01, 0x00];
        if (!header.every((byte, i) => component[i] === byte)) {
            throw new Error(
                `Perry did not produce a WebAssembly component. Install a Perry build with target-wasi enabled and its WASI runtime; see ${WASI_SETUP}`,
            );
        }
        // Decode the interface before publishing the output, also rejecting malformed
        // component binaries. The compiler and SDK own the exact WASI patch versions.
        const wit = await componentWit(component);
        if (!/^\s*export wasi:cli\/run@0\.2\.\d+;/m.test(wit)) {
            throw new Error("Perry did not produce a WASI P2 command (expected a wasi:cli/run@0.2.x export).");
        }
        return component;
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
