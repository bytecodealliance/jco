import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rolldown } from "rolldown";
import { assert, expect, test } from "vitest";
import { transpileComponent } from "../src/cmd/transpile.js";
import { exec, jcoPath } from "./helpers.js";

for (const minify of [false, true]) {
    test(`embedded runtime loads in Node and bundles again (minify=${minify})`, async () => {
        const directory = await mkdtemp(join(tmpdir(), "jco-embedded-"));
        try {
            const component = await readFile(
                new URL("../../jco-transpile/test/fixtures/components/runtime/adder.component.wasm", import.meta.url),
            );
            const { files } = await transpileComponent(component, {
                name: "component",
                embedRuntime: true,
                nodejsCompat: true,
                base64Cutoff: 0,
                minify,
            });
            await writeFile(join(directory, "package.json"), '{"type":"module"}');
            for (const [name, bytes] of Object.entries(files)) {
                if (name.endsWith(".js") || name.endsWith(".wasm")) {
                    await writeFile(join(directory, basename(name)), bytes);
                }
            }
            const entry = join(directory, "component.js");
            assert.notInclude(await readFile(entry, "utf8"), "@bytecodealliance/jco-cm-runtime");
            if (!minify) {
                assert.include(await readFile(entry, "utf8"), "__jcoEmbeddedRuntime$");
            }
            const direct = await import(pathToFileURL(entry).href);
            assert.equal(direct.add.add(17, 25), 42);

            const build = await rolldown({ input: entry, platform: "node", external: (id) => id.startsWith("node:") });
            try {
                await build.write({
                    file: join(directory, "bundled.mjs"),
                    format: "esm",
                    minify,
                    codeSplitting: false,
                });
            } finally {
                await build.close();
            }
            const bundled = await import(pathToFileURL(join(directory, "bundled.mjs")).href);
            assert.equal(bundled.add.add(17, 25), 42);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
}

test("CLI exposes embedded runtime generation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jco-embedded-cli-"));
    try {
        const fixture = fileURLToPath(
            new URL("../../jco-transpile/test/fixtures/components/runtime/adder.component.wasm", import.meta.url),
        );
        await exec(
            jcoPath,
            "transpile",
            fixture,
            "--embed-runtime",
            "--name",
            "component",
            "--base64-cutoff",
            "0",
            "--out-dir",
            directory,
            "--quiet",
        );
        await writeFile(join(directory, "package.json"), '{"type":"module"}');
        const source = await readFile(join(directory, "component.js"), "utf8");
        assert.include(source, "__jcoEmbeddedRuntime$");
        assert.notInclude(source, "@bytecodealliance/jco-cm-runtime");
        const instance = await import(pathToFileURL(join(directory, "component.js")).href);
        assert.equal(instance.add.add(17, 25), 42);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("embedding rejects an external runtime provider", async () => {
    const component = await readFile(
        new URL("../../jco-transpile/test/fixtures/components/runtime/adder.component.wasm", import.meta.url),
    );
    await expect(
        transpileComponent(component, { embedRuntime: true, cmRuntimeEsModule: "./runtime/" }),
    ).rejects.toThrow("bundled runtime selects the built-in provider");
});
