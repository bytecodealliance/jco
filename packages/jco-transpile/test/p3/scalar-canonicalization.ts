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

        test.concurrent.each([
            { validLiftingOptimization: false, flagsAsBigInt: false },
            { validLiftingOptimization: false, flagsAsBigInt: true },
            { validLiftingOptimization: true, flagsAsBigInt: false },
            { validLiftingOptimization: true, flagsAsBigInt: true },
        ])('ignores unused flag bits with $validLiftingOptimization and bigint=$flagsAsBigInt', async (options) => {
            const { instance, cleanup } = await setupAsyncTest({
                component: {
                    name: `flag-canonicalization-${options.validLiftingOptimization}-${options.flagsAsBigInt}`,
                    path: join(P3_COMPONENT_FIXTURES_DIR, 'scalar-canonicalization/flags.wat'),
                },
                jco: { transpile: { extraArgs: options } },
            });
            try {
                expect(await instance.junk()).toEqual(
                    options.flagsAsBigInt
                        ? 0x111n
                        : {
                              a: true,
                              b: false,
                              c: false,
                              d: false,
                              e: true,
                              f: false,
                              g: false,
                              h: false,
                              i: true,
                          },
                );
            } finally {
                await cleanup();
            }
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
