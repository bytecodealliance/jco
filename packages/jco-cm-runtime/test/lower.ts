import { expect, test } from 'vitest';
import * as lower from '../src/intrinsics/lower.js';
import * as lift from '../src/intrinsics/lift.js';
import {
    initializeUtf8Encoder,
    initializeUtf16Encoding,
    initializeUtf8Decoder,
    initializeUtf16Decoder,
} from '../src/intrinsics/string.js';
import { create as createErrorContext } from './error-context-helpers.js';
import { create as createFuture } from './future-helpers.js';
import type {
    TaskLowerContext,
    TaskLowerFn,
    TaskLiftFn,
    LowerVariantMeta,
    LowerFutureContext,
    LowerStreamContext,
    LowerReadEnd,
    LocalErrorContext,
} from '../src/runtime.js';
const strict = { strict: true };
function cursor(value: unknown, storagePtr = 0): TaskLowerContext {
    return { componentIdx: 0, vals: [value], memory: { buffer: new ArrayBuffer(128) }, storagePtr };
}
const primitives: [string, (context: typeof strict, ctx: TaskLowerContext) => void, TaskLiftFn, unknown, number][] = [
    ['bool', lower.lowerFlatBool, lift.liftFlatBool, true, 1],
    ['s8', lower.lowerFlatS8, lift.liftFlatS8, -128, 1],
    ['u8', lower.lowerFlatU8, lift.liftFlatU8, 255, 1],
    ['s16', lower.lowerFlatS16, lift.liftFlatS16, -32768, 2],
    ['u16', lower.lowerFlatU16, lift.liftFlatU16, 65535, 2],
    ['s32', lower.lowerFlatS32, lift.liftFlatS32, -2147483648, 4],
    ['u32', lower.lowerFlatU32, lift.liftFlatU32, 0xffffffff, 4],
    ['s64', lower.lowerFlatS64, lift.liftFlatS64, -9223372036854775808n, 8],
    ['u64', lower.lowerFlatU64, lift.liftFlatU64, 0xffffffffffffffffn, 8],
    ['f32', lower.lowerFlatFloat32, lift.liftFlatFloat32, 1.25, 4],
    ['f64', lower.lowerFlatFloat64, lift.liftFlatFloat64, -Math.PI, 8],
];
test.concurrent.each(primitives)(
    '%s lowers aligned values that lift back without changing representation',
    (_name, fn, liftFn, value, size) => {
        const ctx = cursor(value, 1);
        fn(strict, ctx);
        const start = size === 1 ? 1 : size;
        expect(ctx.storagePtr).toBe(start + size);
        expect(
            liftFn({ componentIdx: 0, params: [], memory: ctx.memory, storagePtr: start, storageLen: size })[0],
        ).toBe(value);
        expect(() => fn(strict, cursor('bad'))).toThrow(TypeError);
        expect(() => fn(strict, { ...ctx, vals: [] })).toThrow();
    },
);
test.concurrent.each(['\0', 'A', 'é', '🚀'])(
    'char lowers the Unicode scalar %j, including zero and astral values',
    (value) => {
        const ctx = cursor(value);
        lower.lowerFlatChar(ctx);
        expect(new DataView(ctx.memory!.buffer).getUint32(0, true)).toBe(value.codePointAt(0));
        expect(
            lift.liftFlatChar({ componentIdx: 0, params: [], memory: ctx.memory, storagePtr: 0, storageLen: 4 })[0],
        ).toBe(value);
    },
);
test.concurrent.each(['', 'ab', '\ud800', '\udfff', 42])('char rejects non-scalar value %j', (value) =>
    expect(() => lower.lowerFlatChar(cursor(value))).toThrow(TypeError),
);
test.concurrent('UTF8/UTF16 lowering writes the pointer/length pair and uses the selected allocator', () => {
    const codecs = { utf8: initializeUtf8Encoder(), utf16: initializeUtf16Encoding() };
    for (const [encoding, decoder] of [
        ['utf8', initializeUtf8Decoder()],
        ['utf16', initializeUtf16Decoder()],
    ] as const) {
        const ctx = cursor('é 🚀');
        ctx.stringEncoding = encoding;
        ctx.realloc = (_old, _size, align, len) => {
            expect(align).toBe(encoding === 'utf8' ? 1 : 2);
            expect(len).toBeGreaterThan(0);
            return 32;
        };
        lower.lowerFlatStringAny(codecs, ctx);
        expect(ctx.storagePtr).toBe(8);
        const dv = new DataView(ctx.memory!.buffer),
            ptr = dv.getUint32(0, true),
            length = dv.getUint32(4, true);
        expect(decoder.decode(new Uint8Array(ctx.memory!.buffer, ptr, length * (encoding === 'utf8' ? 1 : 2)))).toBe(
            'é 🚀',
        );
    }
});
test.concurrent('record and tuple factories retain their metadata callbacks and layout', () => {
    const primitive: TaskLowerFn = (ctx) => lower.lowerFlatU32(strict, ctx);
    const ctx = cursor({ a: 17, b: 23 });
    lower.lowerFlatRecord({
        fieldMetas: [
            ['a', primitive, 4, 4],
            ['b', primitive, 4, 4],
        ],
        size32: 8,
        align32: 4,
    })(ctx);
    expect(Array.from(new Uint32Array(ctx.memory!.buffer, 0, 2))).toEqual([17, 23]);
    expect(ctx.storagePtr).toBe(8);
    const tuple = cursor([7, 11]);
    lower.lowerFlatTuple({
        elemLowerMetas: [
            [primitive, 4, 4],
            [primitive, 4, 4],
        ],
        size32: 8,
        align32: 4,
    })(tuple);
    expect(Array.from(new Uint32Array(tuple.memory!.buffer, 0, 2))).toEqual([7, 11]);
    expect(tuple.storagePtr).toBe(8);
});
function variant(): LowerVariantMeta {
    return {
        caseMetas: [
            ['none', null, 0, 1, 0],
            ['some', (ctx) => lower.lowerFlatU32(strict, ctx), 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
    };
}
test.concurrent('variant wrappers preserve discriminants, payloads, null options and result values', () => {
    const ctx = cursor({ tag: 'some', val: 42 });
    lower.lowerFlatVariant(strict, variant())(ctx);
    const dv = new DataView(ctx.memory!.buffer);
    expect(dv.getUint8(0)).toBe(1);
    expect(dv.getUint32(4, true)).toBe(42);
    expect(ctx.storagePtr).toBe(8);
    const none = cursor(null);
    lower.lowerFlatOption(strict, variant())(none);
    expect(new DataView(none.memory!.buffer).getUint8(0)).toBe(0);
    const some = cursor(23);
    lower.lowerFlatOption(strict, variant())(some);
    expect(new DataView(some.memory!.buffer).getUint32(4, true)).toBe(23);
    const enumeration = cursor('none');
    lower.lowerFlatEnum(strict, variant())(enumeration);
    expect(new DataView(enumeration.memory!.buffer).getUint8(0)).toBe(0);
    const result = cursor(null);
    lower.lowerFlatResult(strict, {
        ...variant(),
        caseMetas: [
            ['ok', null, 0, 1, 0],
            ['err', null, 0, 1, 0],
        ],
    })(result);
    expect(new DataView(result.memory!.buffer).getUint8(0)).toBe(0);
    expect(() => lower.lowerFlatVariant(strict, variant())(cursor({ tag: 'missing' }))).toThrow(/missing tag/);
});
test.concurrent('lists preserve fixed and allocated element storage, including direct nested allocator capabilities', () => {
    const elem: TaskLowerFn = (ctx) => lower.lowerFlatU8(strict, ctx),
        meta = { elemLowerFn: elem, elemSize32: 1, elemAlign32: 1 };
    const fixed = cursor([17, 23]);
    fixed.storageLen = 2;
    lower.lowerFlatList(strict, { ...meta, knownLen: 2, size32: 2, align32: 1 })(fixed);
    expect(Array.from(new Uint8Array(fixed.memory!.buffer, 0, 2))).toEqual([17, 23]);
    expect(fixed.storagePtr).toBe(2);
    const allocated = cursor([7, 11]);
    allocated.realloc = () => 32;
    lower.lowerFlatList(strict, meta)(allocated);
    const dv = new DataView(allocated.memory!.buffer);
    expect([dv.getUint32(0, true), dv.getUint32(4, true)]).toEqual([32, 2]);
    expect(Array.from(new Uint8Array(allocated.memory!.buffer, 32, 2))).toEqual([7, 11]);
    expect(allocated.storagePtr).toBe(8);
    const direct = cursor([17, 23]);
    direct.componentIdx = 9;
    direct.params = [32, 2, 99];
    direct.useDirectParams = true;
    direct.realloc = () => 64;
    lower.lowerFlatList(strict, {
        ...meta,
        elemLowerFn: (ctx) => {
            expect(ctx.componentIdx).toBe(9);
            expect(ctx.realloc).toBe(direct.realloc);
            elem(ctx);
        },
    })(direct);
    expect(direct.params).toEqual([99]);
    expect(Array.from(new Uint8Array(direct.memory!.buffer, 32, 2))).toEqual([17, 23]);
});
test.concurrent('map and flags use canonical entry layout and the selected bigint policy', () => {
    const elem: TaskLowerFn = (ctx) => lower.lowerFlatU32(strict, ctx);
    const ctx = cursor(new Map([[17, 23]]));
    ctx.realloc = () => 32;
    lower.lowerFlatMap(strict, {
        keyLowerFn: elem,
        valueLowerFn: elem,
        entrySize32: 8,
        entryAlign32: 4,
        valueOffset32: 4,
    })(ctx);
    expect(Array.from(new Uint32Array(ctx.memory!.buffer, 32, 2))).toEqual([17, 23]);
    expect(ctx.storagePtr).toBe(8);
    const meta = { names: ['a', 'b'], size32: 1, align32: 1, intSizeBytes: 1 };
    const flags = cursor({ b: true });
    lower.lowerFlatFlags({ asBigInt: false }, meta)(flags);
    expect(new DataView(flags.memory!.buffer).getUint8(0)).toBe(2);
    const bigint = cursor(3n);
    lower.lowerFlatFlags({ asBigInt: true }, meta)(bigint);
    expect(new DataView(bigint.memory!.buffer).getUint8(0)).toBe(3);
    expect(() => lower.lowerFlatFlags({ asBigInt: true }, meta)(cursor(4n))).toThrow(/extraneous bits/);
});
test.concurrent('owned resources honor the explicit caller capability and reject component mismatches', () => {
    const fn = lower.lowerFlatOwn(strict, { componentIdx: 0, tableIdx: 2, lowerFn: () => 17 }),
        ctx = cursor({});
    ctx.lowerResource = (_obj, tableIdx) => {
        expect(tableIdx).toBe(2);
        return 23;
    };
    fn(ctx);
    expect(new DataView(ctx.memory!.buffer).getUint32(0, true)).toBe(23);
    expect(() => fn({ ...cursor({}), componentIdx: 1 })).toThrow(/component index mismatch/);
    expect(() => lower.lowerFlatBorrow(cursor({}))).toThrow(/borrowed resources is not supported/);
});
test.concurrent('future and stream lowering look up live state lazily and write handle zero-pointer results', () => {
    const selected = createFuture();
    const { lookup } = selected;
    const resourceRep = Symbol();
    const rep = selected.futures.insert({
        getFutureEndWaitableIdx: () => 17,
        setRep() {},
        createUserFuture: () => new selected.FutureValue(() => ({ value: 0 })),
    });
    const context: LowerFutureContext = {
        numeric: strict,
        lookup,
        resourceRep,
        nestedSymbol: selected.nestedSymbol,
        futures: selected.futures,
        creation: selected.creation,
        injection: selected.injection,
    };
    const fn = lower.lowerFlatFuture(context, { componentIdx: 0, futureTableIdx: 2, elemMeta: { align32: 4 } });
    expect(selected.futures.size()).toBe(1);
    const ctx = cursor(Object.assign(Promise.resolve(0), { [resourceRep]: rep }));
    expect(fn(ctx)).toBe(17);
    expect(selected.futures.size()).toBe(1);
    expect(new DataView(ctx.memory!.buffer).getUint32(0, true)).toBe(17);
    const readEnd: LowerReadEnd = { waitableIdx: () => 23, setHostInjectFn: () => {}, setHostDropFn: () => {} };
    class External {}
    class Internal {
        readEnd() {
            return readEnd;
        }
    }
    const stream: LowerStreamContext = {
        numeric: strict,
        lookup,
        resourceRep,
        getGlobal: () => new Map([[9, new Internal()]]),
        getExternalClass: () => External,
        getInternalClass: () => Internal,
        isLowerable: () => false,
        create: () => {
            throw Error('must reuse internal stream');
        },
        genRead: () => {
            throw Error('must reuse internal stream');
        },
        genHostInject: () => {
            throw Error('must reuse internal stream');
        },
    };
    const value = Object.assign(new External(), { [resourceRep]: 9 }),
        streamCtx = cursor(value);
    expect(
        lower.lowerFlatStream(stream, { componentIdx: 0, streamTableIdx: 3, elemMeta: { align32: 4 } })(streamCtx),
    ).toBe(23);
    expect(new DataView(streamCtx.memory!.buffer).getUint32(0, true)).toBe(23);
});
test.concurrent('error-context lift/lower transfers ownership and releases exhausted local/global handles', () => {
    const { errorContext, core, lookup, component } = createErrorContext();
    const context = {
        numeric: strict,
        globalTable: errorContext.GlobalErrorContextTable,
        lookup,
        local: { localTables: errorContext.localTables, RepTable: core.RepTable },
    };
    errorContext.errCtxGetLocalTable(0, 2, { upsert: true });
    const handle = errorContext.errCtxNew({ componentIdx: 0, localTableIdx: 2, readStrFn: () => 'owned error' }, 0, 0);
    const state = component.getOrCreateAsyncState(0),
        entry = state.handles.get(handle) as LocalErrorContext;
    const [globalRep] = lift.liftFlatErrorContext(context, 2, {
        componentIdx: 0,
        params: [entry.localIdx],
        useDirectParams: true,
    });
    const ctx = cursor(globalRep);
    ctx.componentIdx = 1;
    lower.lowerFlatErrorContext(context, 3, ctx);
    expect(ctx.storagePtr).toBe(4);
    const nextHandle = new DataView(ctx.memory!.buffer).getUint32(0, true);
    expect(state.handles.get(handle)).toBeUndefined();
    expect(errorContext.GlobalErrorContextTable.get().get(globalRep as number)!.refCount).toBe(1);
    errorContext.errCtxDrop({ componentIdx: 1, localTableIdx: 3 }, nextHandle);
    expect(errorContext.GlobalErrorContextTable.get().get(globalRep as number)).toBeUndefined();
});

test.concurrent.each(['A\u0080ÿ', '🚀', ''])('compact lowering roundtrips %j after allocator growth', (value) => {
    const codecs = { utf8: initializeUtf8Encoder(), utf16: initializeUtf16Encoding() };
    const memory = { buffer: new ArrayBuffer(8) };
    const ctx: TaskLowerContext = {
        ...cursor(value),
        memory,
        stringEncoding: 'compact-utf16',
        realloc(_old, _size, align, bytes) {
            expect(align).toBe(2);
            expect(bytes).toBe(value === '🚀' ? 4 : value.length);
            memory.buffer = new ArrayBuffer(64);
            return 16;
        },
    };
    lower.lowerFlatStringAny(codecs, ctx);
    const view = new DataView(memory.buffer);
    expect(view.getUint32(0, true)).toBe(16);
    expect(view.getUint32(4, true)).toBe(value === '🚀' ? 0x80000002 : value.length);
    expect(ctx.storagePtr).toBe(8);
    const lifted = lift.liftFlatStringAny(
        { utf8: initializeUtf8Decoder(), utf16: initializeUtf16Decoder() },
        {
            componentIdx: 0,
            params: [],
            useDirectParams: false,
            memory,
            storagePtr: 0,
            storageLen: 8,
            stringEncoding: 'compact-utf16',
        },
    );
    expect(lifted[0]).toBe(value);
    expect(lifted[1].storagePtr).toBe(8);
});
