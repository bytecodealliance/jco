import { join } from 'node:path';

import { suite, test } from 'vitest';

import { testComponent, composeCallerCallee, COMPONENT_FIXTURES_DIR } from "./common.js";

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
        await testComponent({ componentPath });
    });
});
