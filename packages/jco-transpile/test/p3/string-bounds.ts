import { join } from 'node:path';
import { expect, test } from 'vitest';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

test.concurrent.each([
    { ptr: 0, len: 0, value: '' },
    { ptr: 65536, len: 0, value: '' },
    { ptr: 16, len: 2, value: 'ok' },
    { ptr: 65537, len: 0, error: 'string pointer/length out of bounds of memory' },
    { ptr: 65535, len: 2, error: 'string pointer/length out of bounds of memory' },
    { ptr: 0xffffffff, len: 1, error: 'string pointer/length out of bounds of memory' },
    { ptr: 8, len: 1, error: 'invalid utf-8' },
    { ptr: 9, len: 1, error: 'incomplete utf-8 byte sequence' },
])('string range ($ptr, $len)', async ({ ptr, len, value, error }) => {
    const { instance, cleanup } = await setupAsyncTest({
        asyncMode: 'jspi',
        component: {
            name: `string-range-${ptr}-${len}`,
            path: join(P3_COMPONENT_FIXTURES_DIR, 'string-bounds/read.wat'),
        },
    });
    try {
        if (error) {
            const failure = await Promise.resolve()
                .then(() => instance.read(ptr, len))
                .then(
                    () => {
                        throw new Error('expected a string trap');
                    },
                    (failure) => failure,
                );
            expect(failure).toBeInstanceOf(WebAssembly.RuntimeError);
            expect(failure.message).toContain(error);
        } else {
            expect(await instance.read(ptr, len)).toBe(value);
        }
    } finally {
        await cleanup();
    }
});

test.concurrent.each([0, 1])('UTF-16 rejects an unaligned pointer with length %i', async (length) => {
    const { instance, cleanup } = await setupAsyncTest({
        component: {
            name: `unaligned-utf16-${length}`,
            path: join(P3_COMPONENT_FIXTURES_DIR, 'string-bounds/read-utf16.wat'),
        },
    });
    try {
        const failure = await Promise.resolve()
            .then(() => instance.read(1, length))
            .then(
                () => {
                    throw new Error('expected an alignment trap');
                },
                (failure) => failure,
            );
        expect(failure).toBeInstanceOf(WebAssembly.RuntimeError);
        expect(failure.message).toContain('unaligned pointer');
    } finally {
        await cleanup();
    }
});
