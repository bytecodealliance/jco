import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { suite, test } from "vitest";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { componentizeFixture, transpileComponent, getTmpDir } from "../helpers.js";

const fixture = fileURLToPath(new URL("../fixtures/componentize/node-readline/", import.meta.url));
const simpleOutput = "What do you think of Node.js? Thank you for your valuable feedback: Useful!\n";

function runSimple(path) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path], { stdio: "pipe" });
        let stdout = "",
            stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("error", reject);
        child.on("close", (code) =>
            code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`simple example exited ${code}: ${stderr}`)),
        );
        child.stdin.end("Useful!\n");
    });
}

suite("node:readline", () => {
    // TODO(unskip): publish and depend on a jco-std release exporting readline, readline/promises,
    // events, errors and abort-globals. The builtin plugin resolves the installed package in CI.
    test.concurrent.skip("the documentation simple example reads real stdin and writes stdout", async () => {
        const dir = await getTmpDir();
        const bundle = await rolldown({
            input: join(fixture, "simple.js"),
            external: ["node:process"],
            plugins: [nodeBuiltinPlugin({ imports: [], exports: [] })],
        });
        const output = join(dir, "simple.mjs");
        try {
            await bundle.write({ file: output, format: "esm" });
        } finally {
            await bundle.close();
        }
        const results = await Promise.all([runSimple(output), runSimple(join(fixture, "simple.js"))]);
        for (const result of results) {
            assert.deepEqual(result, { stdout: simpleOutput, stderr: "" });
        }
    });

    for (const backend of ["quickjs", "starlingmonkey"]) {
        // TODO(unskip): publish and depend on a jco-std release exporting readline, readline/promises,
        // events, errors and abort-globals before bundling this fixture with either component engine.
        test.concurrent.skip(
            `questions, line parsing and terminal APIs execute in ${backend}`,
            async () => {
                const { componentPath, stderr } = await componentizeFixture({
                    fixture: "node-readline",
                    entry: "source.js",
                    wit: backend === "quickjs" ? "quickjs.wit" : "source.wit",
                    world: "test",
                    bundle: true,
                    extraArgs: ["--backend", backend],
                });
                assert.equal(stderr, "");
                const { modulePath } = await transpileComponent({ componentPath, name: `node-readline-${backend}` });
                const component = await import(modulePath);
                assert.deepEqual(JSON.parse(await component.run()), {
                    simple: simpleOutput,
                    moduleIdentity: true,
                    eventIdentity: true,
                    callbackAnswer: "yes",
                    lines: ["A🌍", "", "next", "last", "para", "tail"],
                    cleanup: true,
                    editedLine: "abXc",
                    cursor: { cols: 5, rows: 0 },
                    history: ["abXc"],
                    recalled: "abXc",
                    rawReleased: true,
                    completion: "hel",
                    promiseCompletion: "wor",
                    keys: [
                        ["a", "a", false],
                        [null, "left", true],
                    ],
                    deferred: true,
                    actions: "\x1b[2;3H\x1b[1D\x1b[3B\x1b[2K\x1b[0J",
                    autoCommit: "\x1b[1G",
                    iterated: ["first", "second", "tail"],
                    abort: ["AbortError", "ABORT_ERR", "cancelled"],
                    closedError: "ERR_USE_AFTER_CLOSE",
                });
            },
            180_000,
        );
    }
});
