import { expect, test, vi } from 'vitest';
import { create } from './stream-helpers.js';

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
        const pending = s.read.read(256);
        const observed = await new Promise<number>((resolve) => setImmediate(() => resolve(calls)));
        expect(observed).toBeGreaterThan(0);
        expect(observed).toBeLessThan(256);
        const result = await pending;
        expect(Array.from(result.value as ArrayLike<number>)).toEqual(Array.from({ length: 256 }, (_, i) => i + 1));
    } finally {
        dropPair(s.pair);
    }
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
        const result = await s.read.read(256);
        expect(Array.from(result.value as ArrayLike<number>)).toEqual(Array.from({ length: 64 }, (_, i) => i + 1));
        // Let the interrupted injection finish before starting another read.
        await new Promise<void>((resolve) => setImmediate(resolve));
        const next = await s.read.read(4);
        expect(Array.from(next.value as ArrayLike<number>)).toEqual([65, 66, 67, 68]);
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
