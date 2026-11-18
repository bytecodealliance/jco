import { expect, test, vi } from 'vitest';
import * as stream from '../src/intrinsics/stream.js';
import { create, guestOptions } from './stream-helpers.js';
import type { createPair } from './stream-helpers.js';

/**
 * Reads `u32` elements the way a guest does, with a canonical `stream.read`,
 * waiting for the event of a read that blocks.
 *
 * @param s - a store whose stream has its ends in table 2 of component 0
 * @param count - the most elements to read
 * @returns the elements the read copied into the guest's memory
 */
async function guestRead(s: ReturnType<typeof createPair>, count: number): Promise<number[]> {
    const memory = { buffer: new ArrayBuffer(count * 4) };
    let packed = stream.streamRead(s.operations().readable, guestOptions(memory), s.readIdx, 0, count) as number;
    if (packed === 0xffffffff) {
        await s.read.waitForPendingEvent();
        packed = s.read.getPendingEvent()!.payload1;
    }
    return Array.from({ length: packed >> 4 }, (_, i) => new DataView(memory.buffer).getUint32(i * 4, true));
}

test.concurrent('queued chunks survive partial reads and repeated prepends without copying tails', () => {
    const s = create();
    const queue = new s.PendingValueQueue(() => ({ done: true, value: undefined }), { isNumeric: true, align32: 1 });
    for (let i = 0; i < 4096; i++) {
        queue.push([i]);
    }
    const first: unknown[] = [];
    expect(queue.drainInto(first, 2049)).toBe(2049);
    expect(first).toEqual(Array.from({ length: 2049 }, (_, i) => i));
    queue.prepend([7, 8]);
    queue.prepend([5, 6]);
    const second: unknown[] = [];
    queue.drainInto(second, 3);
    expect(second).toEqual([5, 6, 7]);
    queue.prepend([0]);
    const rest: unknown[] = [];
    queue.drainInto(rest, 5000);
    expect(rest).toEqual([0, 8, ...Array.from({ length: 2047 }, (_, i) => i + 2049)]);
    expect(queue.length).toBe(0);
    queue.push(new Uint8Array([1, 2]));
    queue.drainInto([], 1);
    queue.prepend([3]);
    const tail: unknown[] = [];
    queue.drainInto(tail, 3);
    expect(tail).toEqual([3, 2]);
});

test.concurrent('ready reads avoid promises while the public API coalesces reads', async () => {
    const s = create();
    let calls = 0;
    const queue = new s.PendingValueQueue(() => ({ done: false, value: ++calls }), { align32: 1 });
    expect(queue.readSourceOrPromise!()).toBe(1);
    expect(queue.length).toBe(1);
    const first = queue.readSource();
    const second = queue.readSource();
    expect(first).toBeInstanceOf(Promise);
    expect(calls).toBe(2);
    expect(await first).toBe(1);
    expect(await second).toBe(1);
    const error = new Error('read failed');
    const failing = new s.PendingValueQueue(
        () => {
            throw error;
        },
        { align32: 1 },
    );
    await expect(failing.readSource()).rejects.toBe(error);
    expect(() => failing.readSourceOrPromise!()).toThrow(error);
});

test.concurrent('large synchronous streams yield between bounded batches', async () => {
    const { createPair, dropPair } = await import('./stream-helpers.js');
    const { genStreamHostInjectFn } = await import('../src/intrinsics/stream/injection.js');
    const s = createPair();
    let calls = 0;
    const readFn = Object.assign(() => ({ value: ++calls, done: false }), { sourceIsSync: true });
    s.read.setHostInjectFn(
        genStreamHostInjectFn(s.lower.injection, {
            readFn,
            hostWriteEnd: s.write,
            readEnd: s.read,
        }),
    );
    try {
        const pending = guestRead(s, 256);
        const observed = await new Promise<number>((resolve) => setImmediate(() => resolve(calls)));
        expect(observed).toBeGreaterThan(0);
        expect(observed).toBeLessThan(256);
        expect(await pending).toEqual(Array.from({ length: 256 }, (_, i) => i + 1));
    } finally {
        dropPair(s.pair);
    }
});

test.concurrent('a host read of a large synchronous stream yields between bounded batches', async () => {
    const { createPair, dropPair } = await import('./stream-helpers.js');
    const { genStreamHostInjectFn } = await import('../src/intrinsics/stream/injection.js');
    const s = createPair();
    let calls = 0;
    const readFn = Object.assign(() => ({ value: ++calls, done: false }), { sourceIsSync: true });
    s.read.setHostInjectFn(
        genStreamHostInjectFn(s.lower.injection, {
            readFn,
            hostWriteEnd: s.write,
            readEnd: s.read,
        }),
    );
    try {
        const pending = s.read.read(256);
        const observed = await new Promise<number>((resolve) => setImmediate(() => resolve(calls)));
        expect(observed).toBeGreaterThan(0);
        expect(observed).toBeLessThan(256);
        expect((await pending).value).toEqual(Array.from({ length: 256 }, (_, i) => i + 1));
    } finally {
        dropPair(s.pair);
    }
});

test.concurrent('bytes are taken from a chunk that can serve the read alone', () => {
    const s = create();
    const queue = new s.PendingValueQueue(() => ({ done: true, value: undefined }), { isNumeric: true, align32: 1 });
    const source = new Uint8Array([1, 2, 3, 4, 5]);
    queue.push(source);
    queue.push([6, 7]);
    queue.push(new Uint8Array([8]));

    const head = queue.takeBytes!(2, false)!;
    expect(head).toEqual(new Uint8Array([1, 2]));
    expect(head.buffer).not.toBe(source.buffer);
    // The rest of the chunk is short of the count, and a short read ends with the chunk.
    expect(queue.takeBytes!(4, false)).toBeUndefined();
    expect(queue.takeBytes!(4, true)).toEqual(new Uint8Array([3, 4, 5]));
    // A chunk of values is not taken as bytes.
    expect(queue.takeBytes!(1, true)).toBeUndefined();
    queue.drainInto([], 2);
    expect(queue.takeBytes!(4, false)).toBeUndefined();
    expect(queue.takeBytes!(4, true)).toEqual(new Uint8Array([8]));
    expect(queue.length).toBe(0);
    expect(queue.takeBytes!(1, true)).toBeUndefined();
});

test.concurrent('cancelling at a batch boundary delivers buffered values in source order', async () => {
    const { createPair, dropPair } = await import('./stream-helpers.js');
    const { genStreamHostInjectFn } = await import('../src/intrinsics/stream/injection.js');
    const s = createPair();
    let cancel: (() => boolean) | undefined;
    const original = s.read.setHostCancelFn!.bind(s.read);
    vi.spyOn(s.read, 'setHostCancelFn').mockImplementation((fn) => {
        cancel = fn;
        original(fn);
    });
    let calls = 0;
    const readFn = Object.assign(
        () => {
            if (++calls === 64) {
                queueMicrotask(() => expect(cancel!()).toBe(true));
            }
            return { value: calls, done: false };
        },
        { sourceIsSync: true },
    );
    s.read.setHostInjectFn(
        genStreamHostInjectFn(s.lower.injection, {
            readFn,
            hostWriteEnd: s.write,
            readEnd: s.read,
        }),
    );
    try {
        expect(await guestRead(s, 256)).toEqual(Array.from({ length: 64 }, (_, i) => i + 1));
        // Let the interrupted injection finish before starting another read.
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(await guestRead(s, 4)).toEqual([65, 66, 67, 68]);
    } finally {
        dropPair(s.pair);
    }
});

test.concurrent('prepending snapshots an already partially consumed input chunk', () => {
    const s = create();
    const queue = new s.PendingValueQueue(() => ({ done: true, value: undefined }), { align32: 1 });
    const original = [1, 2, 3];
    queue.push(original);
    queue.drainInto([], 1);
    queue.prepend([0]);
    original[1] = 99;
    const result: unknown[] = [];
    queue.drainInto(result, 3);
    expect(result).toEqual([0, 2, 3]);
});
