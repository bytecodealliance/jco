import { join } from 'node:path';

import { assert, expect, suite, test } from 'vitest';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { LOCAL_TEST_COMPONENTS_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

suite('synchronous stream copies', () => {
    async function setup() {
        return setupAsyncTest({
            component: {
                name: 'sync-stream-copy',
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'sync-stream-copy.wasm'),
                imports: { ...new WASIShim().getImportObject() },
            },
        });
    }

    test.concurrent('writes to a pending read without suspending', async () => {
        const { instance, cleanup } = await setup();
        try {
            // The export is synchronous and has no WebAssembly.promising wrapper.
            assert.deepEqual(Array.from(instance.run()), [42, 123]);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('traps on a read while the previous read event is pending', async () => {
        const { instance, cleanup } = await setup();
        try {
            assert.throws(() => instance.rereadPending(), /cannot have concurrent operations/);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('traps on a write while the previous write event is pending', async () => {
        const { instance, cleanup } = await setup();
        try {
            // A blocked async write needs an async export to return BLOCKED.
            await expect(instance.rewritePending()).rejects.toThrow(/cannot have concurrent operations/);
        } finally {
            await cleanup();
        }
    });
});
