import { join, basename, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { suite, test, assert, expect, beforeAll, vi } from 'vitest';

import { COMPONENT_MODEL_FIXTURES_WAST_DIR } from '../../../common.js';
import { fileExists, getTmpDir, readComponentBytes, setupAsyncTest } from '../../../helpers.js';
import { resetTableGetCallCount, tableGetCallCount } from '../../../fixtures/custom-runtime/intrinsics/resource.js';
import upstreamManifest from '../../../fixtures/wast/upstream-manifest.json' with { type: 'json' };
import { validate as validateWasm, $init as initBindgen } from '../../../../vendor/js-component-bindgen-component.js';
import type { TranspilationOptions } from '../../../../src/transpile.js';

// Relative paths to component-model WAST tests
interface WastTest {
    relPath: string;
    skip?: string;
    transpile?: TranspilationOptions;
    artifactCases?: readonly {
        index: number;
        exportName: string;
        expected: unknown;
    }[];
}

interface WastTestModule {
    wastTestRequiresInstance?: boolean;
    wastTestArtifacts?: readonly WastTestArtifact[];
    runWastTest(args: {
        instance?: object;
        instantiate(artifact: WastTestArtifact): Promise<object>;
        validate(artifact: WastTestArtifact): Promise<void>;
        assert: typeof assert;
        expect: typeof expect;
    }): Promise<void>;
}

interface WastTestArtifact {
    path: string;
    kind: 'module' | 'component';
}

// Every vendored upstream fixture gets a test entry, including explicit skips.
// Keep exceptions here so importing a fixture cannot silently omit its coverage.
const WAST_OVERRIDES: Record<string, Omit<WastTest, 'relPath'>> = {
    'async/cancel-targeted-resume.wast': {
        // Later artifacts still require additional threading support.
        artifactCases: [0, 1, 2, 3].map((index) => ({ index, exportName: 'run', expected: 42 })),
    },
    'async/reentrance.wast': {
        // Only artifact 8 was added by component-model#723. The remaining
        // artifacts need additional reentrance/threading support.
        artifactCases: [{ index: 8, exportName: 'run', expected: 42 }],
    },
    'async/during-sync-call-blocking-ops.wast': {
        skip: 'blocking waitable operations reject synchronous calls even with a ready helper thread',
    },
    'async/during-sync-call-exclusive-resume.wast': {
        skip: 'exiting the last ready thread reports deadlock instead of the synchronous blocking trap',
    },
    'async/during-sync-call-no-sibling-resume.wast': {
        skip: 'synchronous call scheduling incorrectly resumes a sibling task thread',
    },
    'async/switch-to-ready-callback.wast': {
        skip: 'resume built-ins enter ready callback threads instead of rejecting non-suspended targets',
    },
    'async/trap-if-sync-and-waitable-set.wast': {
        skip: 'synchronous waitable operations do not reject handles belonging to a waitable set',
    },
    'values/post-return.wast': { skip: 'the pinned wast parser does not support stream.forward/future.forward' },
    'resources/handle-table.wast': {
        skip: 'invalid handle diagnostics print signed indices instead of the required unsigned indices',
    },
    'linking/tags.wast': { transpile: { bindgenEnableWasmExnref: true } },
    'linking/unit.wast': {
        skip: 'a nested component start calls a lowered import without current caller thread metadata',
    },
    'validation/instantiation.wast': { transpile: { multiMemory: true } },
    'values/numerics.wast': { skip: 'integer lifting rejects values that should be truncated to the target width' },
    'values/realloc.wast': { skip: 'out-of-bounds realloc reports a DataView error instead of the canonical trap' },
    'values/strings.wast': { skip: 'out-of-bounds strings report typed array errors instead of canonical traps' },
    'async/forward.wast': {
        skip: 'the pinned wast parser does not support stream.forward/future.forward',
    },
    'async/trap-if-block-and-sync.wast': {
        skip: 'requires stackful async support',
    },
};

const WAST_TESTS: readonly WastTest[] = [
    ...upstreamManifest.fixtures.map(({ name }) => ({
        relPath: name,
        ...WAST_OVERRIDES[name],
    })),
    // Jco-specific regression coverage is kept outside the upstream corpus.
    { relPath: '../jco/thread-handle-traps.wast' },
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
    }, 600_000);

    test.each([false, true])('deadlock diagnostics preserve the trap (minify=%s)', async (minify) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'deadlock-detail',
                path: join(COMPONENT_MODEL_FIXTURES_WAST_DIR, 'async/deadlock.wast.wasm'),
            },
            jco: { transpile: { extraArgs: { minify } } },
        });
        try {
            // The fixture deliberately deadlocks. Collecting diagnostics must not
            // throw from the scheduler timer and leave the guest promise pending.
            await expect(instance.f()).rejects.toMatchObject({
                message: 'wasm trap: deadlock detected: event loop cannot make further progress',
                deadlockDetail: {
                    pendingHostOperations: 0,
                    suspendedTasks: expect.arrayContaining([
                        expect.objectContaining({
                            taskID: expect.any(BigInt),
                            componentIdx: expect.any(Number),
                            state: 'initial',
                            rootTaskID: expect.any(BigInt),
                        }),
                    ]),
                    unresolvedRootTaskIDs: expect.arrayContaining([expect.any(BigInt)]),
                },
            });
        } finally {
            await cleanup();
        }
    });

    test.each([false, true])('delayed guest entry is not a deadlock (minify=%s)', async (minify) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'delayed-guest-entry',
                path: join(COMPONENT_MODEL_FIXTURES_WAST_DIR, 'async/sync-streams.wast.wasm'),
            },
            jco: { transpile: { extraArgs: { minify } } },
        });

        // Let the deadlock check run while an asynchronous timer callback is
        // ready but has not started. A busy event loop can expose this gap.
        const realSetTimeout = globalThis.setTimeout;
        let delayedCallbacks = 0;
        const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay, ...args) => {
            if (!delay && fn.constructor.name === 'AsyncFunction') {
                delayedCallbacks++;
                return realSetTimeout(fn, 50, ...args);
            }
            return realSetTimeout(fn, delay, ...args);
        });

        try {
            await expect(instance.run()).resolves.toBe(42);
            expect(delayedCallbacks).toBeGreaterThan(0);
        } finally {
            timer.mockRestore();
            await cleanup();
        }
    });

    for (const { relPath, skip, artifactCases, transpile } of WAST_TESTS) {
        const wastPath = join(COMPONENT_MODEL_FIXTURES_WAST_DIR, relPath);
        const wasmPath = wastPath.replace(/\.wast$/, '.wast.wasm');
        const scriptPath = `${wastPath}.js`;

        const t = skip ? test.skip : test.concurrent;
        t(relPath, async () => {
            assert(await fileExists(scriptPath), `missing generated script @ [${scriptPath}]`);

            const cleanups: (() => Promise<void>)[] = [];
            try {
                const componentName = basename(relPath).replace('.wast', '');
                if (artifactCases) {
                    for (const artifactCase of artifactCases) {
                        const artifactPath =
                            artifactCase.index === 0
                                ? wasmPath
                                : wastPath.replace(/\.wast$/, `.wast.${artifactCase.index}.wasm`);
                        assert(await fileExists(artifactPath), `missing generated WAT artifact @ [${artifactPath}]`);
                        const outputDir = await getTmpDir();
                        const setup = await setupAsyncTest({
                            asyncMode: 'jspi',
                            jco: { transpile: { extraArgs: transpile } },
                            component: {
                                name: `${componentName}-artifact-${artifactCase.index}`,
                                path: artifactPath,
                                outputDir,
                            },
                        });
                        cleanups.push(setup.cleanup);
                        const artifactInstance = setup.instance as Record<string, () => Promise<unknown>>;
                        assert.deepEqual(await artifactInstance[artifactCase.exportName](), artifactCase.expected);
                    }
                    return;
                }

                const instrumentRuntime = relPath === 'async/passing-resources.wast';
                if (instrumentRuntime) {
                    resetTableGetCallCount();
                }
                const cmRuntimeEsModule = instrumentRuntime
                    ? new URL('../../../fixtures/custom-runtime/', import.meta.url).href
                    : undefined;
                const extraArgs = {
                    ...transpile,
                    ...(cmRuntimeEsModule ? { cmRuntimeEsModule } : {}),
                };
                const mod = (await import(pathToFileURL(scriptPath).href)) as WastTestModule;
                const artifacts = mod.wastTestArtifacts ?? [];
                const requiresInstance = mod.wastTestRequiresInstance ?? true;
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
                        jco: { transpile: { extraArgs } },
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

                const loadArtifact = (artifact: WastTestArtifact): Promise<() => Promise<object>> => {
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
                            const outputDir = await getTmpDir();
                            try {
                                const setup = await setupAsyncTest({
                                    asyncMode: 'jspi',
                                    component: {
                                        name: `${componentName}-artifact-${artifactIdx}`,
                                        path: artifactPath,
                                        outputDir,
                                        skipInstantiation: true,
                                    },
                                    jco: { transpile: { extraArgs } },
                                });
                                cleanups.push(setup.cleanup);
                                return async () => setup.esModule.instantiate(undefined, {});
                            } catch (error) {
                                try {
                                    await rm(outputDir, { recursive: true, force: true });
                                } catch {}
                                throw error;
                            }
                        })();
                        artifactInstantiators.set(artifact, loadInstantiator);
                    }
                    return loadInstantiator;
                };

                await mod.runWastTest({
                    instance,
                    instantiate: async (artifact) => (await loadArtifact(artifact))(),
                    validate: async (artifact) => {
                        const artifactPath = artifactPaths.get(artifact);
                        assert(artifactPath, 'WAST requested an unknown artifact');
                        await initBindgen;
                        validateWasm(await readComponentBytes(artifactPath));
                    },
                    assert,
                    expect,
                });
                if (instrumentRuntime) {
                    assert.isAbove(
                        tableGetCallCount,
                        0,
                        'resource.rep should call resource.tableGet on the selected runtime provider',
                    );
                }
            } finally {
                for (const cleanup of cleanups.reverse()) {
                    await cleanup();
                }
            }
        });
    }
});
