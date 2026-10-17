import { execFile } from "node:child_process";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { parse } from "@bytecodealliance/jco-transpile/wasm-tools";
import { test as baseTest } from "vitest";
import { JCO_JS_PATH } from "../common.js";
import { getTmpDir } from "../helpers.js";

const exec = promisify(execFile);

/**
 * Each test owns its project factory and cleanup, including partially built fixtures.
 * Spaces in the project paths exercise CLI argument handling. No cwd or directory
 * registry is shared between concurrent tests.
 */
export const test = baseTest.extend<{ project: () => Promise<string> }>({
    project: async ({}, use) => {
        // Node resolves cwd symlinks (e.g. macOS /var → /private/var), including
        // the base for relative CLI arguments. Use that same path in assertions.
        const root = await realpath(await getTmpDir());
        let count = 0;
        try {
            await use(async () => {
                const dir = join(root, `perry project ${count++}`);
                await mkdir(join(dir, "src"), { recursive: true });
                await writeFile(join(dir, "package.json"), JSON.stringify({ type: "module" }));
                await writeFile(
                    join(dir, "src", "main.ts"),
                    'import { readFileSync } from "node:fs";\nconst value: string = readFileSync("input.txt", "utf8");\n',
                );
                return dir;
            });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    },
});

// Immutable output for CLI adapter tests. The separate e2e.js suite compiles
// actual TypeScript with the external compiler selected by TEST_PERRY_BIN.
export const commandComponent = await parse(`(component
        (core module $m (func (export "run") (result i32) i32.const 0))
        (core instance $i (instantiate $m))
        (func $run (result (result)) (canon lift (core func $i "run")))
        (instance $cli (export "run" (func $run)))
        (export "wasi:cli/run@0.2.0" (instance $cli))
    )`);

type CliOptions = {
    name?: string;
    body?: string;
    probeBody?: string;
    bytes?: Uint8Array | number[];
    bin?: string | Record<string, string>;
};

/**
 * Install a project-local CLI test double. It records capability probes and real
 * invocations separately, allowing tests to assert forwarding, diagnostics and
 * output preservation without requiring Perry or its native toolchain.
 */
export async function installCli(
    dir: string,
    { name = "@perryts/perry", body, probeBody, bytes = commandComponent, bin = { perry: "cli.cjs" } }: CliOptions = {},
) {
    const pkg = join(dir, "node_modules", name);
    await mkdir(pkg, { recursive: true });
    await writeFile(join(pkg, "package.json"), JSON.stringify({ name, version: "0.0.0-test", bin }));
    await writeFile(
        join(pkg, "cli.cjs"),
        `
        const fs = require("node:fs");
        const args = process.argv.slice(2);
        if (args.includes("--no-link")) {
            fs.writeFileSync(${JSON.stringify(join(dir, "probe.json"))}, JSON.stringify({ args, cwd: process.cwd() }));
            ${probeBody ?? 'fs.writeFileSync(args[args.indexOf("-o") + 1], new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));'}
            process.exit(0);
        }
        fs.writeFileSync(${JSON.stringify(join(dir, "invocation.json"))}, JSON.stringify({
            args, cwd: process.cwd(), source: fs.readFileSync(args[1], "utf8")
        }));
        ${body ?? `fs.writeFileSync(args[args.indexOf("-o") + 1], new Uint8Array(${JSON.stringify([...bytes])}));`}
    `,
    );
    return join(pkg, "cli.cjs");
}

/**
 * Run ordinary Node in an isolated project. Unlike the shared exec helper, this
 * accepts a cwd and never inherits Vitest's experimental Wasm flags, including
 * flags passed through NODE_OPTIONS. Used for both Jco and the transpiled guest.
 */
export function node(cwd: string, script: string, ...args: string[]) {
    return exec(process.execPath, [script, ...args], {
        cwd,
        env: { ...process.env, NODE_OPTIONS: "" },
        maxBuffer: 4 * 1024 * 1024,
    });
}

/** Exercise the public CLI with caller-relative paths and an ordinary Node process. */
export function cli(cwd: string, ...args: string[]) {
    return node(cwd, JCO_JS_PATH, ...args);
}
