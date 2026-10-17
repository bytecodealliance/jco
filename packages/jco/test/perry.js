import assert from "node:assert/strict";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { componentize } from "../src/cmd/componentize.js";
import { cli, commandComponent, installCli, test } from "./perry/helpers.js";

test.concurrent("resolves Perry from the entry project and passes original TypeScript without Node adapters", async ({
    project,
}) => {
    const dir = await project();
    const caller = await project();
    await installCli(dir);
    const source = join(dir, "src", "main.ts");
    await cli(caller, "componentize", source, "--backend", "perry", "-o", "result.wasm");

    const invocation = JSON.parse(await readFile(join(dir, "invocation.json"), "utf8"));
    assert.deepEqual(invocation.args.slice(0, 4), ["compile", source, "--target", "wasi"]);
    assert.strictEqual(invocation.cwd, join(dir, "src"));
    assert.strictEqual(invocation.source, await readFile(source, "utf8"));
    assert.deepEqual(new Uint8Array(await readFile(join(caller, "result.wasm"))), commandComponent);
    await assert.rejects(stat(dirname(invocation.args.at(-1))), { code: "ENOENT" });
});

test.concurrent("--cwd selects the project package and supports an npm alias with a string bin", async ({
    project,
}) => {
    const sourceProject = await project();
    const compilerProject = await project();
    await installCli(sourceProject, { body: 'throw new Error("wrong compiler version");' });
    await installCli(compilerProject, { name: "my-perry", bin: "cli.cjs" });
    await cli(
        sourceProject,
        "componentize",
        "src/main.ts",
        "--backend",
        "perry",
        "--cwd",
        compilerProject,
        "--backend-perry-package",
        "my-perry",
        "-o",
        "result.wasm",
    );
    const invocation = JSON.parse(await readFile(join(compilerProject, "invocation.json"), "utf8"));
    assert.strictEqual(invocation.cwd, compilerProject);
    assert.strictEqual(invocation.args[1], join(sourceProject, "src", "main.ts"));
});

test.concurrent("reports a missing project-installed compiler with installation guidance", async ({ project }) => {
    const dir = await project();
    await assert.rejects(
        cli(dir, "componentize", "src/main.ts", "--backend", "perry", "-o", "out.wasm"),
        /Cannot resolve Perry package.*npm install --save-dev @perryts\/perry/s,
    );
});

test.concurrent("rejects a package without a Perry CLI", async ({ project }) => {
    const dir = await project();
    await installCli(dir, { bin: {} });
    await assert.rejects(
        cli(dir, "componentize", "src/main.ts", "--backend", "perry", "-o", "out.wasm"),
        /must declare a "perry" CLI/,
    );
});

test.concurrent("an explicit relative CLI path works without an npm package and is independent of --cwd", async ({
    project,
}) => {
    const dir = await project();
    const working = await project();
    const launcher = await installCli(dir);
    await rename(launcher, join(dir, "my compiler.cjs"));
    await rm(join(dir, "node_modules"), { recursive: true });
    await cli(
        dir,
        "componentize",
        "src/main.ts",
        "--backend",
        "perry",
        "--backend-perry-cli-path",
        "my compiler.cjs",
        "--cwd",
        working,
        "-o",
        "out.wasm",
    );
    const { cwd, args } = JSON.parse(await readFile(join(dir, "invocation.json"), "utf8"));
    assert.equal(cwd, working);
    assert.equal(args[1], join(dir, "src", "main.ts"));
    const probe = JSON.parse(await readFile(join(dir, "probe.json"), "utf8"));
    assert.notEqual(probe.cwd, working);
    await assert.rejects(stat(probe.cwd), { code: "ENOENT" });
});

test.concurrent("an explicit absolute CLI path overrides the project's installed compiler", async ({ project }) => {
    const dir = await project();
    const compiler = await project();
    await installCli(dir, { probeBody: 'throw new Error("wrong compiler");' });
    const launcher = await installCli(compiler);
    await cli(
        dir,
        "componentize",
        "src/main.ts",
        "--backend",
        "perry",
        "--backend-perry-cli-path",
        launcher,
        "-o",
        "out.wasm",
    );
    await assert.rejects(stat(join(dir, "probe.json")), { code: "ENOENT" });
    assert.deepEqual(new Uint8Array(await readFile(join(dir, "out.wasm"))), commandComponent);
});

test.concurrent.for(["missing-compiler", "src"])("reports an unusable CLI path: %s", async (path, { project }) => {
    const dir = await project();
    await assert.rejects(
        cli(
            dir,
            "componentize",
            "src/main.ts",
            "--backend",
            "perry",
            "--backend-perry-cli-path",
            path,
            "-o",
            "out.wasm",
        ),
        /Cannot access Perry CLI.*--backend-perry-cli-path/s,
    );
});

test.concurrent("rejects conflicting package and path selectors", async ({ project }) => {
    const dir = await project();
    await assert.rejects(
        cli(
            dir,
            "componentize",
            "src/main.ts",
            "--backend",
            "perry",
            "--backend-perry-cli-path",
            "perry",
            "--backend-perry-package",
            "other",
            "-o",
            "out.wasm",
        ),
        /Choose either --backend-perry-cli-path or --backend-perry-package/,
    );
});

test.concurrent.for([
    ['fs.writeFileSync(args.at(-1), "native binary");', /did not produce a WebAssembly object/],
    ['console.error("unknown WASI target"); process.exit(9);', /unknown WASI target/],
    ["process.exit(0);", /ENOENT/],
])(
    "rejects an unsupported compiler before user compilation and preserves output",
    async ([probeBody, diagnostic], { project }) => {
        const dir = await project();
        const launcher = await installCli(dir, { probeBody });
        await writeFile(join(dir, "out.wasm"), "keep");
        await assert.rejects(
            cli(
                dir,
                "componentize",
                "src/main.ts",
                "--backend",
                "perry",
                "--backend-perry-cli-path",
                launcher,
                "-o",
                "out.wasm",
            ),
            (error) => {
                assert.match(error.message, /failed the WASI support check.*target-wasi.*--backend-perry-cli-path/s);
                assert.ok(error.message.includes(launcher));
                assert.match(error.message, diagnostic);
                return true;
            },
        );
        await assert.rejects(stat(join(dir, "invocation.json")), { code: "ENOENT" });
        assert.equal(await readFile(join(dir, "out.wasm"), "utf8"), "keep");
        const probe = JSON.parse(await readFile(join(dir, "probe.json"), "utf8"));
        await assert.rejects(stat(probe.cwd), { code: "ENOENT" });
    },
);

test.concurrent.for([
    { wit: "custom.wit" },
    { worldName: "custom" },
    { bundle: true },
    { bundleConfig: "config.js" },
    { backendQjsDisableAsync: true },
    { backendQjsStubWasi: true },
    { withNodejsHttpVia: "direct" },
    { withNodejsVfsVia: "wasi-filesystem" },
    { withNodejsCryptoVia: "portable" },
    { engine: "engine.wasm" },
    { wizerBin: "wizer" },
])("rejects unsupported Perry options: %o", async (options) => {
    await assert.rejects(
        componentize("unused.ts", { backend: "perry", out: "unused.wasm", ...options }),
        /does not support|only supported by the starlingmonkey/,
    );
});

test.concurrent("rejects explicit Node compatibility flags through the CLI", async ({ project }) => {
    const dir = await project();
    await assert.rejects(
        cli(
            dir,
            "componentize",
            "src/main.ts",
            "--backend",
            "perry",
            "--with-nodejs-http-via",
            "direct",
            "-o",
            "out.wasm",
        ),
        /does not support --with-nodejs-http-via/,
    );
});

test.concurrent("other backends still require WIT and reject Perry-only options", async () => {
    await assert.rejects(componentize("unused.ts", { out: "unused.wasm" }), /--wit is required/);
    await assert.rejects(
        componentize("unused.ts", { out: "unused.wasm", backendPerryPackage: "other" }),
        /only supported by the perry backend/,
    );
    await assert.rejects(
        componentize("unused.ts", { out: "unused.wasm", backend: "quickjs", backendPerryCliPath: "perry" }),
        /--backend-perry-cli-path is only supported by the perry backend/,
    );
});

test.concurrent("rejects declaration files before invoking Perry", async () => {
    await assert.rejects(
        componentize("unused.d.ts", { backend: "perry", out: "unused.wasm" }),
        /declaration files cannot be componentized/,
    );
});

test.concurrent("preserves compiler diagnostics, existing output and caller cwd on failure, and removes scratch files", async ({
    project,
}) => {
    const dir = await project();
    await installCli(dir, { body: 'console.error("compiler diagnostic"); process.exit(7);' });
    await writeFile(join(dir, "out.wasm"), "existing output");
    const cwd = process.cwd();
    await assert.rejects(
        cli(dir, "componentize", "src/main.ts", "--backend", "perry", "-o", "out.wasm"),
        /compiler diagnostic[\s\S]*Perry compilation failed \(exit code 7\)/,
    );
    assert.strictEqual(await readFile(join(dir, "out.wasm"), "utf8"), "existing output");
    assert.strictEqual(process.cwd(), cwd);
    const { args } = JSON.parse(await readFile(join(dir, "invocation.json"), "utf8"));
    await assert.rejects(stat(dirname(args.at(-1))), { code: "ENOENT" });
});

test.concurrent.for([
    ["native binary", [0x7f, 0x45, 0x4c, 0x46]],
    ["core module", [0, 97, 115, 109, 1, 0, 0, 0]],
    ["non-command component", [0, 97, 115, 109, 13, 0, 1, 0]],
    ["malformed component", [0, 97, 115, 109, 13, 0, 1, 0, 255]],
])("rejects a %s without overwriting the destination", async ([_name, bytes], { project }) => {
    const dir = await project();
    await installCli(dir, { bytes });
    await writeFile(join(dir, "out.wasm"), "existing output");
    await assert.rejects(cli(dir, "componentize", "src/main.ts", "--backend", "perry", "-o", "out.wasm"));
    assert.strictEqual(await readFile(join(dir, "out.wasm"), "utf8"), "existing output");
});

test.concurrent("reports a successful compiler exit that did not write an output", async ({ project }) => {
    const dir = await project();
    await installCli(dir, { body: "process.exit(0);" });
    await assert.rejects(
        cli(dir, "componentize", "src/main.ts", "--backend", "perry", "-o", "out.wasm"),
        /Perry exited successfully but its component output could not be read/,
    );
    await assert.rejects(stat(join(dir, "out.wasm")), { code: "ENOENT" });
});
