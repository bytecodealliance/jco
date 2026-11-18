import * as nodeModule from "node:module";

import { suite, test, assert } from "vitest";

import { exec, jcoPath } from "./helpers.js";

/** Preloaded into the CLI's process: writes the URL of every module it loads to stderr on exit. */
const RECORD_LOADS = `data:text/javascript,${encodeURIComponent(`
import { registerHooks } from "node:module";
const loaded = [];
registerHooks({
    load(url, context, nextLoad) {
        loaded.push(url);
        return nextLoad(url, context);
    },
});
process.on("exit", () => process.stderr.write("\\nLOADED " + JSON.stringify(loaded)));
`)}`;

/**
 * Run the CLI and list the modules that its process loaded.
 *
 * @param {...(string | object)} args - CLI arguments, optionally followed by options of `exec`
 * @returns {Promise<{ stdout: string, loaded: string[] }>} the output and the loaded module URLs
 */
async function runRecordingLoads(...args) {
    const { stdout, stderr } = await exec("--import", RECORD_LOADS, jcoPath, ...args);
    return { stdout, loaded: JSON.parse(stderr.slice(stderr.lastIndexOf("\nLOADED ") + 8)) };
}

/** Whether a loaded module belongs to a command or to the transpiler that commands import. */
const isCommandModule = (url) => /\/jco\/dist\/cmd\/|\/jco-transpile\//.test(url);

suite("CLI start-up", () => {
    // Synchronous module hooks are not available in every supported Node.js release.
    test.skipIf(typeof nodeModule.registerHooks !== "function").concurrent(
        "a command is loaded only when it runs",
        async () => {
            for (const args of [["--version"], ["--help"], ["transpile", "--help"]]) {
                const { loaded } = await runRecordingLoads(...args);
                assert.isTrue(loaded.some((url) => url.endsWith("/dist/jco.js")));
                assert.deepStrictEqual(loaded.filter(isCommandModule), [], `jco ${args.join(" ")}`);
            }

            // A command brings in its own module, and not those of other commands.
            const { loaded } = await runRecordingLoads("print", "test/fixtures/modules/exitcode.wasm");
            const commands = loaded.filter((url) => url.includes("/jco/dist/cmd/"));
            assert.lengthOf(commands, 1);
            assert.isTrue(commands[0].endsWith("/dist/cmd/wasm-tools.js"));
        },
    );

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
