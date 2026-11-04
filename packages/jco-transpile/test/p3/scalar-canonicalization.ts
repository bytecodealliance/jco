import { join } from 'node:path';
import { assert, expect, test } from 'vitest';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

test.concurrent.each([false, true])(
    'canonical scalar lifting with optimization=%s',
    async (validLiftingOptimization) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: `scalar-canonicalization-${validLiftingOptimization}`,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'scalar-canonicalization/scalars.wat'),
            },
            jco: { transpile: { extraArgs: { validLiftingOptimization } } },
        });
        try {
            assert.equal(await instance.u8(0xf01), 1);
            assert.equal(await instance.s8(0xff), -1);
            assert.equal(await instance.u16(0xffffffff), 0xffff);
            assert.equal(await instance.s16(0xffffffff), -1);
            assert.equal(await instance.bool(2), true);
            assert.equal(await instance.bool(0), false);
            assert.equal(await instance.char(0), '\0');
            assert.equal(await instance.char(0x1f600), '😀');
            // Host-side strict input checking remains separate from guest lifting.
            await expect(async () => instance.u8(-1)).rejects.toBeInstanceOf(TypeError);
        } finally {
            await cleanup();
        }
    },
);
