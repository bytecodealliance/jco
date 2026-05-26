import { join } from "node:path";

import { suite, test } from "vitest";

import { buildAndTranspile, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/round_trip_direct.rs
//
suite("round-trip scenario", () => {
    test.skip("direct stackless", async () => {
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath: join(COMPONENT_FIXTURES_DIR, "p3/round-trip/async-round-trip-direct-stackless.wasm"),
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

    test.skip("many stackless", async () => {
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath: join(COMPONENT_FIXTURES_DIR, "p3/round-trip/async-round-trip-many-stackless.wasm"),
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

    test.skip("many synchronous", async () => {
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath: join(COMPONENT_FIXTURES_DIR, "p3/round-trip/async-round-trip-many-synchronous.wasm"),
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

    test.skip("many wait", async () => {
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath: join(COMPONENT_FIXTURES_DIR, "p3/round-trip/async-round-trip-many-wait.wasm"),
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

    test.skip("wait", async () => {
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath: join(COMPONENT_FIXTURES_DIR, "p3/round-trip/async-round-trip-wait.wasm"),
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

    test.skip("stackless sync import", async () => {
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath: join(
                    COMPONENT_FIXTURES_DIR,
                    "p3/round-trip/async-round-trip-stackless-sync-import.wasm",
                ),
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

    test.skip("indirect stackless", async () => {
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath: join(COMPONENT_FIXTURES_DIR, "p3/round-trip/async-round-trip-stackless.wasm"),
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

    test.skip("synchronous", async () => {
        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath: join(COMPONENT_FIXTURES_DIR, "p3/round-trip/async-round-trip-synchronous.wasm"),
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
