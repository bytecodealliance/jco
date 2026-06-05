import { join } from "node:path";

import { suite, test } from "vitest";

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/yield_.rs
//
suite("yield scenario", () => {
    let WAKER_ID = 0;
    let HOST_THING_ID = 0;
    let THINGS_TABLE = {};

    class HostThing {
        #id;
        #wakers;

        constructor() {
            this.#id = HOST_THING_ID++;
            THINGS_TABLE[this.#id] = this;
        }

        setReady(ready) {
            if (ready) {
                if (!this.#wakers) {
                    throw new Error("wakers not yet set");
                }
                for (const w of this.#wakers) {
                    w.resolve();
                }
            }

            if (!this.#wakers) {
                this.#wakers = [];
            }
        }

        [Symbol.asyncDispose]() {
            delete THINGS_TABLE[this.#id];
        }

        async whenReady() {
            const { promise, resolve } = Promise.withResolvers();
            if (!this.#wakers) {
                return;
            }
            this.#wakers.push({ promise, resolve, id: WAKER_ID++ });
            await Promise.all(this.#wakers.map((w) => w.promise));
        }
    }

    const genYieldRunnerIface = () => {
        let _continue;
        return {
            setContinue(v) {
                _continue = v;
            },

            getContinue() {
                return _continue;
            },
        };
    };

    test.concurrent("synchronous", async () => {
        let cleanup;
        try {
            const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/yield/async-yield-caller.wasm");
            const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/yield/async-yield-callee-synchronous.wasm");
            const componentPath = await composeCallerCallee({
                callerPath,
                calleePath,
            });

            const res = await buildAndTranspile({
                componentPath,
                instantiation: {
                    imports: {
                        "local:local/continue": {
                            ...genYieldRunnerIface(),
                        },
                        "local:local/ready": {
                            Thing: HostThing,
                        },
                    },
                },
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const { instance } = res;
            cleanup = res.cleanup;

            await instance["local:local/run"].run();
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.concurrent("stackless", async () => {
        let cleanup;
        try {
            const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/yield/async-yield-caller.wasm");
            const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/yield/async-yield-callee-stackless.wasm");
            const componentPath = await composeCallerCallee({
                callerPath,
                calleePath,
            });

            const res = await buildAndTranspile({
                componentPath,
                instantiation: {
                    imports: {
                        "local:local/continue": {
                            ...genYieldRunnerIface(),
                        },
                        "local:local/ready": {
                            Thing: HostThing,
                        },
                    },
                },
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const { instance } = res;
            cleanup = res.cleanup;

            await instance["local:local/run"].run();
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip("cancel synchronous", async () => {
        let cleanup;
        try {
            const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/yield/async-yield-caller-cancel.wasm");
            const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/yield/async-yield-callee-synchronous.wasm");
            const componentPath = await composeCallerCallee({
                callerPath,
                calleePath,
            });

            const res = await buildAndTranspile({
                componentPath,
                instantiation: {
                    imports: {
                        "local:local/continue": {
                            ...genYieldRunnerIface(),
                        },
                        "local:local/ready": {
                            Thing: HostThing,
                        },
                    },
                },
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const { instance } = res;
            cleanup = res.cleanup;

            await instance["local:local/run"].run();
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });

    test.skip("cancel stackless", async () => {
        let cleanup;
        try {
            const callerPath = join(COMPONENT_FIXTURES_DIR, "p3/yield/async-yield-caller-cancel.wasm");
            const calleePath = join(COMPONENT_FIXTURES_DIR, "p3/yield/async-yield-callee-stackless.wasm");
            const componentPath = await composeCallerCallee({
                callerPath,
                calleePath,
            });

            const res = await buildAndTranspile({
                componentPath,
                instantiation: {
                    imports: {
                        "local:local/continue": {
                            ...genYieldRunnerIface(),
                        },
                        "local:local/ready": {
                            Thing: HostThing,
                        },
                    },
                },
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     },
                // }
            });
            const { instance } = res;
            cleanup = res.cleanup;

            await instance["local:local/run"].run();
        } finally {
            if (cleanup) {
                await cleanup();
            }
        }
    });
});
