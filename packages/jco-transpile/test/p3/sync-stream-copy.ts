import { join } from 'node:path';

import { assert, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

suite('synchronous stream copies', () => {
    test.concurrent('writes to a pending read without suspending', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'sync-stream-copy',
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'sync-stream-copy.wasm'),
                imports: { ...new WASIShim().getImportObject() },
            },
        });
        try {
            // The export is synchronous and has no WebAssembly.promising wrapper.
            assert.deepEqual(Array.from(instance.run()), [42, 123]);
        } finally {
            await cleanup();
        }
    });
});
