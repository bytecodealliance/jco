import { join } from 'node:path';

import { suite, test, expect, vi } from 'vitest';

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/post_return.rs
//
suite.skip('post-return scenario', () => {
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
            const res = await buildAndTranspile({ componentPath });
            const instance = res.instance;
            cleanup = res.cleanup;
            await instance['local:local/run'].asyncRun();
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
        const asyncSleepMillis = vi.fn(async (ms) => {
            expect(ms).toStrictEqual(waitTimeMs);
            await new Promise((resolve) => setTimeout(resolve, ms));
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
                            asyncSleepMillis,
                        }
                    }
                },
                transpile: {
                    extraArgs: {
                        minify: false,
                    }
                },
            });
            const instance = res.instance;
            cleanup = res.cleanup;
            console.log("OUTPUT DIR:", res.outputDir);

            const result = await instance['local:local/sleep-post-return'].asyncRun(waitTimeMs);

            // TODO: fix: sleep-post-return is running but *does not* call the import properly,
            // likely because the task is not actually the thing being returned -- the promise is 
            // returning early?

            expect(asyncSleepMillis).toHaveBeenCalled();
        } finally {
            if (cleanup) { await cleanup(); }
        }
    });
});
