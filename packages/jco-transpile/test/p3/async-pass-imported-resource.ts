import { join } from 'node:path';

import { assert, expect, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

suite('async exports using a type-only resource import', () => {
    test('roundtrips an owned host resource without importing any functions', async () => {
        class Blob {}
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'async-pass-imported-resource',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'async-pass-imported-resource.wat'),
                imports: { 'test:data/blob': { Blob } },
            },
        });
        try {
            for (let i = 0; i < 3; i++) {
                const blob = new Blob();
                assert.strictEqual(await instance.pass(blob), blob);
                assert.strictEqual(await instance.pass(blob), blob);
            }
            await expect(instance.pass({})).rejects.toThrow(/Not a valid .*Blob.* resource/);
        } finally {
            await cleanup();
        }
    });
});
