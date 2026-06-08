import { join, relative } from "node:path";
import { opendir } from "node:fs/promises";
import { spawn } from "node:child_process";

import { suite, test, assert, beforeAll } from "vitest";

import { COMPONENT_MODEL_FIXTURES_WAST_DIR } from "../../../common.js";
import { fileExists } from "../../../helpers.js";

// These tests are ported from the component-model repo
//
// see: https://github.com/WebAssembly/component-model/tree/main/test
//
suite("component-model", async () => {
    let metadata = [];
    const walker = await opendir(COMPONENT_MODEL_FIXTURES_WAST_DIR, { recursive: true });

    for await (const dirent of walker) {
        if (!dirent.isFile()) {
            continue;
        }
        const wastPath = join(dirent.parentPath, dirent.name);
        const wastRelPath = relative(COMPONENT_MODEL_FIXTURES_WAST_DIR, wastPath);
        const wasmPath = join(COMPONENT_MODEL_FIXTURES_WAST_DIR, `${dirent.name}.wasm`);
        const scriptPath = join(COMPONENT_MODEL_FIXTURES_WAST_DIR, `${dirent.name}.js`);
        metadata.push({
            wastRelPath,
            wastPath,
            wasmPath,
            scriptPath,
        });
    }

    metadata = metadata.slice(0,1);

    beforeAll(async () => {
        for (const { wastPath } of metadata) {
            const fixtureBuild = spawn("cargo", ["xtask", "build-wast-fixture", wastPath], {
                detached: false,
                stdio: "inherit",
                shell: true,
            });
            await new Promise(resolve => fixtureBuild.on("exit", resolve));
        }
    });

    for (const { wastRelPath, wasmPath, scriptPath } of metadata) {
        test.concurrent(wastRelPath, async () => {
            assert(await fileExists(wasmPath), `missing generated wasm component @ [${wasmPath}]`);
            assert(await fileExists(scriptPath), `missing generated script @ [${scriptPath}]`);
            // TODO: convert WAST test to WAST + executable JS
            assert.strictEqual(true, true);
        });
    }
});
