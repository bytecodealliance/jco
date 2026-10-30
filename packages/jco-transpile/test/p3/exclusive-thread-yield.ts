import { join } from 'node:path';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

suite('exclusive task lock during core thread.yield', () => {
    test.concurrent.each(['run', 'callbackRun'])('%s serializes concurrent calls across the yield', async (name) => {
        const progress: number[] = [];
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: `exclusive-yield-${name}`,
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'exclusive-thread-yield.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    progress: { default: (value: number) => progress.push(value) },
                },
            },
            jco: { transpile: { extraArgs: { asyncExports: ['run', 'callback-run'] } } },
        });
        try {
            await Promise.all([instance[name](1), instance[name](2)]);
            assert.deepEqual(progress, [10, 11, 20, 21]);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a sync-typed call can resume a parked callback', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'exclusive-yield-sync-callback',
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'exclusive-thread-yield.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    progress: { default: () => {} },
                },
            },
        });
        try {
            assert.equal(await instance.parkCallback(), 1);
            assert.equal(await instance.resumeCallback(), 42);
        } finally {
            await cleanup();
        }
    });
});
