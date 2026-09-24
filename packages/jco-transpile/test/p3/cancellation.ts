import { execArgv, execPath } from 'node:process';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest, composeCallerCallee } from '../helpers.js';
import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';

const CANCEL_BEFORE_START_CLEANUP_WAST = fileURLToPath(
    new URL('../fixtures/wast/jco/cancel-before-start-cleanup.wast', import.meta.url),
);

function buildWastFixture(wastPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('cargo', ['xtask', 'build-wast-fixture', wastPath], {
            stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('close', (code, signal) => {
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

function runNodeToNaturalExit(scriptPath: string, timeoutMs = 2_000): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(execPath, ['--no-warnings', ...execArgv, scriptPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));

        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error(`child process did not become idle within ${timeoutMs}ms\n${stdout}${stderr}`));
        }, timeoutMs);

        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on('close', (code, signal) => {
            clearTimeout(timeout);
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(`child exited with ${signal ? `signal ${signal}` : `code ${code}`}\n${stdout}${stderr}`),
                );
            }
        });
    });
}

suite('subtask cancellation', () => {
    beforeAll(async () => {
        await buildWastFixture(CANCEL_BEFORE_START_CLEANUP_WAST);
    });

    // Dropping a pending async import future in a Rust guest lowers to the
    // `subtask.cancel` canonical built-in (wit-bindgen's cooperative
    // cancellation drop path).
    //
    // This previously trapped with "task cancellation has not been requested"
    // because the generated `subtaskCancel` intrinsic applied `task.cancel`'s
    // callee-side guards to the caller's own export task instead of cancelling
    // the subtask identified by the handle operand.
    test('dropping an in-flight host import future cancels the subtask', async () => {
        let pendingCallStarted = false;
        let completedCalled = false;

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'subtask-cancel-drop.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/subtask-cancel-drop-host': {
                        pendingCall: async () => {
                            pendingCallStarted = true;
                            // Never resolves; the guest drops the future while
                            // the call is still in flight
                            await new Promise(() => {});
                        },
                        waitUntilBlocked: async () => {},
                        completed: () => {
                            completedCalled = true;
                        },
                    },
                },
            },
        });

        try {
            await instance['jco:test-components/local-run-async'].run();
            assert.isTrue(pendingCallStarted, 'the pending host import should have been started');
            assert.isTrue(completedCalled, 'guest should complete normally after dropping the in-flight import');
        } finally {
            await cleanup();
        }
    });

    // Guest->guest flavor: the caller drops an in-flight call to another
    // guest, and the cancellation request must be delivered to the callee
    // task, which acknowledges it via the `task.cancel` canonical built-in
    // (exercising the CANCELLED_BEFORE_RETURNED status path). The callee is
    // itself blocked on a pending host import, which is cancelled along the
    // way.
    test('dropping an in-flight guest import future cancels the callee task', async () => {
        let pendingCallStarted = false;
        let completedCalled = false;
        const calleeBlocked = Promise.withResolvers();

        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'subtask-cancel-g2g-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'subtask-cancel-g2g-callee.wasm'),
        });

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/subtask-cancel-drop-host': {
                        pendingCall: async () => {
                            pendingCallStarted = true;
                            calleeBlocked.resolve();
                            // Never resolves; the callee blocks on this until
                            // it is cancelled
                            await new Promise(() => {});
                        },
                        waitUntilBlocked: async () => {
                            await calleeBlocked.promise;
                        },
                        completed: () => {
                            completedCalled = true;
                        },
                    },
                },
            },
        });

        try {
            await instance['jco:test-components/local-run-async'].run();
            assert.isTrue(pendingCallStarted, 'the callee should have started its pending host import');
            assert.isTrue(completedCalled, 'caller should complete normally after cancelling the callee');
        } finally {
            await cleanup();
        }
    });

    // Guest->guest flavor where the call is dropped before the (deferred)
    // callee start has run: the subtask is cancelled while still STARTING,
    // the callee must never run, and the subtask resolves as
    // CANCELLED_BEFORE_STARTED.
    test('dropping a still-starting guest import future cancels before the callee runs', async () => {
        let pendingCallStarted = false;
        let completedCalled = false;

        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'subtask-cancel-g2g-starting-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'subtask-cancel-g2g-callee.wasm'),
        });

        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/subtask-cancel-drop-host': {
                        pendingCall: async () => {
                            pendingCallStarted = true;
                            await new Promise(() => {});
                        },
                        waitUntilBlocked: async () => {},
                        completed: () => {
                            completedCalled = true;
                        },
                    },
                },
            },
        });

        try {
            await instance['jco:test-components/local-run-async'].run();
            assert.isFalse(pendingCallStarted, 'the callee should never have run (cancelled before start)');
            assert.isTrue(completedCalled, 'caller should complete normally after cancelling the starting call');
        } finally {
            await cleanup();
        }
    });

    test('cancelling under persistent backpressure releases the scheduler', async () => {
        const setup = await setupAsyncTest({
            asyncMode: 'jspi',
            jco: { transpile: { extraArgs: { minify: false } } },
            component: {
                path: `${CANCEL_BEFORE_START_CLEANUP_WAST}.wasm`,
                skipInstantiation: true,
            },
        });

        try {
            const runnerPath = join(setup.outputDir, 'cancel-before-start-runner.mjs');
            await writeFile(
                runnerPath,
                [
                    `const { instantiate } = await import(${JSON.stringify(setup.esModuleSourcePathURL.href)});`,
                    'const instance = await instantiate();',
                    'const result = await instance.runPersistent();',
                    'if (result !== 42) throw new Error(`unexpected result [${result}]`);',
                ].join('\n'),
            );
            await runNodeToNaturalExit(runnerPath);
        } finally {
            await setup.cleanup();
        }
    });

    test('cancelling before start retires each callee task', async () => {
        const setup = await setupAsyncTest({
            asyncMode: 'jspi',
            jco: { transpile: { extraArgs: { minify: false } } },
            component: {
                path: `${CANCEL_BEFORE_START_CLEANUP_WAST}.wasm`,
                skipInstantiation: true,
            },
        });
        const taskCountKey = '__jcoCancelBeforeStartLiveTaskCount';
        const testGlobal = globalThis as typeof globalThis & Record<string, () => number>;

        try {
            const source = await readFile(setup.esModuleOutputPath, 'utf8');
            const taskMapDeclaration = 'const ASYNC_TASKS_BY_COMPONENT_IDX = new Map();';
            const instrumented = source.replace(
                taskMapDeclaration,
                `${taskMapDeclaration}\n` +
                    `globalThis.${taskCountKey} = () => ` +
                    'Array.from(ASYNC_TASKS_BY_COMPONENT_IDX.values(), tasks => tasks.length)' +
                    '.reduce((total, count) => total + count, 0);',
            );
            assert.notEqual(instrumented, source, 'failed to install the runtime task-count probe');
            await writeFile(setup.esModuleOutputPath, instrumented);

            const instrumentedUrl = new URL(setup.esModuleSourcePathURL);
            instrumentedUrl.searchParams.set('task-cleanup-probe', String(Date.now()));
            const { instantiate } = await import(instrumentedUrl.href);
            const instance = await instantiate();

            for (let i = 0; i < 3; i++) {
                assert.equal(await instance.runRelease(), 42);
            }
            await new Promise((resolve) => setTimeout(resolve, 20));

            assert.equal(testGlobal[taskCountKey](), 0);
        } finally {
            delete testGlobal[taskCountKey];
            await setup.cleanup();
        }
    });
});
