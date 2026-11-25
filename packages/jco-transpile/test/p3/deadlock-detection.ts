import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

suite.skipIf(typeof WebAssembly.Suspending !== 'function')('deadlock detection', () => {
    test.concurrent('a stream write waiting for the host to read is not a deadlock', async () => {
        let read!: Promise<number[]>;
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'stream-write-host-reader',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'stream-write-host-reader.wat'),
                imports: {
                    consume: {
                        // Keeps the stream and reads it later, on a timer of its own.
                        default: (stream: AsyncIterable<Uint8Array>) => {
                            read = (async () => {
                                await new Promise((resolve) => setTimeout(resolve, 100));
                                const values: number[] = [];
                                for await (const chunk of stream) {
                                    values.push(...chunk);
                                }
                                return values;
                            })();
                        },
                    },
                },
            },
        });
        try {
            assert.strictEqual(await instance.run(), 1);
            assert.deepEqual(await read, [7]);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a future write waiting for the host to read is not a deadlock', async () => {
        let read!: Promise<unknown>;
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'future-write-host-reader',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'future-write-host-reader.wat'),
                imports: {
                    consume: {
                        // Keeps the future and reads it later, on a timer of its own.
                        default: (future: PromiseLike<unknown>) => {
                            read = (async () => {
                                await new Promise((resolve) => setTimeout(resolve, 100));
                                return await future;
                            })();
                        },
                    },
                },
            },
        });
        try {
            assert.strictEqual(await instance.run(), 0);
            assert.strictEqual(await read, 7);
        } finally {
            await cleanup();
        }
    });
});
