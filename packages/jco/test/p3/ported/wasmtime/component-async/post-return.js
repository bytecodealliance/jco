import { join } from 'node:path';

import { suite, test, expect, vi } from 'vitest';

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/post_return.rs
//
suite('post-return scenario', () => {
    test('caller & callee', async () => {
        const callerPath = join(
            COMPONENT_FIXTURES_DIR,
            "p3/general/async-post-return-caller.wasm"
        );
        const calleePath = join(
            COMPONENT_FIXTURES_DIR,
            "p3/general/async-post-return-callee.wasm"
        );
        const componentPath = await composeCallerCallee({
            callerPath,
            calleePath,
        });

        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                // transpile: {
                //     extraArgs: {
                //         minify: false,
                //     }
                // },
            });
            const instance = res.instance;
            cleanup = res.cleanup;
            await instance['local:local/run'].run();
        } finally {
            if (cleanup) { await cleanup(); }
        }
    });
});

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/post_return.rs
//
suite('post-return async sleep scenario', () => {
    test('callee', async () => {
        const componentPath = join(
            COMPONENT_FIXTURES_DIR,
            "p3/general/async-sleep-post-return-callee.wasm"
        );

        const waitTimeMs = 300;
        const sleepMillis = vi.fn(async (ms) => {
            // NOTE: as written, the caller/callee manipulate (double) the original wait time before use
            expect(ms).toStrictEqual(BigInt(waitTimeMs));
            if (ms > BigInt(Number.MAX_SAFE_INTEGER) || ms < BigInt(Number.MIN_SAFE_INTEGER)) {
                throw new Error('wait time value cannot be represented safely as a Number');
            }
            return await new Promise((resolve) => setTimeout(resolve, Number(ms)));
        });

        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                noCleanup: true,
                instantiation: {
                    imports: {
                        'local:local/sleep': {
                            // WIT:
                            //
                            // ```
                            // sleep-millis: async func(time-in-millis: u64);
                            // ```
                            // see: wasmtime/crates/misc/component-async-tests/wit/test.wit
                            sleepMillis,
                        }
                    }
                },
                transpile: {
                    extraArgs: {
                        minify: false,
                        asyncImports: [
                            // Host-provided async imports must be marked as such
                            'local:local/sleep#sleep-millis',
                        ],
                        asyncExports: [
                            // NOTE: Provided by the component, but *does* trigger calling
                            // of the host-provided async improt
                            'local:local/sleep-post-return#run',
                        ],
                    }
                },
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            const result = await instance['local:local/sleep-post-return'].run(waitTimeMs);
            expect(result).toBeUndefined();

            // Although the original async export call has finished, we expect that the spawned task
            // that occurred during it to run to completion (and eventually call the import we provided),
            // in the runtime itself.
            await vi.waitFor(
                () => expect(sleepMillis).toHaveBeenCalled(),
                { timeout: 5_000 },
            );

        } finally {
            if (cleanup) { await cleanup(); }
        }
    });

    test('caller & callee', async () => {
        const callerPath = join(
            COMPONENT_FIXTURES_DIR,
            "p3/general/async-sleep-post-return-caller.wasm"
        );
        const calleePath = join(
            COMPONENT_FIXTURES_DIR,
            "p3/general/async-sleep-post-return-callee.wasm"
        );
        const componentPath = await composeCallerCallee({
            callerPath,
            calleePath,
        });

        const waitTimeMs = 300;
        const sleepMillis = vi.fn(async (ms) => {
            // NOTE: as written, the caller/callee manipulate (double) the original wait time before use
            expect(ms).toStrictEqual(BigInt(waitTimeMs * 2));
            if (ms > BigInt(Number.MAX_SAFE_INTEGER) || ms < BigInt(Number.MIN_SAFE_INTEGER)) {
                throw new Error('wait time value cannot be represented safely as a Number');
            }
            return await new Promise((resolve) => setTimeout(resolve, Number(ms)));
        });

        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                noCleanup: true,
                instantiation: {
                    imports: {
                        'local:local/sleep': {
                            // WIT:
                            //
                            // ```
                            // sleep-millis: async func(time-in-millis: u64);
                            // ```
                            // see: wasmtime/crates/misc/component-async-tests/wit/test.wit
                            sleepMillis,
                        }
                    }
                },
                transpile: {
                    extraArgs: {
                        // minify: false,
                        asyncImports: [
                            // Host-provided async imports must be marked as such
                            'local:local/sleep#sleep-millis',
                        ],
                        asyncExports: [
                            // NOTE: Provided by the component, but *does* trigger calling
                            // of the host-provided async improt
                            'local:local/sleep-post-return#run',
                        ],
                    }
                },
            });
            const instance = res.instance;
            cleanup = res.cleanup;

            const result = await instance['local:local/sleep-post-return'].run(waitTimeMs);
            expect(result).toBeUndefined();

            // Although the original async export call has finished, we expect that the spawned task
            // that occurred during it to run to completion (and eventually call the import we provided),
            // in the runtime itself.
            await vi.waitFor(
                () => expect(sleepMillis).toHaveBeenCalled(),
                { timeout: 5_000 },
            );

        } finally {
            if (cleanup) { await cleanup(); }
        }
    });
});
