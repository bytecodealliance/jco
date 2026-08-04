import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest, composeCallerCallee } from '../helpers.js';
import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';

suite('subtask cancellation', () => {
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
});
