import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';

import { suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR, createReadableStreamFromValues } from '../common.js';

// Regression coverage for the "lower" side of
// https://github.com/bytecodealliance/jco/issues/1601: the `stream`/`future`
// return value of an async host import is lowered by the async
// return-handling machinery (i.e. `task.resolve`); it must not *also* be
// lowered inline, which consumes/locks the host value (e.g. `TypeError:
// ReadableStream is locked`) before the real lowering runs.
suite('async host import stream/future results', () => {
    async function setup() {
        return await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'return-host-async-value.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    // A host adapter in the style of `CompressionStream`: the
                    // incoming (lowered) stream is driven by the host, and a
                    // brand new host `ReadableStream` is returned.
                    compress: {
                        default: async (data) => {
                            return new ReadableStream({
                                async start(ctrl) {
                                    for await (const chunk of data) {
                                        ctrl.enqueue(chunk);
                                    }
                                    ctrl.close();
                                },
                            });
                        },
                    },
                    delay: {
                        default: async (f) => {
                            const v = await f;
                            return (async () => v)();
                        },
                    },
                },
            },
        });
    }

    test.concurrent('import result stream returned directly by an export', async () => {
        const { instance, cleanup } = await setup();
        try {
            assert.instanceOf(instance.compressPassthrough, AsyncFunction);

            const vals = [1, 2, 3, 255];
            const stream = await Promise.race([
                instance.compressPassthrough(createReadableStreamFromValues(vals)),
                new Promise((_, reject) => setTimeout(() => reject(new Error('export call timed out')), 5_000)),
            ]);

            const returnedVals = [];
            for await (const chunk of stream) {
                returnedVals.push(...chunk);
            }
            assert.deepEqual(returnedVals, vals);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('import result stream read by the guest', async () => {
        const { instance, cleanup } = await setup();
        try {
            assert.instanceOf(instance.compressCollect, AsyncFunction);

            const vals = [4, 5, 6];
            const returnedVals = await Promise.race([
                instance.compressCollect(createReadableStreamFromValues(vals)),
                new Promise((_, reject) => setTimeout(() => reject(new Error('export call timed out')), 5_000)),
            ]);
            assert.deepEqual(returnedVals, new Uint8Array(vals));
        } finally {
            await cleanup();
        }
    });

    test.concurrent('import result future read by the guest', async () => {
        const { instance, cleanup } = await setup();
        try {
            assert.instanceOf(instance.delayRoundtrip, AsyncFunction);

            const returned = await Promise.race([
                instance.delayRoundtrip(42),
                new Promise((_, reject) => setTimeout(() => reject(new Error('export call timed out')), 5_000)),
            ]);
            assert.strictEqual(returned, 42);
        } finally {
            await cleanup();
        }
    });
});
