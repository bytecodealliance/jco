import { join } from 'node:path';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

const EXPORT_NAME = 'jco:test-components/stream-transfer-runner';

suite('guest->guest stream transfer', () => {
    // When streams are returned from fused sync guest->guest calls,
    // the callee task's teardown has already cleared the per-component
    // current-task register (`_symmetricSyncGuestCallExit`).
    //
    // This means stream.transfer cannot get its context from that register,
    // and should match the Canonical ABI in being a pure table operation
    // between the source and destination components.
    test('stream in return position across a composition', async () => {
        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-transfer-g2g-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'stream-transfer-g2g-callee.wasm'),
        });
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'stream-transfer-g2g',
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
            assert.instanceOf(instance[EXPORT_NAME].runStreamTransfer, AsyncFunction);
            // callee writes [seed, seed+1, seed+2]; caller sums them
            assert.strictEqual(await instance[EXPORT_NAME].runStreamTransfer(7), 7 + 8 + 9);
        } finally {
            await cleanup();
        }
    });
});
