import { expect, test } from 'vitest';
import { initializeFutureValueClass } from '../src/intrinsics/future/value.js';
import type { FutureValue } from '../src/runtime.js';

// Awaited<T> recursively unwraps thenables, while this ABI deliberately exposes one layer.
const awaitOne = (value: FutureValue): Promise<unknown> => Promise.resolve(value);

test.concurrent('future values start lazily and share a single settled operation', async () => {
    const FutureValue = initializeFutureValueClass(Symbol.dispose);
    let starts = 0;
    const value = new FutureValue(() => {
        starts++;
        return { value: 42 };
    });
    expect(starts).toBe(0);
    expect(value.then).toBe(value.then);
    const [first, second] = await Promise.all([awaitOne(value), awaitOne(value)]);
    expect([first, second]).toEqual([42, 42]);
    expect(starts).toBe(1);
});

test.concurrent('each await exposes exactly one nested future layer', async () => {
    const FutureValue = initializeFutureValueClass(Symbol.dispose);
    let innerStarts = 0;
    const inner = new FutureValue(() => {
        innerStarts++;
        return { value: 17 };
    });
    const outer = new FutureValue(() => ({ value: inner }));
    const first = await awaitOne(outer);
    expect(first).toBe(inner);
    expect(innerStarts).toBe(0);
    expect(await awaitOne(first as FutureValue)).toBe(17);
    expect(innerStarts).toBe(1);
});

test.concurrent('future values preserve failures without starting twice', async () => {
    const FutureValue = initializeFutureValueClass(Symbol.dispose);
    const failure = new Error('future failed');
    let starts = 0;
    const value = new FutureValue(() => {
        starts++;
        throw failure;
    });
    await expect(awaitOne(value)).rejects.toBe(failure);
    await expect(awaitOne(value)).rejects.toBe(failure);
    expect(starts).toBe(1);
});

test.concurrent('temporary then hiding restores access after an abrupt resolver', () => {
    const FutureValue = initializeFutureValueClass(Symbol.dispose);
    const value = new FutureValue(() => ({ value: 42 }));
    const then = value.then;
    expect(() =>
        value.resolveAsValue((instance) => {
            expect(instance).toBe(value);
            expect(value.then).toBeUndefined();
            throw new Error('resolver');
        }),
    ).toThrow('resolver');
    expect(value.then).toBe(then);
});

test.concurrent('constructors and private brands are isolated between coexisting stores', async () => {
    const First = initializeFutureValueClass(Symbol.dispose),
        Second = initializeFutureValueClass(Symbol.dispose);
    expect(First).not.toBe(Second);
    const a = new First(() => ({ value: 17 })),
        b = new Second(() => ({ value: 23 }));
    expect(a).toBeInstanceOf(First);
    expect(a).not.toBeInstanceOf(Second);
    expect(b).toBeInstanceOf(Second);
    expect(b).not.toBeInstanceOf(First);
    expect(await Promise.all([awaitOne(a), awaitOne(b)])).toEqual([17, 23]);
    expect(() => Reflect.construct(First, [42])).toThrow(/start operation must be a function/);
});

test.concurrent('dropping an unread future is idempotent and does not start it', async () => {
    const disposeSymbol = Symbol('dispose');
    const FutureValue = initializeFutureValueClass(disposeSymbol);
    let starts = 0;
    let drops = 0;
    const value = new FutureValue(
        () => {
            starts++;
            return { value: 42 };
        },
        () => {
            drops++;
        },
    );

    value[disposeSymbol]();
    value[disposeSymbol]();
    await expect(awaitOne(value)).rejects.toThrow('future was dropped');
    expect(starts).toBe(0);
    expect(drops).toBe(1);
});

test.concurrent('dropping before delivery disposes the copied resource exactly once', async () => {
    const disposeSymbol = Symbol('dispose');
    const FutureValue = initializeFutureValueClass(disposeSymbol);
    let disposals = 0;
    const resource = {
        [disposeSymbol]() {
            disposals++;
        },
    };
    const value = new FutureValue(() => {
        value[disposeSymbol]();
        return { value: resource };
    });

    await expect(awaitOne(value)).rejects.toThrow('future was dropped');
    value[disposeSymbol]();
    await Promise.resolve();
    expect(disposals).toBe(1);
});

test.concurrent('a recipient owns the resource even when it drops the future reentrantly', async () => {
    const disposeSymbol = Symbol('dispose');
    const FutureValue = initializeFutureValueClass(disposeSymbol);
    let disposals = 0;
    const resource = {
        [disposeSymbol]() {
            disposals++;
        },
    };
    const value = new FutureValue(() => ({ value: resource }));
    const failure = new Error('recipient failed');

    await expect(
        value.then((received) => {
            expect(received).toBe(resource);
            value[disposeSymbol]();
            throw failure;
        }),
    ).rejects.toBe(failure);
    await Promise.resolve();
    expect(disposals).toBe(0);
});
