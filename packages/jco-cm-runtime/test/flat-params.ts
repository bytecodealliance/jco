import { expect, test } from 'vitest';
import { liftFlatS32, liftFlatRecord } from '../src/intrinsics/lift.js';
import { createLiftContext } from '../src/intrinsics/call-context.js';
import type { TaskLiftContext } from '../src/runtime.js';

test.each([false, true])('flat contexts preserve snapshots, replacement, and custom consumers (owned=%s)', (owned) => {
    const input = [1, 2, 3, 4];
    const options: TaskLiftContext = { componentIdx: 0, params: input, useDirectParams: true };
    const ctx = owned ? createLiftContext(options, true) : options;
    expect(liftFlatS32(ctx)[0]).toBe(1);
    input[1] = 99;
    expect(liftFlatS32(ctx)[0]).toBe(2);
    const remaining = ctx.params;
    expect(remaining).toEqual([3, 4]);
    expect(liftFlatS32(ctx)[0]).toBe(3);
    remaining[1] = 99;
    expect(liftFlatS32(ctx)[0]).toBe(4);
    expect(ctx.params).toEqual([]);
    ctx.params = [5, 6];
    expect(liftFlatS32(ctx)[0]).toBe(5);
    expect({ ...ctx }.params).toEqual([6]);
});

test.concurrent('flat cursors preserve non-configurable accessors', () => {
    let params = [1, 2];
    const ctx = { componentIdx: 0, useDirectParams: true } as TaskLiftContext;
    Object.defineProperty(ctx, 'params', {
        get: () => params,
        set: (value) => {
            params = value;
        },
    });
    expect(liftFlatS32(ctx)[0]).toBe(1);
    expect(params).toEqual([2]);
});

test.each([false, true])('custom record lifts see unconsumed parameters (owned=%s)', (owned) => {
    const lift = liftFlatRecord({
        fieldMetas: [
            ['first', liftFlatS32, 4, 4],
            [
                'second',
                (ctx) => {
                    expect(ctx.params).toEqual([2, 3]);
                    return liftFlatS32(ctx);
                },
                4,
                4,
            ],
        ],
        size32: 8,
        align32: 4,
    });
    const ctx: TaskLiftContext = { componentIdx: 0, params: [1, 2, 3], useDirectParams: true };
    const context = owned ? createLiftContext(ctx, true) : ctx;
    expect(lift(context)[0]).toEqual({ first: 1, second: 2 });
    expect(context.params).toEqual([3]);
});

test.each(['direct', 'cursor', 'memory'] as const)(
    'record lifts preserve replacement contexts and storage budgets (%s)',
    (mode) => {
        const memory = new WebAssembly.Memory({ initial: 1 });
        new DataView(memory.buffer).setInt32(4, 17, true);
        new DataView(memory.buffer).setInt32(8, 29, true);
        let replacement: TaskLiftContext | undefined;
        const lift = liftFlatRecord({
            fieldMetas: [
                [
                    'first',
                    (ctx) => {
                        const [value, next] = liftFlatS32(ctx);
                        replacement = { ...next, storageLen: 999, custom: 'retained' };
                        return [value, replacement];
                    },
                    4,
                    4,
                ],
                ['second', liftFlatS32, 4, 4],
            ],
            size32: 8,
            align32: 4,
        });
        const options: TaskLiftContext = {
            componentIdx: 0,
            params: mode === 'memory' ? [] : [17, 29, 41],
            useDirectParams: mode !== 'memory',
            memory,
            storagePtr: 1,
            storageLen: 8,
        };
        const context = mode === 'cursor' ? createLiftContext(options, true) : options;
        const [value, next] = lift(context);
        expect(value).toEqual({ first: 17, second: 29 });
        expect(next).toBe(replacement);
        expect(next.custom).toBe('retained');
        expect(next.storagePtr).toBe(12);
        expect(next.storageLen).toBe(0);
        expect(next.params).toEqual(mode === 'memory' ? [] : [41]);
    },
);
