import { join } from "node:path";

import { suite, test, assert, beforeAll } from "vitest";

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/borrowing.rs
//
suite("borrowing scenario", () => {
    let componentPath;

    beforeAll(async () => {
        const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-borrowing-caller.wasm");
        const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-borrowing-callee.wasm");
        componentPath = await composeCallerCallee({
            callerPath,
            calleePath,
        });
    });

    test("caller & callee", async () => {
        let calls = 0;
        let cleanup;
        let instance;
        try {
            const res = await buildAndTranspile({
                componentPath,
                instantiation: {
                    imports: {
                        "local:local/borrowing-types": {
                            X: class XResource {
                                foo() {
                                    calls += 1;
                                }
                            },
                        },
                    },
                },
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            instance = res.instance;
            cleanup = res.cleanup;

            await instance["local:local/run-bool"].run(false);
            assert.strictEqual(calls, 1, "XResource#foo() was called once");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test("caller & callee misbehave", async () => {
        let calls = 0;

        let cleanup;
        let instance;
        try {
            const res = await buildAndTranspile({
                componentPath,
                instantiation: {
                    imports: {
                        "local:local/borrowing-types": {
                            X: class XResource {
                                foo() {
                                    calls += 1;
                                }
                            },
                        },
                    },
                },
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            instance = res.instance;
            cleanup = res.cleanup;

            // Check failure case
            try {
                // the line below calls foo() twice, via the callee (the callee will misbehave)
                await instance["local:local/run-bool"].run(true);
                assert.fail("should have failed");
            } catch (err) {
                assert.include(err.message.toLowerCase(), "invalid handle");
            }
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test("callee misbehaves", async () => {
        const componentPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-borrowing-callee.wasm");

        let calls = 0;

        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                instantiation: {
                    imports: {
                        "local:local/borrowing-types": {
                            X: class XResource {
                                foo() {
                                    calls += 1;
                                }
                            },
                        },
                    },
                },
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     }
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            try {
                // the below line calls foo() twice
                await instance["local:local/run-bool"].run(true);
                assert.fail("should have failed");
            } catch (err) {
                assert.include(err.message.toLowerCase(), "invalid handle");
            }
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test("callee", async () => {
        const componentPath = join(COMPONENT_FIXTURES_DIR, "p3/general/async-borrowing-callee.wasm");

        let calls = 0;

        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                instantiation: {
                    imports: {
                        "local:local/borrowing-types": {
                            X: class XResource {
                                foo() {
                                    calls += 1;
                                }
                            },
                        },
                    },
                },
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     }
                // }
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            await instance["local:local/run-bool"].run(false);
            assert(calls == 1, "XResource#foo() was called 3 times");
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
