import { registerScalarLift, scalarLiftValue } from './scalar-lift.js';
import { consumeParams, readParam, remainingParams, copyParams, takeParam, hasParamCursor } from './flat-params.js';
import { memoryView } from './memory-view.js';
import type {
    LiftModule,
    StreamReadableEnd,
    StreamWritableEnd,
    TaskLiftContext,
    LiftRecordMeta,
    LiftVariantMeta,
    LiftListMeta,
    LiftMapMeta,
    LiftTupleMeta,
    LiftFlagsMeta,
    LiftOwnMeta,
    LiftFutureMeta,
    LiftStreamMeta,
    LiftVariantContext,
    LiftStringContext,
    RuntimeMemory,
    LiftFutureContext,
    LiftStreamContext,
    LiftErrorContext,
    LiftListContext,
    LocalErrorContext,
    LiftFlagsContext,
} from '../runtime.js';
import { getStreamEnd } from './stream/state.js';
import { getFutureEnd } from './future/state.js';
import { debugLog } from './core/debug.js';
import { compactUtf16Decode } from './string.js';
import { i32ToChar } from './conversion.js';
import { getOrCreateAsyncState } from './component.js';
import { errCtxGetLocalTable, errCtxGlobalRefCountAdd } from './error-context.js';

/** Decode UTF-8 while distinguishing malformed bytes from truncated sequences. */
export const decodeUtf8: LiftModule['decodeUtf8'] = (RuntimeError, decoder, input) => {
    try {
        return decoder.decode(input);
    } catch (error) {
        if (!(error instanceof TypeError)) {
            throw error;
        }
        let bytes: Uint8Array;
        try {
            bytes = ArrayBuffer.isView(input)
                ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
                : new Uint8Array(input);
        } catch {
            throw error;
        }

        // Fatal codecs do not distinguish malformed data from truncated prefixes.
        // Preserve provider errors when the input is valid.
        for (let i = 0; i < bytes.length; i++) {
            const lead = bytes[i];
            if (lead < 0x80) {
                continue;
            }
            const count =
                lead >= 0xc2 && lead <= 0xdf
                    ? 1
                    : lead >= 0xe0 && lead <= 0xef
                      ? 2
                      : lead >= 0xf0 && lead <= 0xf4
                        ? 3
                        : -1;
            if (count < 0) {
                throw new RuntimeError('invalid utf-8');
            }
            for (let j = 1; j <= count; j++) {
                if (i + j >= bytes.length) {
                    throw new RuntimeError('incomplete utf-8 byte sequence');
                }
                const byte = bytes[i + j];
                if (
                    byte < 0x80 ||
                    byte > 0xbf ||
                    (j === 1 &&
                        ((lead === 0xe0 && byte < 0xa0) ||
                            (lead === 0xed && byte > 0x9f) ||
                            (lead === 0xf0 && byte < 0x90) ||
                            (lead === 0xf4 && byte > 0x8f)))
                ) {
                    throw new RuntimeError('invalid utf-8');
                }
            }
            i += count;
        }
        throw error;
    }
};

export const initializeLiftVariant: LiftModule['initializeLiftVariant'] = () => ({
    scratch: new DataView(new ArrayBuffer(8)),
});

let registeredBool: boolean;
export function liftFlatBool(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredBool) {
        registeredBool = registerScalarLift(liftFlatBool, liftFlatBoolDirect, liftFlatBoolMemory);
    }
    return [ctx.useDirectParams ? liftFlatBoolDirect(ctx) : liftFlatBoolMemory(ctx), ctx];
}

function liftFlatBoolDirect(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatBool()] args', { ctx });
    let val;

    if (remainingParams(ctx) === 0) {
        throw new Error('expected at least a single i32 argument');
    }
    val = readParam(ctx, 0) === 1;
    consumeParams(ctx, 1);
    return val;
}

function liftFlatBoolMemory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatBool()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 1) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (bool requires 1 byte)`);
    }

    val = memoryView(ctx).getUint8(ctx.storagePtr!) === 1;

    ctx.storagePtr! += 1;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 1;
    }

    return val;
}

let registeredS8: boolean;
export function liftFlatS8(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredS8) {
        registeredS8 = registerScalarLift(liftFlatS8, liftFlatS8Direct, liftFlatS8Memory);
    }
    if (ctx.useDirectParams) {
        DEBUG: debugLog('[_liftFlatS8()] args', { ctx });
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i32 argument');
        }
        const value = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [value, ctx];
    }
    return [liftFlatS8Memory(ctx), ctx];
}

function liftFlatS8Direct(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatS8()] args', { ctx });
    return takeParam(ctx, 'expected at least a single i32 argument');
}

function liftFlatS8Memory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatS8()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 1) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s8 requires 1 byte)`);
    }

    val = memoryView(ctx).getInt8(ctx.storagePtr!);
    ctx.storagePtr! += 1;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 1;
    }

    return val;
}

let registeredU8: boolean;
export function liftFlatU8(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredU8) {
        registeredU8 = registerScalarLift(liftFlatU8, liftFlatU8Direct, liftFlatU8Memory);
    }
    if (ctx.useDirectParams) {
        DEBUG: debugLog('[_liftFlatU8()] args', { ctx });
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i32 argument');
        }
        const value = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [value, ctx];
    }
    return [liftFlatU8Memory(ctx), ctx];
}

function liftFlatU8Value(ctx: TaskLiftContext): unknown {
    return ctx.useDirectParams ? liftFlatU8Direct(ctx) : liftFlatU8Memory(ctx);
}

function liftFlatU8Direct(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatU8()] args', { ctx });
    return takeParam(ctx, 'expected at least a single i32 argument');
}

function liftFlatU8Memory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatU8()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 1) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u8 requires 1 byte)`);
    }

    val = memoryView(ctx).getUint8(ctx.storagePtr!);

    ctx.storagePtr! += 1;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 1;
    }

    return val;
}

let registeredS16: boolean;
export function liftFlatS16(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredS16) {
        registeredS16 = registerScalarLift(liftFlatS16, liftFlatS16Direct, liftFlatS16Memory);
    }
    if (ctx.useDirectParams) {
        DEBUG: debugLog('[_liftFlatS16()] args', { ctx });
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i32 argument');
        }
        const value = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [value, ctx];
    }
    return [liftFlatS16Memory(ctx), ctx];
}

function liftFlatS16Direct(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatS16()] args', { ctx });
    return takeParam(ctx, 'expected at least a single i32 argument');
}

function liftFlatS16Memory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatS16()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 2) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s16 requires 2 bytes)`);
    }

    val = memoryView(ctx).getInt16(ctx.storagePtr!, true);
    ctx.storagePtr! += 2;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 2;
    }

    return val;
}

let registeredU16: boolean;
export function liftFlatU16(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredU16) {
        registeredU16 = registerScalarLift(liftFlatU16, liftFlatU16Direct, liftFlatU16Memory);
    }
    if (ctx.useDirectParams) {
        DEBUG: debugLog('[_liftFlatU16()] args', { ctx });
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i32 argument');
        }
        const value = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [value, ctx];
    }
    return [liftFlatU16Memory(ctx), ctx];
}

function liftFlatU16Value(ctx: TaskLiftContext): unknown {
    return ctx.useDirectParams ? liftFlatU16Direct(ctx) : liftFlatU16Memory(ctx);
}

function liftFlatU16Direct(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatU16()] args', { ctx });
    return takeParam(ctx, 'expected at least a single i32 argument');
}

function liftFlatU16Memory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatU16()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 2) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u16 requires 2 bytes)`);
    }

    val = memoryView(ctx).getUint16(ctx.storagePtr!, true);

    ctx.storagePtr! += 2;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 2;
    }

    const rem = ctx.storagePtr! % 2;
    if (rem !== 0) {
        ctx.storagePtr! += 2 - rem;
    }

    return val;
}

let registeredS32: boolean;
export function liftFlatS32(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredS32) {
        registeredS32 = registerScalarLift(liftFlatS32, liftFlatS32Direct, liftFlatS32Memory);
    }
    if (ctx.useDirectParams) {
        DEBUG: debugLog('[_liftFlatS32()] args', { ctx });
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i32 argument');
        }
        const value = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [value, ctx];
    }
    return [liftFlatS32Memory(ctx), ctx];
}

function liftFlatS32Direct(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatS32()] args', { ctx });
    return takeParam(ctx, 'expected at least a single i32 argument');
}

function liftFlatS32Memory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatS32()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 4) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s32 requires 4 bytes)`);
    }

    val = memoryView(ctx).getInt32(ctx.storagePtr!, true);
    ctx.storagePtr! += 4;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 4;
    }

    return val;
}

let registeredU32: boolean;
export function liftFlatU32(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredU32) {
        registeredU32 = registerScalarLift(liftFlatU32, liftFlatU32Direct, liftFlatU32Memory);
    }
    return [ctx.useDirectParams ? liftFlatU32Direct(ctx) : liftFlatU32Memory(ctx), ctx];
}

function liftFlatU32Value(ctx: TaskLiftContext): unknown {
    return ctx.useDirectParams ? liftFlatU32Direct(ctx) : liftFlatU32Memory(ctx);
}

function liftFlatU32Direct(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatU32()] args', { ctx });
    let val;

    if (remainingParams(ctx) === 0) {
        throw new Error('expected at least a single i34 argument');
    }
    // core i32 values arrive as signed numbers
    val = (readParam(ctx, 0) as number) >>> 0;
    consumeParams(ctx, 1);
    return val;
}

function liftFlatU32Memory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatU32()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 4) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u32 requires 4 bytes)`);
    }
    val = memoryView(ctx).getUint32(ctx.storagePtr!, true);
    ctx.storagePtr! += 4;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 4;
    }

    return val;
}

let registeredS64: boolean;
export function liftFlatS64(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredS64) {
        registeredS64 = registerScalarLift(liftFlatS64, liftFlatS64Direct, liftFlatS64Memory);
    }
    return [ctx.useDirectParams ? liftFlatS64Direct(ctx) : liftFlatS64Memory(ctx), ctx];
}

function liftFlatS64Direct(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatS64()] args', { ctx });
    let val;

    if (remainingParams(ctx) === 0) {
        throw new Error('expected at least one single i64 argument');
    }
    if (typeof readParam(ctx, 0) !== 'bigint') {
        throw new Error('expected bigint');
    }
    val = readParam(ctx, 0);
    consumeParams(ctx, 1);
    return val;
}

function liftFlatS64Memory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatS64()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s64 requires 8 bytes)`);
    }

    val = memoryView(ctx).getBigInt64(ctx.storagePtr!, true);
    ctx.storagePtr! += 8;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 8;
    }

    return val;
}

let registeredU64: boolean;
export function liftFlatU64(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredU64) {
        registeredU64 = registerScalarLift(liftFlatU64, liftFlatU64Direct, liftFlatU64Memory);
    }
    return [ctx.useDirectParams ? liftFlatU64Direct(ctx) : liftFlatU64Memory(ctx), ctx];
}

function liftFlatU64Direct(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatU64()] args', { ctx });
    let val;

    if (remainingParams(ctx) === 0) {
        throw new Error('expected at least one single i64 argument');
    }
    if (typeof readParam(ctx, 0) !== 'bigint') {
        throw new Error('expected bigint');
    }
    // core i64 values arrive as signed BigInts
    val = BigInt.asUintN(64, readParam(ctx, 0) as bigint);
    consumeParams(ctx, 1);
    return val;
}

function liftFlatU64Memory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatU64()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u64 requires 8 bytes)`);
    }

    val = memoryView(ctx).getBigUint64(ctx.storagePtr!, true);
    ctx.storagePtr! += 8;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 8;
    }

    return val;
}

let registeredFloat32: boolean;
export function liftFlatFloat32(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredFloat32) {
        registeredFloat32 = registerScalarLift(liftFlatFloat32, liftFlatFloat32Direct, liftFlatFloat32Memory);
    }
    return [ctx.useDirectParams ? liftFlatFloat32Direct(ctx) : liftFlatFloat32Memory(ctx), ctx];
}

function liftFlatFloat32Direct(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatFloat32()] args', { ctx });
    let val;

    if (remainingParams(ctx) === 0) {
        throw new Error('expected at least one single f32 argument');
    }
    val = readParam(ctx, 0);
    consumeParams(ctx, 1);

    return val;
}

function liftFlatFloat32Memory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatFloat32()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 4) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (f32 requires 4 bytes)`);
    }

    val = memoryView(ctx).getFloat32(ctx.storagePtr!, true);

    ctx.storagePtr! += 4;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 4;
    }

    return val;
}

let registeredFloat64: boolean;
export function liftFlatFloat64(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredFloat64) {
        registeredFloat64 = registerScalarLift(liftFlatFloat64, liftFlatFloat64Direct, liftFlatFloat64Memory);
    }
    return [ctx.useDirectParams ? liftFlatFloat64Direct(ctx) : liftFlatFloat64Memory(ctx), ctx];
}

function liftFlatFloat64Direct(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatFloat64()] args', { ctx });
    let val;

    if (remainingParams(ctx) === 0) {
        throw new Error('expected at least one single f64 argument');
    }
    val = readParam(ctx, 0);
    consumeParams(ctx, 1);

    return val;
}

function liftFlatFloat64Memory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatFloat64()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (f64 requires 8 bytes)`);
    }

    val = memoryView(ctx).getFloat64(ctx.storagePtr!, true);
    ctx.storagePtr! += 8;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 8;
    }

    return val;
}

let registeredChar: boolean;
export function liftFlatChar(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    if (!registeredChar) {
        registeredChar = registerScalarLift(liftFlatChar, liftFlatCharDirect, liftFlatCharMemory);
    }
    return [ctx.useDirectParams ? liftFlatCharDirect(ctx) : liftFlatCharMemory(ctx), ctx];
}

function liftFlatCharDirect(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatChar()] args', { ctx });
    let val;

    if (remainingParams(ctx) === 0) {
        throw new Error('expected at least one single i32 argument');
    }
    val = i32ToChar(readParam(ctx, 0) as number);
    consumeParams(ctx, 1);
    return val;
}

function liftFlatCharMemory(ctx: TaskLiftContext): unknown {
    DEBUG: debugLog('[_liftFlatChar()] args', { ctx });
    let val;

    if (ctx.storageLen !== undefined && ctx.storageLen < 4) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (char requires 4 bytes)`);
    }

    val = i32ToChar(memoryView(ctx).getUint32(ctx.storagePtr!, true));
    ctx.storagePtr! += 4;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 4;
    }

    return val;
}

export function liftFlatStringAny(_context: LiftStringContext, ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    switch (ctx.stringEncoding) {
        case 'utf8':
            return liftFlatStringUTF8(_context, ctx);
        case 'utf16':
            return liftFlatStringUTF16(_context, ctx);
        case 'compact-utf16': {
            const [ptr, ptrCtx] = liftFlatU32(ctx);
            const [len, newCtx] = liftFlatU32(ptrCtx);
            return [compactUtf16Decode(_context.utf16, ctx.memory!, ptr as number, len as number), newCtx];
        }
        default:
            throw new Error(`missing/unrecognized/unsupported string encoding [${ctx.stringEncoding}]`);
    }
}

/** Traps on a string whose code units are misaligned or not wholly inside the memory. */
function requireStringInMemory(
    RuntimeError: LiftStringContext['RuntimeError'],
    memory: RuntimeMemory,
    offset: number,
    codeUnits: number,
    unitSize: number,
) {
    if (offset % unitSize !== 0) {
        throw new RuntimeError('wasm trap: unaligned pointer');
    }
    const byteLength = memory.buffer.byteLength;
    if (offset > byteLength || codeUnits < 0 || codeUnits > Math.floor((byteLength - offset) / unitSize)) {
        throw new RuntimeError('string pointer/length out of bounds of memory');
    }
}

export function liftFlatStringUTF8(_context: LiftStringContext, ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    DEBUG: debugLog('[_liftFlatStringUTF8()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (remainingParams(ctx) < 2) {
            throw new Error('expected at least two u32 arguments');
        }
        let offset = readParam(ctx, 0) as number | bigint;
        if (typeof offset === 'bigint') {
            offset = Number(offset);
        } else {
            offset >>>= 0;
        }
        if (!Number.isSafeInteger(offset)) {
            throw new Error('invalid offset');
        }
        const len = readParam(ctx, 1) as number;
        if (!Number.isSafeInteger(len)) {
            throw new Error('invalid len');
        }
        requireStringInMemory(_context.RuntimeError, ctx.memory!, offset, len, 1);
        val = decodeUtf8(_context.RuntimeError, _context.utf8, new DataView(ctx.memory!.buffer, offset, len));
        consumeParams(ctx, 2);
        return [val, ctx];
    }

    const rem = ctx.storagePtr! % 4;
    if (rem !== 0) {
        ctx.storagePtr! += 4 - rem;
    }

    const dv = memoryView(ctx);
    const start = dv.getUint32(ctx.storagePtr!, true);
    const codeUnits = dv.getUint32(ctx.storagePtr! + 4, true);

    requireStringInMemory(_context.RuntimeError, ctx.memory!, start, codeUnits, 1);
    val = decodeUtf8(_context.RuntimeError, _context.utf8, new Uint8Array(ctx.memory!.buffer, start, codeUnits));

    ctx.storagePtr! += 8;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 8;
    }

    return [val, ctx];
}

export function liftFlatStringUTF16(_context: LiftStringContext, ctx: TaskLiftContext): [unknown, TaskLiftContext] {
    DEBUG: debugLog('[_liftFlatStringUTF16()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (remainingParams(ctx) < 2) {
            throw new Error('expected at least two u32 arguments');
        }
        let offset = readParam(ctx, 0) as number | bigint;
        if (typeof offset === 'bigint') {
            offset = Number(offset);
        } else {
            offset >>>= 0;
        }
        if (!Number.isSafeInteger(offset)) {
            throw new Error('invalid offset');
        }
        const len = readParam(ctx, 1) as number;
        if (!Number.isSafeInteger(len)) {
            throw new Error('invalid len');
        }
        requireStringInMemory(_context.RuntimeError, ctx.memory!, offset, len, 2);
        val = _context.utf16.decode(new DataView(ctx.memory!.buffer, offset, len * 2));
        consumeParams(ctx, 2);
        return [val, ctx];
    }

    const rem = ctx.storagePtr! % 4;
    if (rem !== 0) {
        ctx.storagePtr! += 4 - rem;
    }

    const dv = memoryView(ctx);
    const start = dv.getUint32(ctx.storagePtr!, true);
    const codeUnits = dv.getUint32(ctx.storagePtr! + 4, true);

    requireStringInMemory(_context.RuntimeError, ctx.memory!, start, codeUnits, 2);
    val = _context.utf16.decode(new DataView(ctx.memory!.buffer, start, codeUnits * 2));

    ctx.storagePtr! += 8;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 8;
    }

    return [val, ctx];
}

export function liftFlatRecord(meta: LiftRecordMeta): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    const { fieldMetas, size32: recordSize32, align32: recordAlign32 } = meta;
    return function liftFlatRecordInner(ctx: TaskLiftContext): [unknown, TaskLiftContext] {
        DEBUG: debugLog('[_liftFlatRecord()] args', { ctx });

        const originalPtr = ctx.storagePtr!;
        const res: Record<string, unknown> = {};
        const useScalars = !ctx.useDirectParams || hasParamCursor(ctx);
        for (const [key, liftFn, size32, align32] of fieldMetas) {
            let fieldPtr;
            if (ctx.storagePtr! !== undefined) {
                const rem = ctx.storagePtr! % align32;
                if (rem !== 0) {
                    ctx.storagePtr! += align32 - rem;
                }
                fieldPtr = ctx.storagePtr!;
            }

            // A field occupies exactly size32 bytes of the record's
            // flat storage. Capture the remaining storage budget before
            // lifting the field and restore it afterwards: a field's own
            // lift fn may repurpose storageLen internally (e.g. a list
            // sets it to the element-buffer length while reading
            // out-of-line data and never restores it), which would
            // otherwise corrupt the budget the next field sees.
            // See https://github.com/bytecodealliance/jco/issues/1585.
            let fieldLen;
            if (ctx.storageLen !== undefined) {
                fieldLen = ctx.storageLen;
            }

            const scalar = useScalars ? scalarLiftValue(liftFn, ctx.useDirectParams) : undefined;
            if (scalar) {
                res[key] = scalar(ctx);
            } else {
                const [val, newCtx] = liftFn(ctx);
                res[key] = val;
                ctx = newCtx;
            }

            if (fieldPtr !== undefined) {
                ctx.storagePtr! = Math.max(ctx.storagePtr!, fieldPtr + size32);
            }
            if (fieldLen !== undefined) {
                ctx.storageLen = fieldLen - size32;
            }
        }

        if (originalPtr !== undefined) {
            ctx.storagePtr! = Math.max(ctx.storagePtr!, originalPtr + recordSize32);
        }

        if (ctx.storagePtr! !== undefined) {
            const rem = ctx.storagePtr! % recordAlign32;
            if (rem !== 0) {
                ctx.storagePtr! += recordAlign32 - rem;
            }
        }

        return [res, ctx];
    };
}

export function liftFlatVariant(
    _context: LiftVariantContext,
    meta: LiftVariantMeta,
): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    const {
        caseMetas,
        variantSize32,
        variantAlign32,
        variantPayloadOffset32,
        variantFlatCount,
        variantPayloadFlatTypes,
        isEnum,
    } = meta;

    return function liftFlatVariantInner(ctx) {
        DEBUG: debugLog('[_liftFlatVariant()] args', { ctx });
        const origUseParams = ctx.useDirectParams;

        let caseIdx: number;
        const originalPtr = ctx.storagePtr!;
        const numCases = caseMetas.length;
        if (caseMetas.length < 256) {
            caseIdx = liftFlatU8Value(ctx) as number;
        } else if (numCases >= 256 && numCases < 65536) {
            caseIdx = liftFlatU16Value(ctx) as number;
        } else if (numCases >= 65536 && numCases < 4_294_967_296) {
            caseIdx = liftFlatU32Value(ctx) as number;
        } else {
            throw new Error(`unsupported number of variant cases [${numCases}]`);
        }

        const [tag, liftFn, , , caseFlatCount, caseFlatTypes] = caseMetas[caseIdx];

        if (variantPayloadOffset32 === undefined) {
            throw new Error('unexpectedly missing payload offset');
        }

        if (originalPtr !== undefined) {
            ctx.storagePtr = originalPtr + variantPayloadOffset32;
        }

        let val;
        if (liftFn === null) {
            val = { tag };
            // NOTE: here we need to move past the entire object in memory
            // despite moving to the payload which we now know is missing/unnecessary
            if (originalPtr !== undefined) {
                ctx.storagePtr = originalPtr + variantSize32;
            }
        } else {
            // When lifting from direct params, the payload arrives as the
            // *join* of all case flat representations: each slot whose
            // joined core type differs from the selected case's core type
            // must be reinterpreted before the payload lift
            // (see CanonicalABI `lift_flat_variant`)
            if (ctx.useDirectParams) {
                if (!variantPayloadFlatTypes || !caseFlatTypes) {
                    throw new Error('missing variant flat type metadata during direct-param lift');
                }
                const scratch = _context.scratch;
                for (let i = 0; i < caseFlatTypes.length; i++) {
                    const have = variantPayloadFlatTypes[i];
                    const want = caseFlatTypes[i];
                    if (have === want) {
                        continue;
                    }
                    const val = readParam(ctx, i);
                    if (have === 'i64' && want === 'i32') {
                        ctx.params[i] = Number(BigInt.asIntN(32, val as bigint));
                    } else if (have === 'i64' && want === 'f32') {
                        scratch.setInt32(0, Number(BigInt.asIntN(32, val as bigint)), true);
                        ctx.params[i] = scratch.getFloat32(0, true);
                    } else if (have === 'i64' && want === 'f64') {
                        scratch.setBigInt64(0, val as bigint, true);
                        ctx.params[i] = scratch.getFloat64(0, true);
                    } else if (have === 'i32' && want === 'f32') {
                        scratch.setInt32(0, val as number, true);
                        ctx.params[i] = scratch.getFloat32(0, true);
                    } else {
                        throw new Error(`invalid variant payload coercion [${have}] -> [${want}]`);
                    }
                }
            }

            const [newVal, newCtx] = liftFn(ctx);
            val = { tag, val: newVal };
            ctx = newCtx;
        }

        if (origUseParams) {
            if (variantFlatCount === undefined || variantFlatCount === null) {
                DEBUG: debugLog('[_liftFlatVariant()] variant with unknown flat count', { ctx, meta });
                throw new Error('cannot lift variant with unknown flat count');
            }
            if (caseFlatCount === undefined || caseFlatCount === null) {
                DEBUG: debugLog('[_liftFlatVariant()] case with unknown flat count', {
                    ctx,
                    meta,
                    case: meta.caseMetas[caseIdx],
                });
                throw new Error('cannot lift case with unknown flat count');
            }
            // NOTE: enums can be tightly packed and do not have a descriminant
            const remainingPayloadParams = variantFlatCount - caseFlatCount - (isEnum ? 0 : 1);
            if (remainingPayloadParams < 0) {
                throw new Error(`invalid variant flat count metadata`);
            }
            if (remainingParams(ctx) < remainingPayloadParams) {
                throw new Error(
                    `expected at least [${remainingPayloadParams}] remaining variant payload params, but got [${remainingParams(ctx)}]`,
                );
            }
            consumeParams(ctx, remainingPayloadParams);
        }

        if (ctx.storagePtr! !== undefined) {
            const rem = ctx.storagePtr! % variantAlign32;
            if (rem !== 0) {
                ctx.storagePtr! += variantAlign32 - rem;
            }
        }

        return [val, ctx];
    };
}

export function liftFlatList(
    _context: LiftListContext,
    meta: LiftListMeta,
): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    const { elemLiftFn, elemSize32, elemAlign32, knownLen, typedArray } = meta;

    const listValue =
        typedArray === undefined
            ? (values: unknown[]) => values
            : (values: unknown[]) => new typedArray(values as never[]);

    const readValuesAndReset = (
        ctx: TaskLiftContext,
        originalPtr: number | null | undefined,
        originalLen: number | null | undefined,
        dataPtr: number,
        len: number,
    ): [unknown, TaskLiftContext] => {
        if (
            dataPtr < 0 ||
            len < 0 ||
            (elemSize32 !== 0 && len > Math.floor(((1 << 28) - 1) / elemSize32)) ||
            dataPtr > ctx.memory!.buffer.byteLength ||
            (elemSize32 !== 0 && len > Math.floor((ctx.memory!.buffer.byteLength - dataPtr) / elemSize32))
        ) {
            throw new _context.RuntimeError('wasm trap: out of bounds memory access');
        }
        if (dataPtr % elemAlign32 !== 0) {
            throw new TypeError(`list pointer [${dataPtr}] is not aligned to ${elemAlign32}`);
        }
        ctx.storagePtr! = dataPtr;
        let val: unknown;
        if (typedArray !== undefined && (_context.littleEndian || elemSize32 === 1)) {
            // Copy numeric elements together while keeping the result independent of guest memory.
            // Slicing a view copies short lists faster than slicing the buffer,
            // and the copy is unshared even when the memory is shared.
            ctx.storagePtr = dataPtr + len * elemSize32;
            val = new typedArray(ctx.memory!.buffer, dataPtr, len).slice();
        } else {
            const values = [];
            // A scalar lift keeps the context it is given, so one lookup serves every element.
            const scalar = scalarLiftValue(elemLiftFn, ctx.useDirectParams);
            for (let i = 0; i < len; i++) {
                const elemPtr = dataPtr + i * elemSize32;
                ctx.storagePtr = elemPtr;
                if (scalar) {
                    values.push(scalar(ctx));
                } else {
                    const [res, nextCtx] = elemLiftFn(ctx);
                    values.push(res);
                    ctx = nextCtx;
                }

                ctx.storagePtr = Math.max(ctx.storagePtr!, elemPtr + elemSize32);
            }
            val = listValue(values);
        }
        if (originalPtr !== null) {
            ctx.storagePtr = originalPtr;
        }
        if (originalLen !== null) {
            ctx.storageLen = originalLen;
        }
        return [val, ctx];
    };

    return function liftFlatListInner(ctx) {
        DEBUG: debugLog('[_liftFlatList()] args', { ctx });

        let liftResults: [unknown, TaskLiftContext];
        if (knownLen !== undefined) {
            // list with known length
            if (ctx.useDirectParams) {
                DEBUG: debugLog('memory unexpectedly missing while lifting unknown length list', { ctx });
                liftResults = [listValue(copyParams(ctx, knownLen)), ctx];
                consumeParams(ctx, knownLen);
            } else {
                // indirect params
                if (ctx.memory === null) {
                    DEBUG: debugLog('memory unexpectedly missing while lifting known length list', { knownLen, ctx });
                    throw new Error(`memory missing while lifting known length (${knownLen}) list`);
                }

                const originalLen = ctx.storageLen;

                ctx.storageLen = knownLen * elemSize32;
                liftResults = readValuesAndReset(ctx, null, originalLen, ctx.storagePtr!, knownLen);
            }
        } else {
            // unknown length list

            if (ctx.useDirectParams) {
                // unknown length list ptr w/ direct params
                const dataPtr = (readParam(ctx, 0) as number) >>> 0;
                const len = readParam(ctx, 1) as number;
                consumeParams(ctx, 2);

                ctx.useDirectParams = false;
                const originalPtr = ctx.storagePtr!;
                const originalLen = ctx.storageLen;
                ctx.storageLen = len * elemSize32;

                liftResults = readValuesAndReset(ctx, originalPtr, originalLen, dataPtr, len);

                ctx.useDirectParams = true;
            } else {
                // unknown length list ptr w/ in-memory params
                const originalLen = ctx.storageLen;
                ctx.storageLen = 8;

                const dataPtr = liftFlatU32Value(ctx) as number;
                const len = liftFlatU32Value(ctx) as number;

                const originalPtr = ctx.storagePtr!;
                ctx.storagePtr! = dataPtr;

                ctx.storageLen = len * elemSize32;
                liftResults = readValuesAndReset(ctx, originalPtr, originalLen, dataPtr, len);
            }
        }

        return liftResults;
    };
}

export function liftFlatMap(meta: LiftMapMeta): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    const { keyLiftFn, valueLiftFn, entrySize32, valueOffset32 } = meta;

    const readEntriesAndReset = (
        ctx: TaskLiftContext,
        originalPtr: number | null | undefined,
        originalLen: number | null | undefined,
        dataPtr: number,
        len: number,
    ): [unknown, TaskLiftContext] => {
        const val = new Map();
        for (let i = 0; i < len; i++) {
            const entryPtr = dataPtr + i * entrySize32;
            ctx.storagePtr! = entryPtr;
            const [key, keyCtx] = keyLiftFn(ctx);
            ctx = keyCtx;
            ctx.storagePtr! = entryPtr + valueOffset32;
            const [value, valueCtx] = valueLiftFn(ctx);
            ctx = valueCtx;
            val.set(key, value);
        }
        if (originalPtr !== null) {
            ctx.storagePtr = originalPtr;
        }
        if (originalLen !== null) {
            ctx.storageLen = originalLen;
        }
        return [val, ctx];
    };

    return function liftFlatMapInner(ctx) {
        DEBUG: debugLog('[_liftFlatMap()] args', { ctx });

        let dataPtr;
        let len;
        let originalPtr = ctx.storagePtr!;
        const originalLen = ctx.storageLen;
        if (ctx.useDirectParams) {
            dataPtr = (readParam(ctx, 0) as number) >>> 0;
            len = readParam(ctx, 1) as number;
            consumeParams(ctx, 2);
        } else {
            ctx.storageLen = 8;
            dataPtr = liftFlatU32Value(ctx) as number;
            len = liftFlatU32Value(ctx) as number;
            originalPtr = ctx.storagePtr!;
        }

        const wasDirect = ctx.useDirectParams;
        ctx.useDirectParams = false;
        ctx.storageLen = len * entrySize32;
        const result = readEntriesAndReset(ctx, originalPtr, originalLen, dataPtr, len);
        result[1].useDirectParams = wasDirect;
        return result;
    };
}

export function liftFlatTuple(meta: LiftTupleMeta): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    const { elemLiftFns, size32: tupleSize32, align32: tupleAlign32 } = meta;
    return function liftFlatTupleInner(ctx) {
        DEBUG: debugLog('[_liftFlatTuple()] args', { ctx });

        const originalPtr = ctx.storagePtr!;
        const val = [];
        for (const [liftFn, size32, align32] of elemLiftFns) {
            let elemPtr;
            if (ctx.storagePtr! !== undefined) {
                const rem = ctx.storagePtr! % align32;
                if (rem !== 0) {
                    ctx.storagePtr! += align32 - rem;
                }
                elemPtr = ctx.storagePtr!;
            }

            // As in _liftFlatRecord: an element occupies exactly size32
            // bytes of the tuple's flat storage, so capture and restore
            // the storage budget around the element lift to stop a
            // field's internal storageLen use (e.g. lists) leaking into
            // the next element.
            // See https://github.com/bytecodealliance/jco/issues/1585.
            let elemLen;
            if (ctx.storageLen !== undefined) {
                elemLen = ctx.storageLen;
            }

            const scalar = scalarLiftValue(liftFn, ctx.useDirectParams);
            if (scalar) {
                val.push(scalar(ctx));
            } else {
                const [newValue, newCtx] = liftFn(ctx);
                val.push(newValue);
                ctx = newCtx;
            }

            if (elemPtr !== undefined) {
                ctx.storagePtr! = Math.max(ctx.storagePtr!, elemPtr + size32);
            }
            if (elemLen !== undefined) {
                ctx.storageLen = elemLen - size32;
            }
        }

        if (originalPtr !== undefined) {
            ctx.storagePtr! = Math.max(ctx.storagePtr!, originalPtr + tupleSize32);
        }

        if (ctx.storagePtr! !== undefined) {
            const rem = ctx.storagePtr! % tupleAlign32;
            if (rem !== 0) {
                ctx.storagePtr! += tupleAlign32 - rem;
            }
        }

        return [val, ctx];
    };
}

export function liftFlatEnum(
    _context: LiftVariantContext,
    meta: LiftVariantMeta,
): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    meta.isEnum = true;
    const f = liftFlatVariant(_context, meta);
    return function liftFlatEnumInner(ctx) {
        DEBUG: debugLog('[_liftFlatEnum()] args', { ctx });
        const res = f(ctx);
        res[0] = (res[0] as { tag: string }).tag;
        return res;
    };
}

export function liftFlatOption(
    _context: LiftVariantContext,
    meta: LiftVariantMeta,
): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    const { payloadMaybeNull } = meta;
    const f = liftFlatVariant(_context, meta);
    return function liftFlatOptionInner(ctx) {
        DEBUG: debugLog('[_liftFlatOption()] args', { ctx });
        const res = f(ctx);
        if (!payloadMaybeNull) {
            const value = res[0] as { tag: string; val?: unknown };
            res[0] = value.tag === 'none' ? undefined : value.val;
        }
        return res;
    };
}

export function liftFlatResult(
    _context: LiftVariantContext,
    meta: LiftVariantMeta,
): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    const f = liftFlatVariant(_context, meta);
    return function liftFlatResultInner(ctx) {
        DEBUG: debugLog('[_liftFlatResult()] args', { ctx });
        const res = f(ctx);
        const value = res[0] as { tag: string; val?: unknown };
        if (!('val' in value)) {
            value.val = undefined;
        }
        return res;
    };
}

export function liftFlatFlags(
    _context: LiftFlagsContext,
    meta: LiftFlagsMeta,
): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    const { names, align32, intSizeBytes } = meta;

    return function liftFlatFlagsInner(ctx) {
        DEBUG: debugLog('[_liftFlatFlags()] args', { ctx });

        let val = _context.asBigInt ? null : {};

        let bits: number;
        switch (intSizeBytes) {
            case 1:
                bits = liftFlatU8Value(ctx) as number;
                break;
            case 2:
                bits = liftFlatU16Value(ctx) as number;
                break;
            case 4:
                bits = liftFlatU32Value(ctx) as number;
                break;
            default:
                throw new Error('invalid flags size');
        }

        if (_context.asBigInt) {
            val = BigInt(bits >>> 0);
        } else {
            for (const name of names) {
                (val as Record<string, boolean>)[name] = (bits & 1) === 1;
                bits >>>= 1;
            }
        }

        const rem = ctx.storagePtr! % align32;
        if (rem !== 0) {
            ctx.storagePtr! += align32 - rem;
        }

        return [val, ctx];
    };
}

export function liftFlatOwn(meta: LiftOwnMeta): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    const { classNameFn, createResourceFn, componentIdx, tableIdx } = meta;

    return function liftFlatOwnInner(ctx) {
        DEBUG: debugLog('[_liftFlatOwn()] args', { ctx, className: classNameFn() });

        if (ctx.componentIdx !== componentIdx) {
            throw new Error('invalid component for resource lift');
        }

        const [handle, newCtx] = liftFlatU32(ctx);
        const resource = ctx.liftResource
            ? ctx.liftResource(handle as number, tableIdx)
            : createResourceFn(handle as number);

        return [resource, newCtx];
    };
}

export function liftFlatBorrow(
    componentTableIdx: number,
    size: number,
    memory: unknown,
    vals: unknown[],
    storagePtr: number,
    storageLen: number,
): never {
    DEBUG: debugLog('[_liftFlatBorrow()] args', { size, memory, vals, storagePtr, storageLen });
    throw new Error('flat lift for borrowed resources is not supported!');
}

export function liftFlatFuture(
    _context: LiftFutureContext,
    meta: LiftFutureMeta,
): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    const { futureTableIdx, componentIdx } = meta;

    return function liftFlatFutureInner(ctx) {
        DEBUG: debugLog('[_liftFlatFuture()] args', { ctx });

        const futureMeta = _context.tables[futureTableIdx];
        if (futureMeta.componentIdx !== componentIdx) {
            throw new Error('unexpectedly mismatched component idx');
        }
        const { table } = futureMeta;
        if (componentIdx === undefined || !table) {
            throw new Error(`invalid global future table state for table [${futureTableIdx}]`);
        }

        let futureEndWaitableIdx;
        if (ctx.useDirectParams) {
            futureEndWaitableIdx = readParam(ctx, 0);
            consumeParams(ctx, 1);
        } else {
            const [waitableIdx, newCtx] = liftFlatU32(ctx);
            ctx = newCtx;
            futureEndWaitableIdx = waitableIdx;
        }

        if (futureEndWaitableIdx === undefined) {
            throw new Error('missing future idx');
        }

        const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
        if (!cstate) {
            throw new Error(`missing async state for component [${componentIdx}]`);
        }

        const futureEnd = getFutureEnd(_context, {
            tableIdx: futureTableIdx,
            futureEndWaitableIdx: futureEndWaitableIdx as number,
        });
        if (!futureEnd) {
            throw new Error(
                `missing future end [${futureEndWaitableIdx}] (table [${futureTableIdx}]) in component [${componentIdx}] during lift`,
            );
        }

        if (ctx.isBorrowed) {
            throw new Error('cannot lift flat future of borrowed type');
        }
        if (futureEnd.isWritable()) {
            throw new _context.RuntimeError('only readable futures can be lifted');
        }
        if (futureEnd.isDoneState()) {
            throw new _context.RuntimeError('cannot lift future after previous read succeeded');
        }
        if (!futureEnd.isIdleState()) {
            throw new _context.RuntimeError('futures must be in idle state');
        }
        if (futureEnd.isInSet()) {
            throw new _context.RuntimeError("cannot lift future while it's in a waitable set");
        }

        return [futureEnd.promise(), ctx];
    };
}

export function liftFlatStream(
    _context: LiftStreamContext,
    meta: LiftStreamMeta,
): (ctx: TaskLiftContext) => [unknown, TaskLiftContext] {
    const { streamTableIdx, componentIdx } = meta;

    return function liftFlatStreamInner(ctx) {
        DEBUG: debugLog('[_liftFlatStream()] args', { ctx });

        const streamMeta = _context.tables[streamTableIdx];
        if (streamMeta.componentIdx !== componentIdx) {
            throw new Error('unexpectedly mismatched component idx');
        }
        const { table } = streamMeta;
        if (componentIdx === undefined || !table) {
            throw new Error(`invalid global stream table state for table [${streamTableIdx}]`);
        }

        let streamEndWaitableIdx;
        if (ctx.useDirectParams) {
            streamEndWaitableIdx = readParam(ctx, 0);
            consumeParams(ctx, 1);
        } else {
            const [waitableIdx, newCtx] = liftFlatU32(ctx);
            ctx = newCtx;
            streamEndWaitableIdx = waitableIdx;
        }

        if (!streamEndWaitableIdx) {
            throw new _context.RuntimeError('missing stream idx');
        }

        const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
        if (!cstate) {
            throw new Error(`missing async state for component [${componentIdx}]`);
        }

        const streamEnd = getStreamEnd(_context, {
            tableIdx: streamTableIdx,
            streamEndWaitableIdx: streamEndWaitableIdx as number,
        });
        if (!streamEnd) {
            throw new Error(
                `missing stream end [${streamEndWaitableIdx}] (table [${streamTableIdx}]) in component [${componentIdx}] during lift`,
            );
        }

        if (ctx.isBorrowed) {
            throw new Error('cannot lift flat stream of borrowed type');
        }
        if (streamEnd.isWritable()) {
            throw new _context.RuntimeError('only readable streams can be lifted');
        }
        if (streamEnd.isDoneState()) {
            throw new _context.RuntimeError('cannot lift stream after being notified that the writable end dropped');
        }
        if (!streamEnd.isIdleState()) {
            throw new _context.RuntimeError('streams must be in idle state');
        }
        if (streamEnd.isInSet()) {
            throw new _context.RuntimeError("cannot lift stream while it's in a waitable set");
        }

        const stream = new _context.Stream({
            globalRep: streamEnd.globalStreamMapRep(),
            isReadable: streamEnd.isReadable(),
            isWritable: streamEnd.isWritable(),
            writeFn: (v) => {
                return (streamEnd as StreamWritableEnd).write(v);
            },
            readFn: (opts) => {
                return (streamEnd as StreamReadableEnd).read(opts);
            },
            // A host can dispose an in-flight read after its event has
            // been published but before its polling continuation consumes
            // it. Detach the endpoint without discarding that completion.
            dropFn: () => {
                return streamEnd.drop({ allowPendingEvent: true });
            },
        });

        return [stream, ctx];
    };
}

export function liftFlatErrorContext(
    _context: LiftErrorContext,
    errCtxTableIdx: number,
    ctx: TaskLiftContext,
): [unknown, TaskLiftContext] {
    DEBUG: debugLog('[_liftFlatErrorContext()] ctx', ctx);

    let val;
    let table;
    if (ctx.useDirectParams) {
        if (remainingParams(ctx) === 0) {
            throw new Error('expected at least one single i32 argument');
        }
        val = readParam(ctx, 0);
        consumeParams(ctx, 1);
        table = errCtxGetLocalTable(_context.local, ctx.componentIdx, errCtxTableIdx);
    } else {
        throw new Error('indirect flat lift for error-contexts not yet implemented!');
    }

    let handle = table.get(val as number);
    if (handle === undefined) {
        throw new Error(
            `missing  error ctx (handle [${val}], component [${ctx.componentIdx}], error context table [${errCtxTableIdx}])`,
        );
    }

    const cstate = getOrCreateAsyncState(_context.lookup, ctx.componentIdx);
    const errCtx = cstate.handles.get(handle) as LocalErrorContext | undefined;
    if (!errCtx || errCtx.globalRep === undefined || errCtx.refCount === undefined) {
        throw new Error(`malformed error context (handle [${handle}], component [${ctx.componentIdx}])`);
    }

    errCtx.refCount -= 1;
    // NOTE: we aovoid doing clean up eagerly here

    errCtxGlobalRefCountAdd(_context.globalTable, errCtx.globalRep);
    // The lifted value holds that reference until it is lowered.
    const globalErrCtx = _context.globalTable.get().get(errCtx.globalRep)!;
    globalErrCtx.pendingLifts = (globalErrCtx.pendingLifts ?? 0) + 1;

    return [errCtx.globalRep, ctx];
}
