import { join } from 'node:path';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

const HOST_INTERFACE = 'jco:test-components/sync-lowered-async-import-host';
const RUNNER_INTERFACE = 'jco:test-components/sync-lowered-async-import-runner';

suite('sync-lowered async host import', () => {
    test('invokes the host and returns its scalar result', async () => {
        let hostCallCount = 0;
        let markHostCalled!: (value: number) => void;
        const hostCalled = new Promise<number>((resolve) => {
            markHostCalled = resolve;
        });
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'sync',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'sync-lowered-async-import.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    [HOST_INTERFACE]: {
                        compute: async (value: number) => {
                            hostCallCount++;
                            markHostCalled(value);
                            return value + 1;
                        },
                    },
                },
            },
        });

        try {
            const run = instance[RUNNER_INTERFACE].run;
            assert.instanceOf(run, AsyncFunction);
            const result = run();
            const hostValue = await Promise.race([
                hostCalled,
                new Promise((_, reject) => setTimeout(() => reject(new Error('export call timed out')), 5_000)),
            ]);
            assert.strictEqual(hostValue, 41);
            assert.strictEqual(hostCallCount, 1);
            assert.strictEqual(await result, 42);
        } finally {
            await cleanup();
        }
    });
});
