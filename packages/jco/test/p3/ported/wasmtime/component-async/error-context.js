import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { suite, test, assert } from 'vitest';

import { testComponent, composeCallerCallee } from "./common.js";

const COMPONENT_FIXTURES_DIR = fileURLToPath(
    new URL('../../../../fixtures/components', import.meta.url)
);

// These tests are ported from upstream wasmtime's component-async-tests
// https://github.com/bytecodealliance/wasmtime/blob/main/crates/misc/component-async-tests/tests/scenario/error_context.rs
suite('error-context scenario', () => {
    test('single-component', async () => {
        const componentPath = join(
            COMPONENT_FIXTURES_DIR,
            'p3/error-context/async_error_context.component.wasm'
        );
        await testComponent({ componentPath });
    });
});
