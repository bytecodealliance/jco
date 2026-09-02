import { join, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { suite, test, assert, expect, beforeAll } from 'vitest';

import { COMPONENT_MODEL_FIXTURES_WAST_DIR } from '../../../common.js';
import { fileExists, setupAsyncTest } from '../../../helpers.js';

// Relative paths to component-model WAST tests
interface WastTest {
    relPath: string;
    skip?: boolean;
}

interface WastTestModule {
    runWastTest(args: { instance: object; assert: typeof assert; expect: typeof expect }): Promise<void>;
}

const WAST_TESTS: readonly WastTest[] = [
    // Running tests
    { relPath: 'async/wait-during-callback.wast' },
    { relPath: 'async/cancel-stream.wast' },
    { relPath: 'async/partial-stream-copies.wast' },
    { relPath: 'async/futures-must-write.wast' },
    { relPath: 'async/empty-wait.wast' },
    { relPath: 'async/zero-length.wast' },
    { relPath: 'async/cancel-subtask.wast' },
    { relPath: 'async/passing-resources.wast' },
    { relPath: 'async/drop-waitable-set.wast' },
    { relPath: 'async/drop-subtask.wast' },

    // Skipped tests
    { relPath: 'async/sync-streams.wast', skip: true },
    { relPath: 'async/deadlock.wast', skip: true },
    { relPath: 'async/trap-if-block-and-sync.wast', skip: true },
    { relPath: 'async/trap-on-reenter.wast', skip: true },
    { relPath: 'async/sync-barges-in.wast', skip: true },
    { relPath: 'async/same-component-stream-future.wast', skip: true },
    { relPath: 'async/dont-block-start.wast', skip: true },
    { relPath: 'async/cross-abi-calls.wast', skip: true },
    { relPath: 'async/closed-stream.wast', skip: true },
    { relPath: 'async/drop-cross-task-borrow.wast', skip: true },
    { relPath: 'async/trap-if-done.wast', skip: true },
    { relPath: 'async/drop-stream.wast', skip: true },
    { relPath: 'async/async-calls-sync.wast', skip: true },
    { relPath: 'async/cancellable.wast', skip: true },
];

// These tests are ported from the component-model repo
//
// see: https://github.com/WebAssembly/component-model/tree/main/test
//
function buildWastFixture(wastPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const fixtureBuild = spawn('cargo', ['xtask', 'build-wast-fixture', wastPath], {
            detached: false,
            stdio: 'inherit',
        });
        fixtureBuild.on('error', reject);
        fixtureBuild.on('close', (code, signal) => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(`WAST fixture build failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`),
                );
            }
        });
    });
}

suite('component-model WAST', () => {
    beforeAll(async () => {
        for (const { relPath, skip } of WAST_TESTS) {
            if (skip) {
                continue;
            }
            const wastPath = join(COMPONENT_MODEL_FIXTURES_WAST_DIR, relPath);
            await buildWastFixture(wastPath);
        }
    });

    for (const { relPath, skip } of WAST_TESTS) {
        const wastPath = join(COMPONENT_MODEL_FIXTURES_WAST_DIR, relPath);
        const wasmPath = wastPath.replace(/\.wast$/, '.wast.wasm');
        const scriptPath = `${wastPath}.js`;

        const t = skip ? test.skip : test.concurrent;
        t(relPath, async () => {
            assert(await fileExists(wasmPath), `missing generated wasm component @ [${wasmPath}]`);
            assert(await fileExists(scriptPath), `missing generated script @ [${scriptPath}]`);

            let cleanup;
            try {
                const setup = await setupAsyncTest({
                    asyncMode: 'jspi',
                    component: {
                        name: basename(relPath).replace('.wast', ''),
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

                const mod = (await import(pathToFileURL(scriptPath).href)) as WastTestModule;
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
