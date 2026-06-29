import { join, basename } from "node:path";
import { spawn } from "node:child_process";

import { suite, test, assert, expect, beforeAll } from "vitest";

import { COMPONENT_MODEL_FIXTURES_WAST_DIR } from "../../../common.js";
import { fileExists, setupAsyncTest } from "../../../helpers.js";

// Relative paths to tests that should be skipped
const WAST_TESTS = [
    { relPath: "async/wait-during-callback.wast", skip: true },
    { relPath: "async/cancel-stream.wast", skip: true },
    { relPath: "async/sync-streams.wast", skip: true },
    { relPath: "async/deadlock.wast", skip: true },
    { relPath: "async/trap-if-block-and-sync.wast", skip: true },
    { relPath: "async/partial-stream-copies.wast", skip: true },
    { relPath: "async/trap-on-reenter.wast", skip: true },
    { relPath: "async/sync-barges-in.wast", skip: true },
    { relPath: "async/same-component-stream-future.wast", skip: true },
    { relPath: "async/futures-must-write.wast", skip: true },
    { relPath: "async/dont-block-start.wast", skip: true },
    { relPath: "async/cross-abi-calls.wast", skip: true },
    { relPath: "async/empty-wait.wast", skip: true },
    { relPath: "async/zero-length.wast", skip: true },
    { relPath: "async/cancel-subtask.wast", skip: true },
    { relPath: "async/closed-stream.wast", skip: true },
    { relPath: "async/passing-resources.wast", skip: true },
    { relPath: "async/drop-cross-task-borrow.wast", skip: true },
    { relPath: "async/trap-if-done.wast", skip: true },
    { relPath: "async/drop-waitable-set.wast", skip: true },
    { relPath: "async/drop-stream.wast", skip: true },
    { relPath: "async/async-calls-sync.wast", skip: true },
    { relPath: "async/drop-subtask.wast", skip: true },
    { relPath: "async/cancellable.wast", skip: true },
];

// These tests are ported from the component-model repo
//
// see: https://github.com/WebAssembly/component-model/tree/main/test
//
suite("", async () => {
    beforeAll(async () => {
        for (const { relPath, skip } of WAST_TESTS) {
            if (skip) {
                continue;
            }
            const wastPath = join(COMPONENT_MODEL_FIXTURES_WAST_DIR, relPath);
            const fixtureBuild = spawn("cargo", ["xtask", "build-wast-fixture", wastPath], {
                detached: false,
                stdio: "inherit",
                shell: true,
            });
            // TODO: handle xtask build failure
            await new Promise((resolve) => fixtureBuild.on("exit", resolve));
        }
    });

    for (const { relPath, skip } of WAST_TESTS) {
        const wasmPath = join(COMPONENT_MODEL_FIXTURES_WAST_DIR, relPath.replace(/.wast$/, ".wast.wasm"));
        const scriptPath = join(COMPONENT_MODEL_FIXTURES_WAST_DIR, relPath.replace(/.wast$/, ".js"));

        const t = skip ? test.skip : test.concurrent;
        t(relPath, async () => {
            assert(await fileExists(wasmPath), `missing generated wasm component @ [${wasmPath}]`);
            assert(await fileExists(scriptPath), `missing generated script @ [${scriptPath}]`);

            let cleanup;
            try {
                const setup = await setupAsyncTest({
                    asyncMode: "jspi",
                    component: {
                        name: basename(relPath).replace(".wast", ""),
                        path: wasmPath,
                    },
                    // jco: {
                    //     transpile: {
                    //         extraArgs: {
                    //             minify: false,
                    //         },
                    //     },
                    // },
                });
                cleanup = setup.cleanup;
                const instance = setup.instance;

                const mod = await import(scriptPath);
                await mod.runWastTest({
                    instance,
                    assert,
                    expect,
                });
            } finally {
                await cleanup?.();
            }
        });
    }
});
