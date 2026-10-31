import { getStreamEnd } from './stream-state.js';
import { getFutureEnd } from './future-state.js';
import { debugLog } from './core-debug.js';
import { compactUtf16Decode } from './string.js';
import { i32ToChar } from './conversion.js';
import { getOrCreateAsyncState } from './component.js';
import { errCtxGetLocalTable, errCtxGlobalRefCountAdd } from './error-context.js';

export const initializeLiftVariant = () => ({
    scratch: new DataView(new ArrayBuffer(8)),
});

export function liftFlatBool(ctx) {
    debugLog('[liftFlatBool()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i32 argument');
        }
        val = ctx.params[0] === 1;
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 1) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (bool requires 1 byte)`);
    }

    val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr) === 1;

    ctx.storagePtr += 1;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 1;
    }

    return [val, ctx];
}

export function liftFlatS8(ctx) {
    debugLog('[liftFlatS8()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i32 argument');
        }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 1) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s8 requires 1 byte)`);
    }

    val = new DataView(ctx.memory.buffer).getInt8(ctx.storagePtr);
    ctx.storagePtr += 1;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 1;
    }

    return [val, ctx];
}

export function liftFlatU8(ctx) {
    debugLog('[liftFlatU8()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i32 argument');
        }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 1) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u8 requires 1 byte)`);
    }

    val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr);

    ctx.storagePtr += 1;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 1;
    }

    return [val, ctx];
}

export function liftFlatS16(ctx) {
    debugLog('[liftFlatS16()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i32 argument');
        }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 2) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s16 requires 2 bytes)`);
    }

    val = new DataView(ctx.memory.buffer).getInt16(ctx.storagePtr, true);
    ctx.storagePtr += 2;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 2;
    }

    return [val, ctx];
}

export function liftFlatU16(ctx) {
    debugLog('[liftFlatU16()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i32 argument');
        }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 2) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u16 requires 2 bytes)`);
    }

    val = new DataView(ctx.memory.buffer).getUint16(ctx.storagePtr, true);

    ctx.storagePtr += 2;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 2;
    }

    const rem = ctx.storagePtr % 2;
    if (rem !== 0) {
        ctx.storagePtr += 2 - rem;
    }

    return [val, ctx];
}

export function liftFlatS32(ctx) {
    debugLog('[liftFlatS32()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i32 argument');
        }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 4) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s32 requires 4 bytes)`);
    }

    val = new DataView(ctx.memory.buffer).getInt32(ctx.storagePtr, true);
    ctx.storagePtr += 4;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 4;
    }

    return [val, ctx];
}

export function liftFlatU32(ctx) {
    debugLog('[liftFlatU32()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least a single i34 argument');
        }
        // core i32 values arrive as signed numbers
        val = ctx.params[0] >>> 0;
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 4) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u32 requires 4 bytes)`);
    }
    val = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
    ctx.storagePtr += 4;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 4;
    }

    return [val, ctx];
}

export function liftFlatS64(ctx) {
    debugLog('[liftFlatS64()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least one single i64 argument');
        }
        if (typeof ctx.params[0] !== 'bigint') {
            throw new Error('expected bigint');
        }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s64 requires 8 bytes)`);
    }

    val = new DataView(ctx.memory.buffer).getBigInt64(ctx.storagePtr, true);
    ctx.storagePtr += 8;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 8;
    }

    return [val, ctx];
}

export function liftFlatU64(ctx) {
    debugLog('[liftFlatU64()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least one single i64 argument');
        }
        if (typeof ctx.params[0] !== 'bigint') {
            throw new Error('expected bigint');
        }
        // core i64 values arrive as signed BigInts
        val = BigInt.asUintN(64, ctx.params[0]);
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u64 requires 8 bytes)`);
    }

    val = new DataView(ctx.memory.buffer).getBigUint64(ctx.storagePtr, true);
    ctx.storagePtr += 8;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 8;
    }

    return [val, ctx];
}

export function liftFlatFloat32(ctx) {
    debugLog('[liftFlatFloat32()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least one single f32 argument');
        }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);

        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 4) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (f32 requires 4 bytes)`);
    }

    val = new DataView(ctx.memory.buffer).getFloat32(ctx.storagePtr, true);

    ctx.storagePtr += 4;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 4;
    }

    return [val, ctx];
}

export function liftFlatFloat64(ctx) {
    debugLog('[liftFlatFloat64()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least one single f64 argument');
        }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);

        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (f64 requires 8 bytes)`);
    }

    val = new DataView(ctx.memory.buffer).getFloat64(ctx.storagePtr, true);
    ctx.storagePtr += 8;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 8;
    }

    return [val, ctx];
}

export function liftFlatChar(ctx) {
    debugLog('[liftFlatChar()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least one single i32 argument');
        }
        val = i32ToChar(ctx.params[0]);
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
    }

    if (ctx.storageLen !== undefined && ctx.storageLen < 4) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (char requires 4 bytes)`);
    }

    val = i32ToChar(new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true));
    ctx.storagePtr += 4;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 4;
    }

    return [val, ctx];
}

export function liftFlatStringAny(_context, ctx) {
    switch (ctx.stringEncoding) {
        case 'utf8':
            return liftFlatStringUTF8(_context.utf8, ctx);
        case 'utf16':
            return liftFlatStringUTF16(_context.utf16, ctx);
        case 'compact-utf16': {
            const [ptr, ptrCtx] = liftFlatU32(ctx);
            const [len, newCtx] = liftFlatU32(ptrCtx);
            return [compactUtf16Decode(_context.utf16, ctx.memory, ptr, len), newCtx];
        }
        default:
            throw new Error(`missing/unrecognized/unsupported string encoding [${ctx.stringEncoding}]`);
    }
}

export function liftFlatStringUTF8(_context, ctx) {
    debugLog('[liftFlatStringUTF8()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length < 2) {
            throw new Error('expected at least two u32 arguments');
        }
        let offset = ctx.params[0];
        if (typeof offset === 'bigint') {
            offset = Number(offset);
        } else {
            offset >>>= 0;
        }
        if (!Number.isSafeInteger(offset)) {
            throw new Error('invalid offset');
        }
        const len = ctx.params[1];
        if (!Number.isSafeInteger(len)) {
            throw new Error('invalid len');
        }
        val = _context.decode(new DataView(ctx.memory.buffer, offset, len));
        ctx.params = ctx.params.slice(2);
        return [val, ctx];
    }

    const rem = ctx.storagePtr % 4;
    if (rem !== 0) {
        ctx.storagePtr += 4 - rem;
    }

    const dv = new DataView(ctx.memory.buffer);
    const start = dv.getUint32(ctx.storagePtr, true);
    const codeUnits = dv.getUint32(ctx.storagePtr + 4, true);

    val = _context.decode(new Uint8Array(ctx.memory.buffer, start, codeUnits));

    ctx.storagePtr += 8;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 8;
    }

    return [val, ctx];
}

export function liftFlatStringUTF16(_context, ctx) {
    debugLog('[liftFlatStringUTF16()] args', { ctx });
    let val;

    if (ctx.useDirectParams) {
        if (ctx.params.length < 2) {
            throw new Error('expected at least two u32 arguments');
        }
        let offset = ctx.params[0];
        if (typeof offset === 'bigint') {
            offset = Number(offset);
        } else {
            offset >>>= 0;
        }
        if (!Number.isSafeInteger(offset)) {
            throw new Error('invalid offset');
        }
        const len = ctx.params[1];
        if (!Number.isSafeInteger(len)) {
            throw new Error('invalid len');
        }
        val = _context.decode(new DataView(ctx.memory.buffer, offset, len * 2));
        ctx.params = ctx.params.slice(2);
        return [val, ctx];
    }

    const rem = ctx.storagePtr % 4;
    if (rem !== 0) {
        ctx.storagePtr += 4 - rem;
    }

    const dv = new DataView(ctx.memory.buffer);
    const start = dv.getUint32(ctx.storagePtr, true);
    const codeUnits = dv.getUint32(ctx.storagePtr + 4, true);

    val = _context.decode(new DataView(ctx.memory.buffer, start, codeUnits * 2));

    ctx.storagePtr += 8;
    if (ctx.storageLen !== undefined) {
        ctx.storageLen -= 8;
    }

    return [val, ctx];
}

export function liftFlatRecord(meta) {
    const { fieldMetas, size32: recordSize32, align32: recordAlign32 } = meta;
    return function liftFlatRecordInner(ctx) {
        debugLog('[liftFlatRecord()] args', { ctx });

        const originalPtr = ctx.storagePtr;
        const res = {};
        for (const [key, liftFn, size32, align32] of fieldMetas) {
            let fieldPtr;
            if (ctx.storagePtr !== undefined) {
                const rem = ctx.storagePtr % align32;
                if (rem !== 0) {
                    ctx.storagePtr += align32 - rem;
                }
                fieldPtr = ctx.storagePtr;
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

            let [val, newCtx] = liftFn(ctx);
            res[key] = val;
            ctx = newCtx;

            if (fieldPtr !== undefined) {
                ctx.storagePtr = Math.max(ctx.storagePtr, fieldPtr + size32);
            }
            if (fieldLen !== undefined) {
                ctx.storageLen = fieldLen - size32;
            }
        }

        if (originalPtr !== undefined) {
            ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + recordSize32);
        }

        if (ctx.storagePtr !== undefined) {
            const rem = ctx.storagePtr % recordAlign32;
            if (rem !== 0) {
                ctx.storagePtr += recordAlign32 - rem;
            }
        }

        return [res, ctx];
    };
}

export function liftFlatVariant(_context, meta) {
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
        debugLog('[liftFlatVariant()] args', { ctx });
        const origUseParams = ctx.useDirectParams;

        let caseIdx;
        let liftRes;
        const originalPtr = ctx.storagePtr;
        const numCases = caseMetas.length;
        if (caseMetas.length < 256) {
            liftRes = liftFlatU8(ctx);
        } else if (numCases >= 256 && numCases < 65536) {
            liftRes = liftFlatU16(ctx);
        } else if (numCases >= 65536 && numCases < 4_294_967_296) {
            liftRes = liftFlatU32(ctx);
        } else {
            throw new Error(`unsupported number of variant cases [${numCases}]`);
        }
        caseIdx = liftRes[0];
        ctx = liftRes[1];

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
                    const val = ctx.params[i];
                    if (have === 'i64' && want === 'i32') {
                        ctx.params[i] = Number(BigInt.asIntN(32, val));
                    } else if (have === 'i64' && want === 'f32') {
                        scratch.setInt32(0, Number(BigInt.asIntN(32, val)), true);
                        ctx.params[i] = scratch.getFloat32(0, true);
                    } else if (have === 'i64' && want === 'f64') {
                        scratch.setBigInt64(0, val, true);
                        ctx.params[i] = scratch.getFloat64(0, true);
                    } else if (have === 'i32' && want === 'f32') {
                        scratch.setInt32(0, val, true);
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
                debugLog('[liftFlatVariant()] variant with unknown flat count', { ctx, meta });
                throw new Error('cannot lift variant with unknown flat count');
            }
            if (caseFlatCount === undefined || caseFlatCount === null) {
                debugLog('[liftFlatVariant()] case with unknown flat count', {
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
            if (ctx.params.length < remainingPayloadParams) {
                throw new Error(
                    `expected at least [${remainingPayloadParams}] remaining variant payload params, but got [${ctx.params.length}]`,
                );
            }
            ctx.params = ctx.params.slice(remainingPayloadParams);
        }

        if (ctx.storagePtr !== undefined) {
            const rem = ctx.storagePtr % variantAlign32;
            if (rem !== 0) {
                ctx.storagePtr += variantAlign32 - rem;
            }
        }

        return [val, ctx];
    };
}

export function liftFlatList(_context, meta) {
    const { elemLiftFn, elemSize32, elemAlign32, knownLen, typedArray } = meta;

    const listValue = typedArray === undefined ? (values) => values : (values) => new typedArray(values);

    const readValuesAndReset = (ctx, originalPtr, originalLen, dataPtr, len) => {
        if (
            dataPtr < 0 ||
            len < 0 ||
            (elemSize32 !== 0 && len > Math.floor(((1 << 28) - 1) / elemSize32)) ||
            dataPtr > ctx.memory.buffer.byteLength ||
            (elemSize32 !== 0 && len > Math.floor((ctx.memory.buffer.byteLength - dataPtr) / elemSize32))
        ) {
            throw new _context.RuntimeError('wasm trap: out of bounds memory access');
        }
        if (dataPtr % elemAlign32 !== 0) {
            throw new TypeError(`list pointer [${dataPtr}] is not aligned to ${elemAlign32}`);
        }
        ctx.storagePtr = dataPtr;
        const val = [];
        for (var i = 0; i < len; i++) {
            const elemPtr = dataPtr + i * elemSize32;
            ctx.storagePtr = elemPtr;
            const [res, nextCtx] = elemLiftFn(ctx);
            val.push(res);
            ctx = nextCtx;

            ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
        }
        if (originalPtr !== null) {
            ctx.storagePtr = originalPtr;
        }
        if (originalLen !== null) {
            ctx.storageLen = originalLen;
        }
        return [listValue(val), ctx];
    };

    return function liftFlatListInner(ctx) {
        debugLog('[liftFlatList()] args', { ctx });

        let liftResults;
        if (knownLen !== undefined) {
            // list with known length
            if (ctx.useDirectParams) {
                debugLog('memory unexpectedly missing while lifting unknown length list', { ctx });
                liftResults = [listValue(ctx.params.slice(0, knownLen)), ctx];
                ctx.params = ctx.params.slice(knownLen);
            } else {
                // indirect params
                if (ctx.memory === null) {
                    debugLog('memory unexpectedly missing while lifting known length list', { knownLen, ctx });
                    throw new Error(`memory missing while lifting known length (${knownLen}) list`);
                }

                const originalLen = ctx.storageLen;

                ctx.storageLen = knownLen * elemSize32;
                liftResults = readValuesAndReset(ctx, null, originalLen, ctx.storagePtr, knownLen);
            }
        } else {
            // unknown length list

            if (ctx.useDirectParams) {
                // unknown length list ptr w/ direct params
                const dataPtr = ctx.params[0] >>> 0;
                const len = ctx.params[1];
                ctx.params = ctx.params.slice(2);

                ctx.useDirectParams = false;
                const originalPtr = ctx.storagePtr;
                const originalLen = ctx.storageLen;
                ctx.storageLen = len * elemSize32;

                liftResults = readValuesAndReset(ctx, originalPtr, originalLen, dataPtr, len);

                ctx.useDirectParams = true;
            } else {
                // unknown length list ptr w/ in-memory params
                const originalLen = ctx.storageLen;
                ctx.storageLen = 8;

                const dataPtrLiftRes = liftFlatU32(ctx);
                const dataPtr = dataPtrLiftRes[0];
                ctx = dataPtrLiftRes[1];

                const lenLiftRes = liftFlatU32(ctx);
                const len = lenLiftRes[0];
                ctx = lenLiftRes[1];

                const originalPtr = ctx.storagePtr;
                ctx.storagePtr = dataPtr;

                ctx.storageLen = len * elemSize32;
                liftResults = readValuesAndReset(ctx, originalPtr, originalLen, dataPtr, len);
            }
        }

        return liftResults;
    };
}

export function liftFlatMap(meta) {
    const { keyLiftFn, valueLiftFn, entrySize32, valueOffset32 } = meta;

    const readEntriesAndReset = (ctx, originalPtr, originalLen, dataPtr, len) => {
        const val = new Map();
        for (let i = 0; i < len; i++) {
            const entryPtr = dataPtr + i * entrySize32;
            ctx.storagePtr = entryPtr;
            const [key, keyCtx] = keyLiftFn(ctx);
            ctx = keyCtx;
            ctx.storagePtr = entryPtr + valueOffset32;
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
        debugLog('[liftFlatMap()] args', { ctx });

        let dataPtr;
        let len;
        let originalPtr = ctx.storagePtr;
        const originalLen = ctx.storageLen;
        if (ctx.useDirectParams) {
            dataPtr = ctx.params[0] >>> 0;
            len = ctx.params[1];
            ctx.params = ctx.params.slice(2);
        } else {
            ctx.storageLen = 8;
            let lifted = liftFlatU32(ctx);
            dataPtr = lifted[0];
            ctx = lifted[1];
            lifted = liftFlatU32(ctx);
            len = lifted[0];
            ctx = lifted[1];
            originalPtr = ctx.storagePtr;
        }

        const wasDirect = ctx.useDirectParams;
        ctx.useDirectParams = false;
        ctx.storageLen = len * entrySize32;
        const result = readEntriesAndReset(ctx, originalPtr, originalLen, dataPtr, len);
        result[1].useDirectParams = wasDirect;
        return result;
    };
}

export function liftFlatTuple(meta) {
    const { elemLiftFns, size32: tupleSize32, align32: tupleAlign32 } = meta;
    return function liftFlatTupleInner(ctx) {
        debugLog('[liftFlatTuple()] args', { ctx });

        const originalPtr = ctx.storagePtr;
        const val = [];
        for (const [liftFn, size32, align32] of elemLiftFns) {
            let elemPtr;
            if (ctx.storagePtr !== undefined) {
                const rem = ctx.storagePtr % align32;
                if (rem !== 0) {
                    ctx.storagePtr += align32 - rem;
                }
                elemPtr = ctx.storagePtr;
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

            const [newValue, newCtx] = liftFn(ctx);
            val.push(newValue);
            ctx = newCtx;

            if (elemPtr !== undefined) {
                ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + size32);
            }
            if (elemLen !== undefined) {
                ctx.storageLen = elemLen - size32;
            }
        }

        if (originalPtr !== undefined) {
            ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + tupleSize32);
        }

        if (ctx.storagePtr !== undefined) {
            const rem = ctx.storagePtr % tupleAlign32;
            if (rem !== 0) {
                ctx.storagePtr += tupleAlign32 - rem;
            }
        }

        return [val, ctx];
    };
}

export function liftFlatEnum(_context, meta) {
    meta.isEnum = true;
    const f = liftFlatVariant(_context, meta);
    return function liftFlatEnumInner(ctx) {
        debugLog('[liftFlatEnum()] args', { ctx });
        const res = f(ctx);
        res[0] = res[0].tag;
        return res;
    };
}

export function liftFlatOption(_context, meta) {
    const { payloadMaybeNull } = meta;
    const f = liftFlatVariant(_context, meta);
    return function liftFlatOptionInner(ctx) {
        debugLog('[liftFlatOption()] args', { ctx });
        const res = f(ctx);
        if (!payloadMaybeNull) {
            const value = res[0];
            res[0] = value.tag === 'none' ? undefined : value.val;
        }
        return res;
    };
}

export function liftFlatResult(_context, meta) {
    const f = liftFlatVariant(_context, meta);
    return function liftFlatResultInner(ctx) {
        debugLog('[liftFlatResult()] args', { ctx });
        const res = f(ctx);
        const value = res[0];
        if (!('val' in value)) {
            value.val = undefined;
        }
        return res;
    };
}

export function liftFlatFlags(_context, meta) {
    const { names, align32, intSizeBytes } = meta;

    return function liftFlatFlagsInner(ctx) {
        debugLog('[liftFlatFlags()] args', { ctx });

        let val = _context.asBigInt ? null : {};

        let liftRes;
        switch (intSizeBytes) {
            case 1:
                liftRes = liftFlatU8(ctx);
                break;
            case 2:
                liftRes = liftFlatU16(ctx);
                break;
            case 4:
                liftRes = liftFlatU32(ctx);
                break;
            default:
                throw new Error('invalid flags size');
        }
        let bits = liftRes[0];
        ctx = liftRes[1];

        if (_context.asBigInt) {
            val = BigInt(bits >>> 0);
        } else {
            for (const name of names) {
                val[name] = (bits & 1) === 1;
                bits >>>= 1;
            }
        }

        const rem = ctx.storagePtr % align32;
        if (rem !== 0) {
            ctx.storagePtr += align32 - rem;
        }

        return [val, ctx];
    };
}

export function liftFlatOwn(meta) {
    const { classNameFn, createResourceFn, componentIdx, tableIdx } = meta;

    return function liftFlatOwnInner(ctx) {
        debugLog('[liftFlatOwn()] args', { ctx, className: classNameFn() });

        if (ctx.componentIdx !== componentIdx) {
            throw new Error('invalid component for resource lift');
        }

        const [handle, newCtx] = liftFlatU32(ctx);
        const resource = ctx.liftResource ? ctx.liftResource(handle, tableIdx) : createResourceFn(handle);

        return [resource, newCtx];
    };
}

export function liftFlatBorrow(componentTableIdx, size, memory, vals, storagePtr, storageLen) {
    debugLog('[liftFlatBorrow()] args', { size, memory, vals, storagePtr, storageLen });
    throw new Error('flat lift for borrowed resources is not supported!');
}

export function liftFlatFuture(_context, meta) {
    const { futureTableIdx, componentIdx } = meta;

    return function liftFlatFutureInner(ctx) {
        debugLog('[liftFlatFuture()] args', { ctx });

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
            futureEndWaitableIdx = ctx.params[0];
            ctx.params = ctx.params.slice(1);
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
            futureEndWaitableIdx: futureEndWaitableIdx,
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

export function liftFlatStream(_context, meta) {
    const { streamTableIdx, componentIdx } = meta;

    return function liftFlatStreamInner(ctx) {
        debugLog('[liftFlatStream()] args', { ctx });

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
            streamEndWaitableIdx = ctx.params[0];
            ctx.params = ctx.params.slice(1);
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
            streamEndWaitableIdx: streamEndWaitableIdx,
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
                return streamEnd.write(v);
            },
            readFn: (opts) => {
                return streamEnd.read(opts);
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

export function liftFlatErrorContext(_context, errCtxTableIdx, ctx) {
    debugLog('[liftFlatErrorContext()] ctx', ctx);

    let val;
    let table;
    if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
            throw new Error('expected at least one single i32 argument');
        }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        table = errCtxGetLocalTable(_context.local, ctx.componentIdx, errCtxTableIdx);
    } else {
        throw new Error('indirect flat lift for error-contexts not yet implemented!');
    }

    let handle = table.get(val);
    if (handle === undefined) {
        throw new Error(
            `missing  error ctx (handle [${val}], component [${ctx.componentIdx}], error context table [${errCtxTableIdx}])`,
        );
    }

    const cstate = getOrCreateAsyncState(_context.lookup, ctx.componentIdx);
    const errCtx = cstate.handles.get(handle);
    if (!errCtx || errCtx.globalRep === undefined || errCtx.refCount === undefined) {
        throw new Error(`malformed error context (handle [${handle}], component [${ctx.componentIdx}])`);
    }

    errCtx.refCount -= 1;
    // NOTE: we aovoid doing clean up eagerly here

    errCtxGlobalRefCountAdd(_context.globalTable, errCtx.globalRep);

    return [errCtx.globalRep, ctx];
}
