import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { componentWit } from "@bytecodealliance/jco-transpile/wasm-tools";
import { copyBuiltinWit, resolveBuiltinWit } from "../../src/cmd/new/builtin-wit.js";
import { fileExists, getTmpDir } from "../helpers.js";
import { cli } from "./helpers.js";

const example = fileURLToPath(new URL("../../../../examples/components/perry-filesystem/", import.meta.url));
const workspaceShim = fileURLToPath(new URL("../../../preview2-shim/", import.meta.url));

// The custom WASI compiler is optional locally. A present compiler that cannot
// build WASI must fail rather than silently skip; CI supplies and checks its path.
const compilerPath = process.env.TEST_PERRY_BIN ? resolve(process.env.TEST_PERRY_BIN) : undefined;
export const perryAvailable = !!compilerPath && existsSync(compilerPath);

type PerryProject = {
    directory: string;
    build: (guest?: URL) => Promise<void>;
};

/**
 * Give each real-compiler test its own example project, compiler selection and
 * built workspace shim. The published shim lacks the mutate-directory option.
 * Cleanup includes failed setup/builds; concurrent tests share no mutable files
 * or Node globals. Hosts run separately using the ordinary Node helper.
 */
export async function withPerryProject(
    selection: string,
    run: (project: PerryProject) => Promise<void>,
): Promise<void> {
    assert.ok(compilerPath, "Set TEST_PERRY_BIN to a WASI-enabled Perry compiler");
    assert.ok(
        await fileExists(join(workspaceShim, "dist", "nodejs", "filesystem.js")),
        "Build the workspace shim first: pnpm --filter @bytecodealliance/preview2-shim build",
    );
    const directory = await realpath(await getTmpDir());
    const command = (...args: string[]) => cli(directory, ...args);
    try {
        await cp(example, directory, {
            recursive: true,
            filter: (path) => !/(?:node_modules|dist|generated|wit|data)(?:[/\\]|$)/.test(path),
        });
        if (selection === "project package") {
            // Package the same real binary locally to exercise default package
            // resolution without depending on a published WASI-enabled release.
            const pkg = join(directory, "node_modules", "@perryts", "perry");
            await mkdir(pkg, { recursive: true });
            await writeFile(
                join(pkg, "package.json"),
                JSON.stringify({ name: "@perryts/perry", version: "0.0.0-test", bin: { perry: "perry" } }),
            );
            await symlink(compilerPath, join(pkg, "perry"), "file");
        }
        await mkdir(join(directory, "node_modules", "@bytecodealliance"), { recursive: true });
        await symlink(workspaceShim, join(directory, "node_modules", "@bytecodealliance", "preview2-shim"), "junction");
        await copyBuiltinWit(resolveBuiltinWit("builtin:wasi-command@0.2.x"), join(directory, "wit"));

        await run({
            directory,
            // Every fixture exercises the public guest-types → componentize →
            // transpile flow. Seed host data only after this build completes.
            async build(guest) {
                if (guest) {
                    await cp(guest, join(directory, "src", "guest", "component.ts"));
                }
                await command("guest-types", "wit", "--world-name", "wasi:cli/command@0.2.12", "-o", "generated/types");
                assert.match(
                    await readFile(
                        join(directory, "generated", "types", "interfaces", "wasi-filesystem-types.d.ts"),
                        "utf8",
                    ),
                    /Descriptor/,
                );
                await mkdir(join(directory, "dist"));
                await command(
                    "componentize",
                    "src/guest/component.ts",
                    "--backend",
                    "perry",
                    "-o",
                    "dist/component.wasm",
                    ...(selection === "cli path" ? ["--backend-perry-cli-path", compilerPath] : []),
                );
                const wit = await componentWit(await readFile(join(directory, "dist", "component.wasm")));
                assert.match(wit, /import wasi:filesystem\/types@0\.2\./);
                assert.match(wit, /import wasi:filesystem\/preopens@0\.2\./);
                assert.match(wit, /export wasi:cli\/run@0\.2\./);
                assert.doesNotMatch(wit, /jco:node/);
                await command(
                    "transpile",
                    "dist/component.wasm",
                    "--bindgen-enable-wasm-exnref",
                    "-o",
                    "dist/transpiled",
                );
                await mkdir(join(directory, "data"));
            },
        });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
