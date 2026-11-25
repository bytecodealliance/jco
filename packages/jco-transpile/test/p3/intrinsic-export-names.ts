import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

// An export is bound to a local named after it. The names of the intrinsics
// that trampolines call are reserved, so such a local must not shadow one.
suite('exports named after intrinsics', () => {
    test.concurrent('do not replace the intrinsics their trampolines call', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'intrinsic-export-names',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'intrinsic-export-names.wat'),
            },
        });
        try {
            assert.strictEqual(await instance.backpressureInc(), 42);
            assert.strictEqual(await instance.backpressureDec(), 42);
            assert.strictEqual(await instance.getOrCreateAsyncState(), 42);
            assert.strictEqual(await instance.promiseWithResolvers(), 42);
        } finally {
            await cleanup();
        }
    });
});
