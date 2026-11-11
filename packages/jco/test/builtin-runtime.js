import { readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { rolldown } from "rolldown";
import { assert, suite, test } from "vitest";

import { transpileComponent } from "../src/cmd/transpile.js";
import { exec, getTmpDir, jcoPath } from "./helpers.js";

const adder = new URL("../../jco-transpile/test/fixtures/components/runtime/adder.component.wasm", import.meta.url);

/** The package bindings import the Component Model runtime from when one is selected. */
const RUNTIME_PACKAGE = "@bytecodealliance/jco-cm-runtime";

/** Prefix of the runtime names that the transpiler bundles into bindings. */
const BUNDLED_RUNTIME_NAMESPACE = "__jcoEmbeddedRuntime$";

suite("built-in Component Model runtime", () => {
    for (const minify of [false, true]) {
        // TODO(unskip): Restore after @bytecodealliance/jco-transpile releases bindings that bundle
        // the Component Model runtime and Jco's published dependency is updated to that release.
        test.skip(`bindings bundle the runtime and can be bundled again (minify=${minify})`, async () => {
            const dir = await getTmpDir();
            try {
                const { files } = await transpileComponent(await readFile(adder), {
                    name: "component",
                    nodejsCompat: true,
                    base64Cutoff: 0,
                    minify,
                });
                await writeFile(join(dir, "package.json"), '{"type":"module"}');
                for (const [name, bytes] of Object.entries(files)) {
                    if (name.endsWith(".js") || name.endsWith(".wasm")) {
                        await writeFile(join(dir, basename(name)), bytes);
                    }
                }

                // The bindings import no runtime: they run with nothing else installed.
                const entry = join(dir, "component.js");
                const source = await readFile(entry, "utf8");
                assert.notInclude(source, RUNTIME_PACKAGE);
                if (!minify) {
                    assert.include(source, BUNDLED_RUNTIME_NAMESPACE);
                }
                const direct = await import(pathToFileURL(entry).href);
                assert.equal(direct.add.add(17, 25), 42);

                // A consumer's bundler can process the bindings like any other module.
                const build = await rolldown({
                    input: entry,
                    platform: "node",
                    external: (id) => id.startsWith("node:"),
                });
                try {
                    await build.write({ file: join(dir, "bundled.mjs"), format: "esm", minify, codeSplitting: false });
                } finally {
                    await build.close();
                }
                const bundled = await import(pathToFileURL(join(dir, "bundled.mjs")).href);
                assert.equal(bundled.add.add(17, 25), 42);
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });
    }

    // TODO(unskip): Restore after @bytecodealliance/jco-transpile releases bindings that bundle
    // the Component Model runtime and Jco's published dependency is updated to that release.
    test.skip("jco transpile bundles the runtime unless one is selected", async () => {
        const dir = await getTmpDir();
        try {
            await exec(
                jcoPath,
                "transpile",
                fileURLToPath(adder),
                "--name",
                "component",
                "--base64-cutoff",
                "0",
                "--out-dir",
                dir,
                "--quiet",
            );
            await writeFile(join(dir, "package.json"), '{"type":"module"}');
            const source = await readFile(join(dir, "component.js"), "utf8");
            assert.include(source, BUNDLED_RUNTIME_NAMESPACE);
            assert.notInclude(source, RUNTIME_PACKAGE);
            const instance = await import(pathToFileURL(join(dir, "component.js")).href);
            assert.equal(instance.add.add(17, 25), 42);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
