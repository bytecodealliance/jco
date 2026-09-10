import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { suite, test } from "vitest";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { componentizeFixture, transpileComponent } from "../helpers.js";

const fixtures = fileURLToPath(new URL("../fixtures/componentize/", import.meta.url));

async function bundle(entry) {
    const build = await rolldown({ input: entry, plugins: [nodeBuiltinPlugin({ imports: [], exports: [] })] });
    try {
        const { output } = await build.generate({ format: "esm" });
        return output[0].code;
    } finally {
        await build.close();
    }
}

// Strings that only acorn's tokenizer contains, so their absence proves the parser was not bundled.
const acornMarkers = ["Unterminated template", "Unterminated string constant", "acorn"];

suite("node:repl", () => {
    // TODO(unskip): use the published jco-std node:repl export once a release containing it ships and
    // jco's dependency range is bumped; the workspace copy has it, the published 0.3.x does not.
    test.skip("acorn is bundled only when node:repl is imported", async () => {
        const withoutRepl = await bundle(join(fixtures, "node-string-decoder/source.js"));
        for (const marker of acornMarkers) {
            assert.equal(withoutRepl.includes(marker), false, `unexpected ${marker} in a bundle without node:repl`);
        }
        const withRepl = await bundle(join(fixtures, "node-repl/source.js"));
        for (const marker of acornMarkers) {
            assert.equal(withRepl.includes(marker), true, `expected ${marker} in a bundle with node:repl`);
        }
    });

    for (const backend of ["quickjs", "starlingmonkey"]) {
        // TODO(unskip): publish the jco-std node:repl export and update jco's dependency range;
        // componentize resolves the installed package, which does not yet export this module.
        test.skip(`a scripted session evaluates, recovers, errors and exits in ${backend}`, async () => {
            const { componentPath, stderr } = await componentizeFixture({
                fixture: "node-repl",
                entry: "source.js",
                wit: backend === "quickjs" ? "quickjs.wit" : "source.wit",
                world: "test",
                bundle: true,
                extraArgs: ["--backend", backend],
            });
            assert.equal(stderr, "");
            const { modulePath } = await transpileComponent({ componentPath, name: `node-repl-${backend}` });
            const component = await import(modulePath);
            const report = JSON.parse(await component.run());
            assert.deepEqual(
                { ...report, output: undefined },
                {
                    moduleIdentity: true,
                    prototype: true,
                    builtinModules: true,
                    validSyntax: [true, false],
                    closed: true,
                    events: ["exit"],
                    lines: 15,
                    refusal: ["ERR_JCO_UNSUPPORTED_NODE_API", 0, ""],
                    deprecated: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
                    output: undefined,
                },
            );
            assert.equal(
                report.output,
                [
                    "> 2",
                    "> undefined",
                    "> 42",
                    "> | | | undefined",
                    "> 42",
                    "> { a: 1, b: 'two' }",
                    "> 'from the host program'",
                    "> 'from the host program'",
                    "> Uncaught Error: boom",
                    "> 'boom'",
                    "> foo bar",
                    "    ^",
                    "",
                    "Uncaught SyntaxError: Unexpected identifier 'bar'",
                    "> HELLO THERE",
                    "> undefined",
                    "> 'awaited'",
                    "> .break   Sometimes you get stuck, this gets you out",
                    ".clear   Alias for .break",
                    ".exit    Exit the REPL",
                    ".help    Print this help message",
                    ".load    Load JS from a file into the REPL session",
                    ".save    Save all evaluated commands in this REPL session to a file",
                    ".shout   Shout the rest",
                    "",
                    "Press Ctrl+C to abort current expression, Ctrl+D to exit the REPL",
                    "> ",
                ].join("\n"),
            );
        }, 180_000);
    }
});
