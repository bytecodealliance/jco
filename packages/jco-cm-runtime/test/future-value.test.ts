import { expect, test } from 'vitest';
import { initializeFutureValueClass } from '../src/intrinsics/future-value.js';
import type { FutureValue } from '../src/runtime.js';

// Awaited<T> recursively unwraps thenables, while this ABI deliberately exposes one layer.
const awaitOne = (value: FutureValue): Promise<unknown> => Promise.resolve(value);

test.concurrent('future values start lazily and share a single settled operation', async () => {
    const FutureValue = initializeFutureValueClass();
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
    const FutureValue = initializeFutureValueClass();
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
    const FutureValue = initializeFutureValueClass();
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
    const FutureValue = initializeFutureValueClass();
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
    const First = initializeFutureValueClass(),
        Second = initializeFutureValueClass();
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
