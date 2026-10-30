import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { composeCallerCallee, setupAsyncTest } from '../helpers.js';

suite('guest-to-guest future resource transfer', () => {
    test.concurrent.each([false, true])('transfers ownership with delayed writer = %s', async (delayed) => {
        const dropped: number[] = [];
        const componentPath = await composeCallerCallee({
            callerPath: join(LOCAL_TEST_COMPONENTS_DIR, 'future-resource-caller.wasm'),
            calleePath: join(LOCAL_TEST_COMPONENTS_DIR, 'future-resource-callee.wasm'),
        });
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: `future-resource-${delayed}`,
                path: componentPath,
                imports: {
                    ...new WASIShim().getImportObject(),
                    ready: { default: () => setTimeout(1) },
                    dropped: { default: (value: number) => dropped.push(value) },
                },
            },
            jco: { transpile: { extraArgs: { asyncImports: ['ready'] } } },
        });
        try {
            for (const value of [42, 123]) {
                assert.strictEqual(await instance.run(value, delayed), value);
            }
            assert.deepEqual(dropped, [42, 123]);
        } finally {
            await cleanup();
        }
    });
});
