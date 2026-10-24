import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { suite, test, assert, expect } from "vitest";

import { COMPONENT_JS_FIXTURES_DIR } from "./common.js";
import { exec, getTmpDir, jcoPath, transpileComponent } from "./helpers.js";

const FIXTURE_DIR = join(COMPONENT_JS_FIXTURES_DIR, "script-only");

/** Build the fixture's engine and script-only components with the CLI. */
async function componentizeScriptOnly(args) {
    const { backend, sources = ["greet.js", "calc.ts"], wits = ["wit-greeter", "wit-calc"], extraArgs = [] } = args;
    const outputDir = await getTmpDir();
    const { stdout, stderr } = await exec(
        jcoPath,
        "componentize",
        "--script-only",
        ...sources.map((source) => join(FIXTURE_DIR, source)),
        ...wits.flatMap((wit) => ["--wit", join(FIXTURE_DIR, wit)]),
        ...(backend ? ["--backend", backend] : []),
        "-o",
        outputDir,
        ...extraArgs,
        { closeStdin: true },
    );
    return { outputDir, stdout, stderr };
}

suite("componentize --script-only", () => {
    for (const backend of ["starlingmonkey", "quickjs"]) {
        test(`runs scripts one after the other on a ${backend} engine`, async () => {
            const { outputDir, stdout } = await componentizeScriptOnly({ backend });
            assert.deepStrictEqual((await readdir(outputDir)).sort(), [
                "calc.wasm",
                "engine.wasm",
                "engine.wit",
                "greet.wasm",
            ]);
            assert.match(stdout, /engine\.wasm/);

            // The host supplies the engine world's imports; the scripts' components only carry source.
            const transpiledDir = await getTmpDir();
            await writeFile(
                join(transpiledDir, "logger.js"),
                "export const messages = [];\nexport function log(message) {\n    messages.push(message);\n}\n",
            );
            const engine = await transpileComponent({
                componentPath: join(outputDir, "engine.wasm"),
                name: "engine",
                outputDir: transpiledDir,
                extraArgs: ["--map", "local:greeter/logger=./logger.js"],
            });
            const greet = await transpileComponent({
                componentPath: join(outputDir, "greet.wasm"),
                name: "greet",
                outputDir: transpiledDir,
            });
            const calc = await transpileComponent({
                componentPath: join(outputDir, "calc.wasm"),
                name: "calc",
                outputDir: transpiledDir,
            });

            const { scriptLoader, greeter, calc: calculator, run } = await import(engine.modulePath);
            const { script: greetScript } = await import(greet.modulePath);
            const { script: calcScript } = await import(calc.modulePath);
            const logger = await import(`${pathToFileURL(transpiledDir)}/logger.js`);

            assert.strictEqual(scriptLoader.loaded(), undefined);

            assert.strictEqual(greetScript.name(), "greet.js");
            assert.strictEqual(greetScript.engineWorld(), "jco:script-engine/engine@0.1.0");
            // Scripts are packaged as ES modules importing their WIT interfaces by specifier.
            assert.match(greetScript.source(), /^import \{ log \} from "local:greeter\/logger";/m);
            assert.match(greetScript.source(), /^export \{ greeter, run \};\s*$/m);
            assert.notMatch(greetScript.source(), /\brequire\(/);
            assert.deepStrictEqual([...greetScript.exports()].sort(), ["greeter", "run"]);
            scriptLoader.load(greetScript.name(), greetScript.source());
            assert.strictEqual(scriptLoader.loaded(), "greet.js");
            assert.strictEqual(run(), "greet");
            assert.strictEqual(greeter.greet("jco"), "Hello, jco!");
            assert.deepStrictEqual(logger.messages, ["greeting jco"]);
            const counter = new greeter.Counter(41);
            counter.increment();
            assert.strictEqual(counter.get(), 42);
            assert.strictEqual(greeter.Counter.next(1).get(), 2);

            assert.strictEqual(calcScript.name(), "calc.js");
            assert.deepStrictEqual([...calcScript.exports()].sort(), ["calc", "run"]);
            scriptLoader.load(calcScript.name(), calcScript.source());
            assert.strictEqual(scriptLoader.loaded(), "calc.js");
            assert.strictEqual(run(), "calc");
            assert.strictEqual(calculator.add(2, 3), 5);

            // A script that fails to parse leaves the previous script loaded.
            assert.throws(
                () => scriptLoader.load("broken.js", "this is not javascript"),
                /failed to parse script "broken\.js"/,
            );
            assert.strictEqual(scriptLoader.loaded(), "calc.js");
            assert.throws(
                () => scriptLoader.load("throws.js", "throw new Error('boom');"),
                /failed to evaluate script "throws\.js": Error: boom/,
            );
            assert.throws(
                () => scriptLoader.load("no-import.js", 'import { getStdout } from "wasi:cli/stdout@0.2.3";'),
                /"wasi:cli\/stdout@0\.2\.3" is not imported by the engine world/,
            );
            assert.throws(
                () => scriptLoader.load("cjs.js", "module.exports = { run() {} };"),
                /failed to evaluate script "cjs\.js"/,
            );
            // Hand-written modules work as long as they follow the bundled shape.
            scriptLoader.load(
                "inline.js",
                [
                    'import logger, { log } from "local:greeter/logger";',
                    "const greeter = { greet(name) { logger.log(`inline ${name}`); log(name); return name.toUpperCase(); } };",
                    'export { greeter, greeter as "alias" };',
                ].join("\n"),
            );
            assert.strictEqual(greeter.greet("esm"), "ESM");
            assert.deepStrictEqual(logger.messages.slice(-2), ["inline esm", "esm"]);

            scriptLoader.unload();
            assert.strictEqual(scriptLoader.loaded(), undefined);
        });
    }

    test("builds only the engine when no scripts are given", async () => {
        const { outputDir } = await componentizeScriptOnly({ backend: "quickjs", sources: [] });
        assert.deepStrictEqual((await readdir(outputDir)).sort(), ["engine.wasm", "engine.wit"]);
    });

    test("rejects a script importing an interface the engine world lacks", async () => {
        await expect(
            componentizeScriptOnly({ backend: "quickjs", sources: ["bad-import.js"], wits: ["wit-calc"] }),
        ).rejects.toThrow(/"wasi:clocks\/wall-clock@0\.2\.3", which the engine world does not import/);
    });

    test("rejects worlds whose exports collide", async () => {
        await expect(
            componentizeScriptOnly({ backend: "quickjs", sources: [], wits: ["wit-calc", "wit-calc-conflict"] }),
        ).rejects.toThrow(/would both be exported as \[calc\]/);
    });

    test("requires --wit", async () => {
        await expect(componentizeScriptOnly({ backend: "quickjs", sources: [], wits: [] })).rejects.toThrow(
            /--script-only requires at least one --wit/,
        );
    });

    test("rejects several --wit paths without --script-only", async () => {
        const outputDir = await getTmpDir();
        await expect(
            exec(
                jcoPath,
                "componentize",
                join(FIXTURE_DIR, "greet.js"),
                "--wit",
                join(FIXTURE_DIR, "wit-greeter"),
                "--wit",
                join(FIXTURE_DIR, "wit-calc"),
                "-o",
                join(outputDir, "component.wasm"),
                { closeStdin: true },
            ),
        ).rejects.toThrow(/several --wit paths can only be combined with --script-only/);
    });
});
