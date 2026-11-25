import { join } from 'node:path';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR, P3_COMPONENT_FIXTURES_DIR } from '../common.js';
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

    test.concurrent('a task held back by backpressure takes its thread index when it enters', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'thread-index-admission',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'thread-index-admission.wat'),
            },
        });
        try {
            // Back to back: the second call waits for the first to clear
            // backpressure and exit, which frees the first call's index.
            const first = instance.run();
            const second = instance.run();
            const firstIndex = await first;
            assert.isAbove(firstIndex, 0);
            assert.strictEqual(await second, firstIndex);
        } finally {
            await cleanup();
        }
    });
});
