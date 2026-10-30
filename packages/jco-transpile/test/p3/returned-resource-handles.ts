import { join } from 'node:path';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

suite('returned resource handle index space', () => {
    test("a returned owned resource shares indices with the caller's waitable sets", async () => {
        const path = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'returned-resource-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'returned-resource-callee.wasm'),
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'returned-resource-handles',
                path,
                imports: { ...new WASIShim().getImportObject() },
            },
        });
        try {
            assert.deepEqual(await instance.run(), [1, 2]);
            assert.deepEqual(await instance.run(), [3, 4]);
        } finally {
            await cleanup();
        }
    });
});
