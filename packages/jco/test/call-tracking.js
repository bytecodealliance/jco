import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { assert, test } from "vitest";

import { JCO_JS_PATH } from "./common.js";

const execFileAsync = promisify(execFile);

// TODO(unskip): Restore after @bytecodealliance/jco-transpile releases call tracking
// and Jco's published dependency is updated to that release.
test.skip("CLI forwards call tracking to transpilation and host type generation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jco-call-tracking-"));
    try {
        const componentPath = join(dir, "component.wat");
        const witPath = join(dir, "component.wit");
        await writeFile(join(dir, "package.json"), '{"type":"module"}');
        await writeFile(
            componentPath,
            `(component
                (core module $m (func (export "run") (param i32) (result i32) (local.get 0)))
                (core instance $i (instantiate $m))
                (func (export "run") (param "value" u32) (result u32)
                    (canon lift (core func $i "run"))))`,
        );
        await writeFile(witPath, "package test:tracking; world component { export run: func(value: u32) -> u32; }");

        for (const enabled of [false, true]) {
            const flags = enabled ? ["--call-tracking"] : [];
            const output = join(dir, `transpiled-${enabled}`);
            const typesOutput = join(dir, `types-${enabled}`);
            await execFileAsync(process.execPath, [
                JCO_JS_PATH,
                "transpile",
                componentPath,
                "--instantiation",
                "sync",
                "--name",
                "component",
                "--out-dir",
                output,
                ...flags,
            ]);
            await execFileAsync(process.execPath, [
                JCO_JS_PATH,
                "types",
                witPath,
                "--instantiation",
                "sync",
                "--name",
                "component",
                "--out-dir",
                typesOutput,
                ...flags,
            ]);

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
