import { expect, test } from 'vitest';
import * as lift from '../src/intrinsics/lift.js';
import { initializeUtf8Decoder, initializeUtf16Decoder } from '../src/intrinsics/string.js';
import { create as createErrorContext } from './error-context-helpers.js';
import { create as createFuture } from './future-helpers.js';
import { createFuture as createFuturePair } from '../src/intrinsics/future-state.js';
import type {
    TaskLiftContext,
    TaskLiftFn,
    LiftVariantMeta,
    LiftFutureContext,
    LiftStreamContext,
    LiftStreamEndpoint,
    LiftExternalStreamOptions,
} from '../src/runtime.js';

function direct(params: unknown[]): TaskLiftContext {
    return { componentIdx: 0, params, useDirectParams: true };
}
function indirect(buffer: ArrayBuffer, storagePtr = 0, storageLen = buffer.byteLength): TaskLiftContext {
    return { componentIdx: 0, params: [], memory: { buffer }, storagePtr, storageLen };
}
const primitives: [string, TaskLiftFn, number | bigint, unknown, number, string][] = [
    ['bool', lift.liftFlatBool, 1, true, 1, 'setUint8'],
    ['s8', lift.liftFlatS8, -128, -128, 1, 'setInt8'],
    ['u8', lift.liftFlatU8, 255, 255, 1, 'setUint8'],
    ['s16', lift.liftFlatS16, -32768, -32768, 2, 'setInt16'],
    ['u16', lift.liftFlatU16, 65535, 65535, 2, 'setUint16'],
    ['s32', lift.liftFlatS32, -2147483648, -2147483648, 4, 'setInt32'],
    ['u32', lift.liftFlatU32, -1, 0xffffffff, 4, 'setUint32'],
    ['s64', lift.liftFlatS64, -9223372036854775808n, -9223372036854775808n, 8, 'setBigInt64'],
    ['u64', lift.liftFlatU64, -1n, 0xffffffffffffffffn, 8, 'setBigUint64'],
    ['f32', lift.liftFlatFloat32, 1.25, 1.25, 4, 'setFloat32'],
    ['f64', lift.liftFlatFloat64, -1.5, -1.5, 8, 'setFloat64'],
    ['char', lift.liftFlatChar, 65, 'A', 4, 'setUint32'],
];
test.concurrent.each(primitives)(
    '%s preserves direct and indirect values, cursors and storage traps',
    (_name, fn, input, expected, size, setter) => {
        const ctx = direct([input, 123]);
        expect(fn(ctx)).toEqual([expected, ctx]);
        expect(ctx.params).toEqual([123]);
        expect(() => fn(direct([]))).toThrow();
        const buffer = new ArrayBuffer(16);
        (
            new DataView(buffer)[setter as 'setFloat64'] as (
                offset: number,
                value: never,
                littleEndian?: boolean,
            ) => void
        ).call(new DataView(buffer), 0, input as never, true);
        const memory = indirect(buffer, 0, size);
        expect(fn(memory)).toEqual([expected, memory]);
        expect(memory.storagePtr).toBe(size);
        expect(memory.storageLen).toBe(0);
        expect(() => fn(indirect(buffer, 0, size - 1))).toThrow(/insufficient storage/);
    },
);

test.concurrent('UTF8 and UTF16 use selected decoders for direct and indirect representations', () => {
    const utf8 = initializeUtf8Decoder(),
        utf16 = initializeUtf16Decoder();
    const buffer = new ArrayBuffer(64);
    new Uint8Array(buffer).set(new TextEncoder().encode('hé'), 16);
    const dv = new DataView(buffer);
    dv.setUint32(4, 16, true);
    dv.setUint32(8, 3, true);
    const ctx = direct([16, 3, 99]);
    ctx.memory = { buffer };
    ctx.stringEncoding = 'utf8';
    expect(lift.liftFlatStringAny({ utf8, utf16 }, ctx)[0]).toBe('hé');
    expect(ctx.params).toEqual([99]);
    const fromMemory = indirect(buffer, 3);
    expect(lift.liftFlatStringUTF8(utf8, fromMemory)[0]).toBe('hé');
    expect(fromMemory.storagePtr).toBe(12);
    new Uint16Array(buffer, 24, 2).set([0xd83d, 0xde80]);
    const unicode = direct([24, 2]);
    unicode.memory = { buffer };
    expect(lift.liftFlatStringUTF16(utf16, unicode)[0]).toBe('🚀');
    expect(() => lift.liftFlatStringAny({ utf8, utf16 }, { ...ctx, stringEncoding: 'bad' })).toThrow(
        /unsupported string encoding/,
    );
});

test.concurrent('record and tuple restore their storage budgets after callbacks replace the cursor', () => {
    const field: TaskLiftFn = (ctx) => [42, { ...ctx, storagePtr: 1, storageLen: 999 }];
    const record = lift.liftFlatRecord({ fieldMetas: [['answer', field, 4, 4]], size32: 8, align32: 4 });
    const ctx = indirect(new ArrayBuffer(16), 0, 8);
    const [value, next] = record(ctx);
    expect(value).toEqual({ answer: 42 });
    expect(next.storagePtr).toBe(8);
    expect(next.storageLen).toBe(4);
    expect(next).not.toBe(ctx);
    const tuple = lift.liftFlatTuple({ elemLiftFns: [[field, 4, 4]], size32: 8, align32: 4 });
    const [values, tupleCtx] = tuple(indirect(new ArrayBuffer(16), 0, 8));
    expect(values).toEqual([42]);
    expect(tupleCtx.storagePtr).toBe(8);
    expect(tupleCtx.storageLen).toBe(4);
});
function variant(): LiftVariantMeta {
    return {
        caseMetas: [
            ['none', null, 0, 1, 0, []],
            ['some', lift.liftFlatFloat32, 4, 4, 1, ['f32']],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
        variantPayloadFlatTypes: ['i32'],
    };
}
test.concurrent('variant, option and result preserve joined float bits and padding', () => {
    const context = lift.initializeLiftVariant();
    expect(context.scratch).not.toBe(lift.initializeLiftVariant().scratch);
    const ctx = direct([1, 0x3f800000, 99]);
    expect(lift.liftFlatVariant(context, variant())(ctx)[0]).toEqual({ tag: 'some', val: 1 });
    expect(ctx.params).toEqual([99]);
    expect(lift.liftFlatOption(context, variant())(direct([0, 0]))[0]).toBeUndefined();
    expect(lift.liftFlatOption(context, variant())(direct([1, 0x40000000]))[0]).toBe(2);
    expect(lift.liftFlatResult(context, variant())(direct([0, 0]))[0]).toEqual({ tag: 'none', val: undefined });
    const meta = variant();
    meta.isEnum = true;
    expect(
        lift.liftFlatEnum(context, {
            ...meta,
            caseMetas: [
                ['none', null, 1, 1, 1, []],
                ['some', null, 1, 1, 1, []],
            ],
            variantFlatCount: 1,
        })(direct([0]))[0],
    ).toBe('none');
    const memory = new ArrayBuffer(16);
    new DataView(memory).setUint8(0, 1);
    new DataView(memory).setFloat32(4, 3.5, true);
    expect(lift.liftFlatVariant(context, variant())(indirect(memory))[0]).toEqual({ tag: 'some', val: 3.5 });
});
test.concurrent('lists preserve direct/indirect pointer budgets, typed results and bounds checks', () => {
    const memory = new ArrayBuffer(64),
        dv = new DataView(memory);
    dv.setUint32(0, 16, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(16, 17, true);
    dv.setUint32(20, 23, true);
    const fn = lift.liftFlatList(
        { RuntimeError: WebAssembly.RuntimeError },
        { elemLiftFn: lift.liftFlatU32, elemSize32: 4, elemAlign32: 4, typedArray: Uint32Array },
    );
    const ctx = direct([16, 2, 99]);
    ctx.memory = { buffer: memory };
    expect(fn(ctx)[0]).toEqual(new Uint32Array([17, 23]));
    expect(ctx.useDirectParams).toBe(true);
    expect(ctx.params).toEqual([99]);
    expect(ctx.storagePtr).toBeUndefined();
    const fromMemory = indirect(memory, 0, 8);
    expect(fn(fromMemory)[0]).toEqual(new Uint32Array([17, 23]));
    expect(fromMemory.storagePtr).toBe(8);
    expect(fromMemory.storageLen).toBe(8);
    expect(() => fn({ ...ctx, params: [60, 2] })).toThrow(WebAssembly.RuntimeError);
    expect(() => fn({ ...ctx, params: [17, 2] })).toThrow(/not aligned/);
    const known = lift.liftFlatList(
        { RuntimeError: Error },
        { elemLiftFn: lift.liftFlatU32, elemSize32: 4, elemAlign32: 4, knownLen: 2 },
    );
    expect(known(direct([4, 5, 6]))[0]).toEqual([4, 5]);
});
test.concurrent('map and flags consume their original layouts and selected bigint policy', () => {
    const buffer = new ArrayBuffer(64),
        dv = new DataView(buffer);
    dv.setUint32(16, 7, true);
    dv.setUint32(20, 42, true);
    const fn = lift.liftFlatMap({
        keyLiftFn: lift.liftFlatU32,
        valueLiftFn: lift.liftFlatU32,
        entrySize32: 8,
        valueOffset32: 4,
    });
    const ctx = direct([16, 1, 99]);
    ctx.memory = { buffer };
    expect(fn(ctx)[0]).toEqual(new Map([[7, 42]]));
    expect(ctx.params).toEqual([99]);
    expect(ctx.useDirectParams).toBe(true);
    const meta = { names: ['a', 'b'], size32: 1, align32: 1, intSizeBytes: 1 };
    expect(lift.liftFlatFlags({ asBigInt: false }, meta)(direct([2]))[0]).toEqual({ a: false, b: true });
    expect(lift.liftFlatFlags({ asBigInt: true }, meta)(direct([3]))[0]).toBe(3n);
});
test.concurrent('owned resources use their lazy class and explicit live resource capability', () => {
    let calls = 0;
    const fn = lift.liftFlatOwn({
        componentIdx: 0,
        tableIdx: 3,
        classNameFn: () => {
            calls++;
            return class Resource {};
        },
        createResourceFn: (handle) => ({ handle }),
    });
    expect(calls).toBe(0);
    expect(fn(direct([17]))[0]).toEqual({ handle: 17 });
    const ctx = direct([23]);
    ctx.liftResource = (handle, tableIdx) => ({ handle, tableIdx });
    expect(fn(ctx)[0]).toEqual({ handle: 23, tableIdx: 3 });
    expect(() => fn({ ...direct([1]), componentIdx: 1 })).toThrow(/invalid component/);
    expect(() => lift.liftFlatBorrow(0, 0, null, [], 0, 0)).toThrow(/borrowed resources is not supported/);
});

test.concurrent('future and stream bridges stay lazy, preserve endpoint identity and retain pending completions', async () => {
    const selected = createFuture();
    const { lookup } = selected;
    const state = selected.addTable(0, 2);
    const pair = createFuturePair(selected.creation, state, { tableIdx: 2, elemMeta: { align32: 4, isNumeric: true } });
    const read = pair.readEnd;
    const promise = read.promise();
    const fn = lift.liftFlatFuture(selected.ends, { componentIdx: 0, futureTableIdx: 2 });
    expect(read.getPendingBufferMeta().buffer).toBeUndefined();
    expect(fn(direct([read.waitableIdx()]))[0]).toBe(promise);
    read.setCopyState(selected.FutureEnd.CopyState.DONE);
    expect(() => fn(direct([read.waitableIdx()]))).toThrow(/previous read succeeded/);
    read.setCopyState(selected.FutureEnd.CopyState.IDLE);
    read.getWaitable().join({ addWaitable() {}, removeWaitable() {} });
    expect(() => fn(direct([read.waitableIdx()]))).toThrow(/waitable set/);
    read.getWaitable().join(null);
    const malformed = {
        ...selected.ends,
        tables: { 2: { componentIdx: 0, table: null } },
    } as unknown as LiftFutureContext;
    class SelectedTrap extends Error {}
    let writable = false,
        idle = true;
    expect(() =>
        lift.liftFlatFuture(malformed, { componentIdx: 0, futureTableIdx: 2 })(direct([read.waitableIdx()])),
    ).toThrow(/table \[2\]/);
    const received = Promise.resolve(promise);
    await pair.writeEnd.hostWrite({ value: 42, stringEncoding: 'utf8' });
    expect(await received).toBe(42);
    read.drop();
    pair.writeEnd.drop();
    let dropped: unknown;
    let options: LiftExternalStreamOptions | undefined;
    const end: LiftStreamEndpoint = {
        isWritable: () => writable,
        isReadable: () => true,
        isDoneState: () => false,
        isIdleState: () => idle,
        isInSet: () => false,
        globalStreamMapRep: () => 23,
        write: (v) => v,
        read: (opts) => opts,
        drop: (opts) => {
            dropped = opts;
        },
    };
    class External {
        constructor(opts: LiftExternalStreamOptions) {
            options = opts;
        }
    }
    const stream: LiftStreamContext = {
        RuntimeError: SelectedTrap,
        lookup,
        getTables: () => ({ 3: { componentIdx: 0, table: {} } }),
        getEnd: () => end,
        getExternalStream: () => External,
    };
    const streamLift = lift.liftFlatStream(stream, { componentIdx: 0, streamTableIdx: 3 });
    expect(() => streamLift(direct([0]))).toThrow(SelectedTrap);
    writable = true;
    expect(() => streamLift(direct([17]))).toThrow(SelectedTrap);
    writable = false;
    idle = false;
    expect(() => streamLift(direct([17]))).toThrow(SelectedTrap);
    idle = true;
    const lifted = streamLift(direct([17]))[0];
    expect(lifted).toBeInstanceOf(External);
    expect(options!.globalRep).toBe(23);
    options!.dropFn();
    expect(dropped).toEqual({ allowPendingEvent: true });
});

test.concurrent('error-context lifting transfers local ownership to the actual global table', () => {
    const store = createErrorContext();
    const { errorContext, core, lookup, component } = store;
    const context = {
        globalTable: errorContext.GlobalErrorContextTable,
        lookup,
        local: { localTables: errorContext.localTables, RepTable: core.RepTable },
    };
    errorContext.errCtxGetLocalTable(0, 2, { upsert: true });
    const waitable = errorContext.errCtxNew(
        { componentIdx: 0, localTableIdx: 2, readStrFn: () => 'lifted error' },
        0,
        0,
    );
    const state = component.getOrCreateAsyncState(0);
    const local = state.handles.get(waitable) as import('../src/runtime.js').LocalErrorContext;
    const ctx = direct([local.localIdx, 99]);
    expect(lift.liftFlatErrorContext(context, 2, ctx)[0]).toBe(local.globalRep);
    expect(ctx.params).toEqual([99]);
    expect(local.refCount).toBe(0);
    expect(errorContext.GlobalErrorContextTable.get().get(local.globalRep)!.refCount).toBe(2);
    expect(() => lift.liftFlatErrorContext(context, 2, indirect(new ArrayBuffer(8)))).toThrow(/not yet implemented/);
});

test.concurrent.each([false, true])(
    'compact strings preserve direct=%s operands and cursor state',
    (useDirectParams) => {
        const context = { utf8: initializeUtf8Decoder(), utf16: initializeUtf16Decoder() };
        for (const [text, bytes, taggedLength] of [
            ['A\u0080ÿ', [65, 128, 255], 3],
            ['🚀', [0x3d, 0xd8, 0x80, 0xde], 0x80000002],
        ] as const) {
            const buffer = new ArrayBuffer(32);
            new Uint8Array(buffer, 8, bytes.length).set(bytes);
            const view = new DataView(buffer);
            view.setUint32(0, 8, true);
            view.setUint32(4, taggedLength, true);
            const ctx = useDirectParams
                ? { ...direct([8, taggedLength, 73]), memory: { buffer } }
                : indirect(buffer, 0, 8);
            ctx.stringEncoding = 'compact-utf16';
            expect(lift.liftFlatStringAny(context, ctx)).toEqual([text, ctx]);
            if (useDirectParams) {
                expect(ctx.params).toEqual([73]);
            } else {
                expect(ctx.storagePtr).toBe(8);
                expect(ctx.storageLen).toBe(0);
            }
        }
    },
);

test.concurrent('compact lifts retain malformed UTF16 and alignment checks', () => {
    const context = { utf8: initializeUtf8Decoder(), utf16: initializeUtf16Decoder() };
    const buffer = new ArrayBuffer(16);
    new DataView(buffer).setUint16(8, 0xd800, true);
    for (const params of [
        [8, 0x80000001],
        [9, 1],
        [16, 1],
    ]) {
        const ctx = { ...direct(params), memory: { buffer }, stringEncoding: 'compact-utf16' };
        expect(() => lift.liftFlatStringAny(context, ctx)).toThrow();
    }
});
