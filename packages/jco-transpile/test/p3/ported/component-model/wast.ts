import { join, basename, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { suite, test, assert, expect, beforeAll } from 'vitest';

import { COMPONENT_MODEL_FIXTURES_WAST_DIR } from '../../../common.js';
import { fileExists, readComponentBytes, setupAsyncTest } from '../../../helpers.js';

// Relative paths to component-model WAST tests
interface WastTest {
    relPath: string;
    skip?: boolean;
}

interface WastTestModule {
    wastTestRequiresInstance?: boolean;
    wastTestArtifacts?: readonly WastTestArtifact[];
    runWastTest(args: {
        instance?: object;
        instantiate(artifact: WastTestArtifact): Promise<object>;
        assert: typeof assert;
        expect: typeof expect;
    }): Promise<void>;
}

interface WastTestArtifact {
    path: string;
    kind: 'module' | 'component';
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
    { relPath: 'async/async-calls-sync.wast' },
    { relPath: 'async/cancellable.wast' },
    { relPath: 'async/deadlock.wast' },
    { relPath: 'async/sync-streams.wast' },
    { relPath: 'async/dont-block-start.wast' },
    { relPath: 'async/closed-stream.wast' },
    { relPath: 'async/drop-stream.wast' },
    { relPath: 'async/same-component-stream-future.wast' },

    // Skipped tests
    { relPath: 'async/trap-if-block-and-sync.wast', skip: true },
    { relPath: 'async/trap-on-reenter.wast', skip: true },
    { relPath: 'async/sync-barges-in.wast', skip: true },
    { relPath: 'async/cross-abi-calls.wast', skip: true },
    { relPath: 'async/drop-cross-task-borrow.wast', skip: true },
    { relPath: 'async/trap-if-done.wast', skip: true },
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
            assert(await fileExists(scriptPath), `missing generated script @ [${scriptPath}]`);

            const cleanups: (() => Promise<void>)[] = [];
            try {
                const mod = (await import(pathToFileURL(scriptPath).href)) as WastTestModule;
                const artifacts = mod.wastTestArtifacts ?? [];
                const requiresInstance = mod.wastTestRequiresInstance ?? true;
                const componentName = basename(relPath).replace('.wast', '');
                const artifactInstantiators = new Map<WastTestArtifact, Promise<() => Promise<object>>>();

                let instance;
                if (requiresInstance) {
                    assert(await fileExists(wasmPath), `missing generated wasm component @ [${wasmPath}]`);
                    const setup = await setupAsyncTest({
                        asyncMode: 'jspi',
                        component: {
                            name: componentName,
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
                    cleanups.push(setup.cleanup);
                    instance = setup.instance;
                }

                const artifactPaths = new Map<WastTestArtifact, string>();
                for (const artifact of artifacts) {
                    assert.include(
                        ['module', 'component'],
                        artifact.kind,
                        `invalid artifact kind for ${artifact.path}`,
                    );
                    const artifactPath = join(dirname(wastPath), artifact.path);
                    assert(await fileExists(artifactPath), `missing generated WAT artifact @ [${artifactPath}]`);
                    artifactPaths.set(artifact, artifactPath);
                }

                await mod.runWastTest({
                    instance,
                    instantiate: async (artifact) => {
                        const artifactPath = artifactPaths.get(artifact);
                        assert(artifactPath, 'WAST requested an unknown artifact');

                        let loadInstantiator = artifactInstantiators.get(artifact);
                        if (!loadInstantiator) {
                            loadInstantiator = (async () => {
                                if (artifact.kind === 'module') {
                                    const module = await WebAssembly.compile(await readComponentBytes(artifactPath));
                                    return async () => WebAssembly.instantiate(module, {});
                                }

                                const artifactIdx = artifacts.indexOf(artifact);
                                const setup = await setupAsyncTest({
                                    asyncMode: 'jspi',
                                    component: {
                                        name: `${componentName}-artifact-${artifactIdx}`,
                                        path: artifactPath,
                                        skipInstantiation: true,
                                    },
                                });
                                cleanups.push(setup.cleanup);
                                return async () => setup.esModule.instantiate(undefined, {});
                            })();
                            artifactInstantiators.set(artifact, loadInstantiator);
                        }
                        return (await loadInstantiator)();
                    },
                    assert,
                    expect,
                });
            } finally {
                for (const cleanup of cleanups.reverse()) {
                    await cleanup();
                }
            }
        });
    }
});
