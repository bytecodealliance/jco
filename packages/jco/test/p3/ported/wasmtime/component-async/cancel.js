import { join } from "node:path";

import { suite, test, beforeAll } from "vitest";

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/yield_.rs
//
suite("cancel scenario", () => {
    let componentPath;

    beforeAll(async () => {
        const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-cancel-caller.wasm");
        const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-cancel-callee.wasm");
        componentPath = await composeCallerCallee({
            callerPath,
            calleePath,
        });
    });

    test.skip("normal", async () => {
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

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip("trap", async () => {
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

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip("cancel transmit", async () => {
        // test_synchronous_transmit
        // https://github.com/bytecodealliance/wasmtime/blob/aa140a1879828e8d595d5400566d2291bdeeb3f9/crates/misc/component-async-tests/tests/scenario/transmit.rs#L910
        const componentPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-cancel-transmit.wasm");
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

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
