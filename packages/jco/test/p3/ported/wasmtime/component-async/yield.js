import { join } from "node:path";

import { suite, test } from "vitest";

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/yield_.rs
//
suite("yield scenario", () => {
    test.skip("synchronous", async () => {
        let cleanup;
        try {
            const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-yield-caller.wasm");
            const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-yield-callee-synchronous.wasm");
            const componentPath = await composeCallerCallee({
                callerPath,
                calleePath,
            });

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
            const { instance, cleanup } = res;
            void [instance, cleanup];

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip("stackless", async () => {
        let cleanup;
        try {
            const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-yield-caller.wasm");
            const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-yield-callee-stackless.wasm");
            const componentPath = await composeCallerCallee({
                callerPath,
                calleePath,
            });

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
            const { instance, cleanup } = res;
            void [instance, cleanup];

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip("cancel synchronous", async () => {
        let cleanup;
        try {
            const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-yield-caller-cancel.wasm");
            const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-yield-callee-synchronous.wasm");
            const componentPath = await composeCallerCallee({
                callerPath,
                calleePath,
            });

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
            const { instance, cleanup } = res;
            void [instance, cleanup];

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip("cancel stackless", async () => {
        let cleanup;
        try {
            const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-yield-caller-cancel.wasm");
            const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-yield-callee-stackless.wasm");
            const componentPath = await composeCallerCallee({
                callerPath,
                calleePath,
            });

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
            const { instance, cleanup } = res;
            void [instance, cleanup];

            throw new Error("not implemented");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
