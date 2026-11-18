import { expect, suite, test, vi } from 'vitest';
import * as stream from '../src/intrinsics/stream.js';
import { asyncSource, bytes, createLowered, guestOptions, scalar } from './stream-helpers.js';
import type { StreamElementMetadata, StreamReadOptions } from '../src/runtime.js';

const done = { value: undefined, done: true };
const stopped = { code: 'ERR_COMPONENT_STOPPED' };

/** Stream elements with no numeric form, such as strings. */
const opaque: StreamElementMetadata = { align32: 4, size32: 8, payloadTypeName: 'String' };

const chunk = (value: unknown, done = false) => ({ value, done }) as IteratorResult<unknown>;

/**
 * Lowers a host source and has the host read the stream back.
 *
 * @param source - the host source of the stream
 * @param reads - the options of each read, in order
 * @param elemMeta - metadata of the element type
 * @returns the result of each read
 */
async function readBack(
    source: unknown,
    reads: (number | StreamReadOptions | undefined)[],
    elemMeta: StreamElementMetadata = scalar,
) {
    const s = createLowered(source, elemMeta);
    const results = [];
    for (const options of reads) {
        results.push(await s.read.read(options));
    }
    return results;
}

/**
 * A source whose `next` never settles.
 *
 * @returns the source, with the names of the calls it received in `calls`
 */
function silentSource() {
    const calls: string[] = [];
    return {
        calls,
        [Symbol.asyncIterator]() {
            return this;
        },
        next() {
            calls.push('next');
            return new Promise<IteratorResult<unknown>>(() => {});
        },
        async return() {
            calls.push('return');
            return done;
        },
    };
}

suite.concurrent('host reads of a stream lowered from the host', () => {
    test('take the values of the source without a copy through the ends', async () => {
        const s = createLowered(asyncSource(chunk([1, 2, 3]), chunk([4, 5])));
        const copy = vi.spyOn(s.read, 'copy');
        const createBuffer = vi.spyOn(s.core.bufferManager, 'createBuffer');
        expect(await s.read.read(2)).toEqual({ value: [1, 2], done: false });
        // What an asynchronous source has produced is delivered without waiting for more.
        expect(await s.read.read(8)).toEqual({ value: [3], done: false });
        expect(await s.read.read(8)).toEqual({ value: [4, 5], done: false });
        expect(s.read.isIdleState()).toBe(true);
        expect(await s.read.read(8)).toEqual(done);
        expect(await s.read.read(8)).toEqual(done);
        expect(copy).not.toHaveBeenCalled();
        expect(createBuffer).not.toHaveBeenCalled();
        // The ends are left as a copy that reports the end of the stream leaves them.
        expect(s.read.isDoneState()).toBe(true);
        expect(s.read.isPeerDropped()).toBe(true);
        expect(s.read.hasPendingEvent()).toBe(false);
    });

    test('return one value for a count of one and a list of values otherwise', async () => {
        expect(await readBack(asyncSource(chunk('a'), chunk('b')), [undefined, 1, 1], opaque)).toEqual([
            { value: 'a', done: false },
            { value: 'b', done: false },
            done,
        ]);
        expect(await readBack(asyncSource(chunk('a'), chunk(['b', 'c'])), [3, 3, 3], opaque)).toEqual([
            { value: ['a'], done: false },
            // Only numeric elements are written as chunks of them.
            { value: [['b', 'c']], done: false },
            done,
        ]);
        const unit: StreamElementMetadata = { align32: 1, size32: 0, isNone: true, payloadTypeName: 'none' };
        expect(await readBack(asyncSource(chunk('ignored'), chunk(null)), [1, 2, 2], unit)).toEqual([
            { value: null, done: false },
            { value: [null], done: false },
            done,
        ]);
    });

    test('fill the count from a synchronous source', async () => {
        expect(await readBack(new Set(['a', 'b', 'c']), [2, 2, 2], opaque)).toEqual([
            { value: ['a', 'b'], done: false },
            { value: ['c'], done: false },
            done,
        ]);
    });

    test('return bytes as copies of the chunks of the source', async () => {
        const first = new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 4);
        const s = createLowered(
            asyncSource(chunk(first), chunk(Buffer.from([4, 5])), chunk([6, 300]), chunk(new Uint8Array([8]).buffer)),
            bytes,
        );
        const head = await s.read.read(2);
        expect(head).toEqual({ value: new Uint8Array([1, 2]), done: false });
        (head.value as Uint8Array)[0] = 99;
        expect(Array.from(first)).toEqual([1, 2, 3]);
        expect(await s.read.read(64)).toEqual({ value: new Uint8Array([3]), done: false });
        const whole = await s.read.read(64);
        expect(whole).toEqual({ value: new Uint8Array([4, 5]), done: false });
        expect(Object.getPrototypeOf(whole.value)).toBe(Uint8Array.prototype);
        // A chunk that is not a byte array holds values, which convert as an array of them does.
        expect(await s.read.read(64)).toEqual({ value: new Uint8Array([6, 44]), done: false });
        expect(await s.read.read(64)).toEqual({ value: new Uint8Array([8]), done: false });
        expect(await s.read.read(64)).toEqual(done);
    });

    test('of a stream that names no typed array return bytes as the source gave them', async () => {
        const untyped: StreamElementMetadata = { ...bytes, typedArray: undefined };
        const first = new Uint8Array([1, 2, 3]);
        const source = asyncSource(
            chunk(first),
            chunk([4, 5]),
            chunk(6),
            chunk(new Uint8Array([7, 8]).buffer),
            chunk(Buffer.from([9])),
        );
        const s = createLowered(source, untyped);

        // A byte array is read as copies of its bytes, whatever the count.
        const head = await s.read.read();
        expect(head).toEqual({ value: new Uint8Array([1]), done: false });
        (head.value as Uint8Array)[0] = 99;
        expect(Array.from(first)).toEqual([1, 2, 3]);
        expect(await s.read.read(64)).toEqual({ value: new Uint8Array([2, 3]), done: false });

        // Values are read as values: one for a count of one, and a list of them otherwise.
        expect(await s.read.read()).toEqual({ value: 4, done: false });
        expect(await s.read.read(64)).toEqual({ value: [5], done: false });
        expect(await s.read.read(64)).toEqual({ value: [6], done: false });

        const fromBuffer = await s.read.read(64);
        expect(fromBuffer).toEqual({ value: new Uint8Array([7, 8]), done: false });
        const fromNodeBuffer = await s.read.read(64);
        expect(fromNodeBuffer).toEqual({ value: new Uint8Array([9]), done: false });
        expect(Object.getPrototypeOf(fromNodeBuffer.value)).toBe(Uint8Array.prototype);
        expect(await s.read.read(64)).toEqual(done);

        // A byte array given for elements that are not bytes holds values.
        expect(await readBack(asyncSource(chunk(new Uint8Array([1, 2]))), [8])).toEqual([
            { value: [1, 2], done: false },
        ]);
    });

    test('of a stream that names no typed array end with a byte chunk of a synchronous source', async () => {
        const untyped: StreamElementMetadata = { ...bytes, typedArray: undefined };
        expect(await readBack([new Uint8Array([1, 2]), new Uint8Array([3]), [4, 5]], [8, 8, 8, 8], untyped)).toEqual([
            { value: new Uint8Array([1, 2]), done: false },
            { value: new Uint8Array([3]), done: false },
            { value: [4, 5], done: false },
            done,
        ]);
    });

    test('deliver all of a final chunk, and wait past empty ones', async () => {
        expect(await readBack(asyncSource(chunk([1, 2, 3], true)), [2, 2, 2])).toEqual([
            { value: [1, 2], done: false },
            { value: [3], done: false },
            done,
        ]);
        expect(await readBack(asyncSource(chunk([]), chunk(undefined), chunk([7])), [1, 1])).toEqual([
            { value: 7, done: false },
            done,
        ]);
        expect(await readBack(asyncSource(), [1, 1])).toEqual([done, done]);
    });

    test('of zero length report readiness without consuming values', async () => {
        const probe = { count: 0, rejectLength: 0 };
        expect(await readBack(asyncSource(chunk([]), chunk([1, 2])), [probe, probe, 1, probe, 8, probe, 8])).toEqual([
            done,
            done,
            { value: 1, done: false },
            done,
            { value: [2], done: false },
            done,
            done,
        ]);
    });

    test('that exceed a reject length end the stream and report the length', async () => {
        expect(
            await readBack(asyncSource(chunk([1, 2, 3]), chunk([4, 5, 6, 7])), [
                { count: 8, rejectLength: 3 },
                { count: 8, rejectLength: 3 },
                8,
            ]),
        ).toEqual([{ value: [1, 2, 3], done: false }, { ...done, rejectedLength: 4 }, done]);
    });

    test('that drop after the copy end the stream with their values', async () => {
        const s = createLowered(asyncSource(chunk([1, 2, 3])));
        expect(await s.read.read({ count: 2, dropAfterCopy: true })).toEqual({ value: [1, 2], done: false });
        expect(await s.read.read(2)).toEqual(done);
        expect(s.read.isDoneState()).toBe(true);
    });

    test('are served in the order they were issued', async () => {
        const s = createLowered(asyncSource(chunk([1, 2, 3]), chunk([4])));
        const reads = [s.read.read(2), s.read.read(2), s.read.read(2), s.read.read(2)];
        expect(await Promise.all(reads)).toEqual([
            { value: [1, 2], done: false },
            { value: [3], done: false },
            { value: [4], done: false },
            done,
        ]);
    });

    test('follow the values a guest read left queued, and keep the end busy for the guest', async () => {
        const s = createLowered(asyncSource(chunk([1, 2, 3, 4]), chunk([5])));
        const ops = s.operations();
        const memory = { buffer: new ArrayBuffer(16) },
            opts = guestOptions(memory);
        expect(stream.streamRead(ops.readable, opts, s.index, 0, 2)).toBe(0xffffffff);
        await s.read.waitForPendingEvent();
        expect(s.read.getPendingEvent()!.payload1 >> 4).toBe(2);
        expect([0, 4].map((offset) => new DataView(memory.buffer).getUint32(offset, true))).toEqual([1, 2]);

        const copy = vi.spyOn(s.read, 'copy');
        expect(await s.read.read(8)).toEqual({ value: [3, 4], done: false });
        expect(copy).not.toHaveBeenCalled();
        const pending = s.read.read(8);
        expect(() => stream.streamRead(ops.readable, opts, s.index, 0, 1)).toThrow(/concurrent operations/);
        expect(await pending).toEqual({ value: [5], done: false });
        expect(await s.read.read(8)).toEqual(done);
    });

    test('pending on the source end when the stream is dropped', async () => {
        const source = silentSource();
        const s = createLowered(source);
        const pending = s.read.read();
        await Promise.resolve();
        s.read.drop({ allowPendingEvent: true });
        expect(await pending).toEqual(done);
        expect(await s.read.read()).toEqual(done);
        expect(source.calls).toEqual(['next', 'return']);
    });

    test('pending on the source, and every later read, report that the instance stopped', async () => {
        const source = silentSource();
        const s = createLowered(source);
        const pending = s.read.read();
        await Promise.resolve();
        s.stopInstance();
        await expect(pending).rejects.toMatchObject(stopped);
        await expect(s.read.read()).rejects.toMatchObject(stopped);
        expect(source.calls).toEqual(['next', 'return']);

        // A stream that ended before the stop still ends normally.
        const ended = createLowered(asyncSource(chunk(1)));
        expect(await ended.read.read()).toEqual({ value: 1, done: false });
        expect(await ended.read.read()).toEqual(done);
        ended.stopInstance();
        expect(await ended.read.read()).toEqual(done);
    });

    test('reject with the failure of the source, which later reads ask again', async () => {
        let calls = 0;
        const source = {
            [Symbol.asyncIterator]() {
                return this;
            },
            async next() {
                if (++calls === 2) {
                    throw new Error('source failed');
                }
                return chunk(calls);
            },
        };
        const s = createLowered(source);
        expect(await s.read.read()).toEqual({ value: 1, done: false });
        await expect(s.read.read()).rejects.toThrow('source failed');
        expect(s.read.isIdleState()).toBe(true);
        expect(await s.read.read()).toEqual({ value: 3, done: false });
        s.read.drop();
    });

    test('through a lifted stream iterate the values and drop the source on return', async () => {
        const source = asyncSource(chunk([1, 2]), chunk([3]));
        const s = createLowered(source);
        const lifted = new s.Stream({
            globalRep: s.read.globalStreamMapRep()!,
            isReadable: true,
            isWritable: false,
            readFn: (options) => s.read.read(options),
            dropFn: () => s.read.drop({ allowPendingEvent: true }),
        });
        const values = [];
        for await (const value of lifted as unknown as AsyncIterable<unknown>) {
            values.push(value);
            if (values.length === 2) {
                break;
            }
        }
        expect(values).toEqual([1, 2]);
        expect(source.calls).toEqual(['next', 'return']);
        expect(s.read.isDropped()).toBe(true);
    });
});
