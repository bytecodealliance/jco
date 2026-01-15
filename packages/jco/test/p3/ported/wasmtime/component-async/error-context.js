import { join } from 'node:path';

import { suite, test } from 'vitest';

import { buildAndTranspile, composeCallerCallee, COMPONENT_FIXTURES_DIR } from "./common.js";

// These tests are ported from upstream wasmtime's component-async-tests
//
// In the upstream wasmtime repo, see:
// wasmtime/crates/misc/component-async-tests/tests/scenario/error_context.rs
//
suite('error-context scenario', () => {
    test('single-component', async () => {
        const componentPath = join(
            COMPONENT_FIXTURES_DIR,
            'p3/error-context/async-error-context.wasm'
        );

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

    test('caller & callee', async () => {
        const callerPath = join(
            COMPONENT_FIXTURES_DIR,
            "p3/error-context/async-error-context-caller.wasm"
        );
        const calleePath = join(
            COMPONENT_FIXTURES_DIR,
            "p3/error-context/async-error-context-callee.wasm"
        );
        const componentPath = await composeCallerCallee({
            callerPath,
            calleePath,
        });

        let cleanup;
        try {
            const res = await buildAndTranspile({
                componentPath,
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            });
            cleanup = res.cleanup;
            const instance = res.instance;

            await instance['local:local/run'].asyncRun();
        } finally {
            if (cleanup) { await cleanup(); }
        }
    });
});
