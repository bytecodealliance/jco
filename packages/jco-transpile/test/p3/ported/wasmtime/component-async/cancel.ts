import { join } from 'node:path';

import { suite, test, beforeAll } from 'vitest';

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from './common.js';

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/transmit.rs
// (`test_cancel` / `test_cancel_trap`)
//
// NOTE: these remain skipped because the `async-cancel-caller` fixture is
// hand-rolled ABI code that asserts wasmtime's scheduling model, which jco's
// runtime does not currently provide:
//
// - it expects a freshly async-lowered guest->guest call to already be in the
//   STARTED state (wasmtime eagerly runs the callee up to its first suspension
//   point; jco defers the callee start to a JS task and reports STARTING)
// - it expects an *async* `subtask.cancel` of a zero-delay callee to complete
//   immediately with CANCELLED_BEFORE_RETURNED rather than BLOCKED (wasmtime
//   synchronously resumes the callee fiber once to give it a chance to
//   acknowledge; jco can only resume suspended tasks from the event loop)
//
// The `subtask.cancel`/`task.cancel` semantics themselves (cancellation of
// host and guest callees, CANCELLED_BEFORE_STARTED/CANCELLED_BEFORE_RETURNED
// status paths, `task.cancel` acknowledgement) are covered by
// test/p3/cancellation.ts.
//
suite('cancel scenario', () => {
    let componentPath;

    beforeAll(async () => {
        const callerPath = join(COMPONENT_FIXTURES_DIR, 'p3/cancellation/async-cancel-caller.wasm');
        const calleePath = join(COMPONENT_FIXTURES_DIR, 'p3/cancellation/async-cancel-callee.wasm');
        componentPath = await composeCallerCallee({
            callerPath,
            calleePath,
        });
    });

    test.skip('normal', async () => {
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                // instantiation: {
                //     imports: {
                //         "local:local/borrowing-types": {
                //             X: class XResource {
                //                 foo() {
                //                     calls += 1;
                //                 }
                //             },
                //         },
                //     },
                // },

                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;
            void [instance, cleanup];

            // TODO: await test_cancel(Mode::Normal)
            // TODO: await test_cancel(Mode::LeakTaskAfterCancel)

            throw new Error('not implemented');
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip('trap', async () => {
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                // instantiation: {
                //     imports: {
                //         "local:local/borrowing-types": {
                //             X: class XResource {
                //                 foo() {
                //                     calls += 1;
                //                 }
                //             },
                //         },
                //     },
                // },

                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;
            void [instance, cleanup];

            // await test_cancel_trap(Mode::TrapCancelGuestAfterStartCancelled)
            // await test_cancel_trap(Mode::TrapCancelGuestAfterReturnCancelled)
            // await test_cancel_trap(Mode::TrapCancelGuestAfterReturn)
            // await test_cancel_trap(Mode::TrapCancelHostAfterReturnCancelled)
            // await test_cancel_trap(Mode::TrapCancelHostAfterReturn).await

            throw new Error('not implemented');
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip('cancel transmit', async () => {
        // test_synchronous_transmit
        // https://github.com/bytecodealliance/wasmtime/blob/aa140a1879828e8d595d5400566d2291bdeeb3f9/crates/misc/component-async-tests/tests/scenario/transmit.rs#L910
        const componentPath = join(COMPONENT_FIXTURES_DIR, 'p3/cancellation/async-cancel-transmit.wasm');
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                // instantiation: {
                //     imports: {
                //         "local:local/borrowing-types": {
                //             X: class XResource {
                //                 foo() {
                //                     calls += 1;
                //                 }
                //             },
                //         },
                //     },
                // },

                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;
            void [instance, cleanup];

            throw new Error('not implemented');
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
