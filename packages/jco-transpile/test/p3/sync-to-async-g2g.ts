import { join } from 'node:path';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

const EXPORT_NAME = 'jco:test-components/sync-lower-runner';

suite('guest->guest sync-lowered call to async-lifted callee', () => {
    // Regression test for the fused [sync-start] path: a
    // sync-lowered import of an async-lifted export goes through
    // PrepareCall + SyncStartCall, and the SyncStartCall intrinsic must
    // block the caller (JSPI) until the callee resolves via task.return,
    // then return the sync lowering's flat result. Previously an
    // unimplemented stub ('synchronous start call not implemented!').
    test('blocking call returns the callee result across a composition', async () => {
        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'sync-to-async-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'sync-to-async-callee.wasm'),
        });
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'sync-to-async-g2g',
                path: componentPath,
                imports: { ...new WASIShim().getImportObject() },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            },
        });
        try {
            assert.instanceOf(instance[EXPORT_NAME].runCompute, AsyncFunction);
            // compute(13) -> 16 (direct flat result), then
            // compute-list(16) -> [16, 17, 18] (spilled via return pointer),
            // summed by the caller
            assert.strictEqual(await instance[EXPORT_NAME].runCompute(13), 16 + 17 + 18);
        } finally {
            await cleanup();
        }
    });
});
