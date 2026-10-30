import { join } from 'node:path';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

suite('instance thread indices', () => {
    test.concurrent('initialization and completed calls release their thread indices', async () => {
        const progress: number[] = [];
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'thread-indices',
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'thread-indices.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    progress: { default: (value: number) => progress.push(value) },
                },
            },
            jco: { transpile: { extraArgs: { asyncExports: ['run'] } } },
        });
        try {
            for (let i = 0; i < 3; i++) {
                assert.deepEqual(await instance.run(), [1, 2, 0]);
            }
            assert.deepEqual(progress, [42, 42, 42]);
        } finally {
            await cleanup();
        }
    });
});
