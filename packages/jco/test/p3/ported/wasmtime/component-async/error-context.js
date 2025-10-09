import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { suite, test, assert } from 'vitest';

import { testComponent, composeCallerCallee } from "./common.js";

const COMPONENT_FIXTURES_DIR = fileURLToPath(
    new URL('../../../../fixtures/components', import.meta.url)
);

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
        await testComponent({ componentPath });
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
        await testComponent({ componentPath });
    });
});
