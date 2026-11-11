import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, suite, test } from "vitest";

import { exec, getTmpDir, jcoPath } from "./helpers.js";

/** The workspace Component Model runtime; a file URL resolves from temporary output directories. */
const runtimeUrl = new URL("../../jco-cm-runtime/dist/", import.meta.url).href;
const command = fileURLToPath(new URL("./fixtures/components/hello_stdout.component.wasm", import.meta.url));

suite("workspace Component Model runtime", () => {
    // TODO(unskip): Restore after @bytecodealliance/jco-transpile releases bindings that import
    // every intrinsic from the runtime and Jco's published dependency is updated to that release.
    test.skip("transpiled bindings import the runtime instead of defining its intrinsics", async () => {
        const dir = await getTmpDir();
        try {
            await exec(
                jcoPath,
                "transpile",
                command,
                "--name",
                "command",
                "--out-dir",
                dir,
                "--cm-runtime-es-module",
                runtimeUrl,
            );
            const source = await readFile(join(dir, "command.js"), "utf8");
            expect(source).toContain(`from "${runtimeUrl}intrinsics/component.js"`);
            expect(source).toContain("stopInstance as _stopInstance");
            expect(source).not.toContain("function _stopInstance(");
            expect(source).not.toContain("function _whenIdle(");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    // TODO(unskip): Restore after @bytecodealliance/jco-transpile releases bindings that match
    // the workspace runtime and Jco's published dependency is updated to that release.
    test.skip("run executes a command against the runtime with the same output as inline", async () => {
        const inlineDir = await getTmpDir();
        const runtimeDir = await getTmpDir();
        try {
            const inline = await exec(jcoPath, "run", "--jco-dir", inlineDir, command);
            const external = await exec(
                jcoPath,
                "run",
                "--jco-dir",
                runtimeDir,
                "--jco-cm-runtime-es-module",
                runtimeUrl,
                command,
            );
            expect(external).toEqual(inline);
            const name = "hello_stdout.component";
            expect(await readFile(join(runtimeDir, `${name}.js`), "utf8")).toContain(runtimeUrl);
            expect(await readFile(join(inlineDir, `${name}.js`), "utf8")).not.toContain(runtimeUrl);
        } finally {
            await rm(inlineDir, { recursive: true, force: true });
            await rm(runtimeDir, { recursive: true, force: true });
        }
    });
});
