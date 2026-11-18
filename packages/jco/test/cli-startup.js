import { readFile } from "node:fs/promises";

import { suite, test, assert } from "vitest";

import { exec, jcoPath } from "./helpers.js";

suite("CLI start-up", () => {
    test.concurrent("the entry point statically imports no command", async () => {
        const source = await readFile(jcoPath, "utf8");
        const imports = [...source.matchAll(/^import\s[^;]*?\sfrom\s+["']([^"']+)["'];/gm)].map((match) => match[1]);

        // Every command is loaded by its action; anything imported here delays all of them.
        assert.deepStrictEqual(imports.sort(), ["./common.js", "commander"]);
        assert.match(source, /await import\("\.\/cmd\/transpile\.js"\)/);
    });

    test.concurrent("--version and --help answer for the program and for a command", async () => {
        const version = await exec(jcoPath, "--version");
        assert.match(version.stdout, /^\d+\.\d+\.\d+\n$/);
        assert.strictEqual(version.stderr, "");

        const help = await exec(jcoPath, "--help");
        for (const command of ["componentize", "transpile", "types", "run", "serve", "opt", "print", "scaffold"]) {
            assert.match(help.stdout, new RegExp(`^  ${command}\\b`, "m"));
        }

        const commandHelp = await exec(jcoPath, "transpile", "--help");
        assert.include(commandHelp.stdout, "--out-dir <out-dir>");

        // `run` takes every option after the component for the component, except a leading `--help`.
        const runHelp = await exec(jcoPath, "run", "--help");
        assert.include(runHelp.stdout, "Run a WASI Command component");
    });

    test.concurrent("a failing command is reported under the name of its function", async () => {
        const { stdout, stderr } = await exec(jcoPath, "print", "test/fixtures/missing.wasm", { expectedExitCode: 1 });
        assert.match(stdout, /^\(jco print\) /);
        assert.include(stderr, "Unable to read file");
    });

    test.concurrent("a command loaded on demand runs", async () => {
        const { stdout, stderr } = await exec(jcoPath, "print", "test/fixtures/modules/exitcode.wasm");
        assert.strictEqual(stderr, "");
        assert.match(stdout, /^\(module\b/);
    });
});
