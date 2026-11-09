import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assert, test } from "vitest";

import { exec, getTmpDir, jcoPath } from "./helpers.js";

const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/call-tracking", import.meta.url));

// TODO(unskip): Restore after @bytecodealliance/jco-transpile releases call tracking
// and Jco's published dependency is updated to that release.
test.skip("CLI forwards call tracking to transpilation and host type generation", async () => {
    const dir = await getTmpDir();
    try {
        const componentPath = join(FIXTURES_DIR, "component.wat");
        const witPath = join(FIXTURES_DIR, "component.wit");
        await writeFile(join(dir, "package.json"), '{"type":"module"}');

        for (const enabled of [false, true]) {
            const flags = enabled ? ["--call-tracking"] : [];
            const output = join(dir, `transpiled-${enabled}`);
            const typesOutput = join(dir, `types-${enabled}`);
            await exec(
                jcoPath,
                "transpile",
                componentPath,
                "--instantiation",
                "sync",
                "--name",
                "component",
                "--out-dir",
                output,
                ...flags,
            );
            await exec(
                jcoPath,
                "types",
                witPath,
                "--instantiation",
                "sync",
                "--name",
                "component",
                "--out-dir",
                typesOutput,
                ...flags,
            );

            const bindings = await import(pathToFileURL(join(output, "component.js")).href);
            const core = await readFile(join(output, "component.core.wasm"));
            const instance = bindings.instantiate(() => new WebAssembly.Module(core), {});
            assert.strictEqual(instance.run(7), 7);
            const declarations = await readFile(join(typesOutput, "component.d.ts"), "utf8");
            if (enabled) {
                const call = instance._util.calls.start(instance.run, 42);
                assert.strictEqual(call.result, 42);
                assert.deepEqual(await call.finished, { status: "completed" });
                assert.include(declarations, "readonly calls:");
            } else {
                assert.notProperty(instance._util, "calls");
                assert.notInclude(declarations, "readonly calls:");
            }
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
