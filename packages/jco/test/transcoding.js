import { resolve } from "node:path";
import { execArgv } from "node:process";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";

import { fileURLToPath, pathToFileURL } from "node:url";

import { exec, jcoPath, getTmpDir } from "./helpers.js";

import { suite, test, beforeAll, afterAll, afterEach, assert } from "vitest";

const multiMemory = execArgv.includes("--experimental-wasm-multi-memory") ? ["--multi-memory"] : [];

suite("CLI", () => {
    var tmpDir;
    var outDir;
    var outFile;

    beforeAll(async function () {
        tmpDir = await getTmpDir();
        outDir = resolve(tmpDir, "out-component-dir");
        outFile = resolve(tmpDir, "out-component-file");

        const modulesDir = resolve(tmpDir, "node_modules", "@bytecodealliance");
        await mkdir(modulesDir, { recursive: true });
        await symlink(
            fileURLToPath(new URL("../packages/preview2-shim", import.meta.url)),
            resolve(modulesDir, "preview2-shim"),
            "dir",
        );
    });

    afterAll(async function () {
        try {
            await rm(tmpDir, { recursive: true });
        } catch {}
    });

    afterEach(async function () {
        try {
            await rm(outDir, { recursive: true });
            await rm(outFile);
        } catch {}
    });

    test("Transcoding", async () => {
        const { stderr } = await exec(
            jcoPath,
            "transpile",
            `test/fixtures/env-allow.composed.wasm`,
            ...multiMemory,
            "-o",
            outDir,
        );
        assert.strictEqual(stderr, "");
        await writeFile(`${outDir}/package.json`, JSON.stringify({ type: "module" }));
        const m = await import(`${pathToFileURL(outDir)}/env-allow.composed.js`);
        assert.deepStrictEqual(m.testGetEnv(), [["CUSTOM", "VAL"]]);
    });

    test("Transcoding UTF8 <-> UTF16", async () => {
        const { stdout, stderr } = await exec(
            jcoPath,
            "run",
            `test/fixtures/utf8-utf16.composed.wasm`,
            ...multiMemory,
            "--",
            "asdf中文🀄️⏰",
        );
        assert.strictEqual(stdout, "ret: asdf中文🀄️⏰asdf中文🀄️⏰\n");
        assert.strictEqual(stderr, "");
    });
});
