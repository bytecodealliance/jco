import { join } from 'node:path';
import { assert, test } from 'vitest';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

test.concurrent('core start can call a lowered nested component export', async () => {
    const { instance, cleanup } = await setupAsyncTest({
        asyncMode: 'jspi',
        component: {
            name: 'start-import-context',
            path: join(P3_COMPONENT_FIXTURES_DIR, 'initialization/start-import.wat'),
        },
    });
    try {
        assert.equal(await instance.run(), 42);
    } finally {
        await cleanup();
    }
});
