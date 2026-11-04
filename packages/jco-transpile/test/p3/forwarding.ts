import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ReadableStream } from 'node:stream/web';

import { assert, beforeAll, expect, suite, test } from 'vitest';

import { setupAsyncTest } from '../helpers.js';

const fixture = fileURLToPath(new URL('../fixtures/wast/jco/forward-host-source.wast', import.meta.url));

suite('forwarding host sources', () => {
    beforeAll(async () => {
        await promisify(execFile)('cargo', ['xtask', 'build-wast-fixture', fixture]);
    }, 600_000);

    test.concurrent('a forwarded stream retains its lazy host source', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { name: 'forward-host-stream', path: `${fixture}.wasm` },
        });
        try {
            const source = new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint32Array([11, 22, 33]));
                    controller.close();
                },
            });
            const stream = instance.forwardStream(source);
            const values: number[] = [];
            for await (const chunk of stream) {
                values.push(...chunk);
            }
            assert.deepEqual(values, [11, 22, 33]);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('an invalid high-bit handle cannot alias a live endpoint', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { name: 'forward-invalid-handle', path: `${fixture}.wasm` },
        });
        try {
            await expect(async () => instance.invalidSource(0x8000_0001)).rejects.toThrow(
                'unknown handle index 2147483649',
            );
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a forwarded future retains its lazy host source', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: { name: 'forward-host-future', path: `${fixture}.wasm` },
        });
        try {
            assert.equal(await instance.forwardFuture(Promise.resolve(42)), 42);
        } finally {
            await cleanup();
        }
    });
});
