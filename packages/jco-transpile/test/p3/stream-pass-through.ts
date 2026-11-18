import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';

import { afterAll, assert, beforeAll, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

// The guest returns the readable end of the stream it is given without reading from it,
// which leaves both ends of the stream with the host.
suite.skipIf(typeof WebAssembly.Suspending !== 'function')('host streams returned unread by a guest', () => {
    let instance;
    let cleanup;

    beforeAll(async () => {
        ({ instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'stream-pass-through',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'streams', 'stream-pass-through.wat'),
            },
        }));
    });

    afterAll(async () => {
        await cleanup?.();
    });

    test('bytes are read back in the chunks of the source', async () => {
        const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array(70_000).fill(7), [8, 9]];
        const output = await instance.passBytes(
            (async function* () {
                yield* chunks;
            })(),
        );

        assert.deepEqual(await output.read(2), { value: [1, 2], done: false });
        assert.deepEqual(await output.read(65_536), { value: [3], done: false });
        assert.deepEqual(await output.read(100_000), { value: Array.from(chunks[1]), done: false });
        assert.deepEqual(await output.read(), { value: 8, done: false });
        assert.deepEqual(await output.read(8), { value: [9], done: false });
        assert.deepEqual(await output.read(8), { value: undefined, done: true });
    });

    test('a web stream of bytes is read back', async () => {
        const output = await instance.passBytes(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array([1, 2]));
                    controller.enqueue(new Uint8Array([3]));
                    controller.close();
                },
            }),
        );
        const received: number[] = [];
        for await (const value of output) {
            received.push(value);
        }
        assert.deepEqual(received, [1, 2, 3]);
    });

    test('values are iterated in order, from synchronous and asynchronous sources', async () => {
        const received: string[] = [];
        for await (const value of await instance.passStrings(['a', 'b', 'c'])) {
            received.push(value);
        }
        assert.deepEqual(received, ['a', 'b', 'c']);

        const output = await instance.passStrings(
            (async function* () {
                yield 'd';
                yield 'e';
            })(),
        );
        assert.deepEqual(await output.read(4), { value: ['d'], done: false });
        assert.deepEqual(await output.read(), { value: 'e', done: false });
        assert.deepEqual(await output.read(), { value: undefined, done: true });
    });

    test('a final chunk longer than a read is delivered in full', async () => {
        let produced = false;
        const output = await instance.passBytes({
            [Symbol.asyncIterator]() {
                return this;
            },
            async next() {
                if (produced) {
                    return { value: undefined, done: true };
                }
                produced = true;
                return { value: new Uint8Array([1, 2, 3]), done: true };
            },
        });
        assert.deepEqual(await output.read(2), { value: [1, 2], done: false });
        assert.deepEqual(await output.read(2), { value: [3], done: false });
        assert.deepEqual(await output.read(2), { value: undefined, done: true });
    });

    test('disposing of the returned stream ends a pending read and the source', async () => {
        const calls: string[] = [];
        const output = await instance.passStrings({
            [Symbol.asyncIterator]() {
                return this;
            },
            next() {
                calls.push('next');
                return new Promise(() => {});
            },
            async return() {
                calls.push('return');
                return { value: undefined, done: true };
            },
        });
        const pending = output.read();
        await Promise.resolve();
        assert.deepEqual(await output.return(), { done: true });
        assert.deepEqual(await pending, { value: undefined, done: true });
        assert.deepEqual(calls, ['next', 'return']);
    });
});
