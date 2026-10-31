import { createStream } from './stream-state.js';
import { isStreamLowerableObject, genReadFnFromLowerableStream } from './stream-source.js';
import { genStreamHostInjectFn } from './stream-injection.js';
import { createFuture } from './future-state.js';
import { isFutureLowerableObject, genFutureHostInjectFn } from './future-operations.js';
import { debugLog } from './core-debug.js';
import { requireValidNumericPrimitive } from './conversion.js';
import { utf8Encode, utf16Encode, compactUtf16Encode } from './string.js';
import { getOrCreateAsyncState } from './component.js';
import { errCtxGetLocalTable, errCtxGlobalRefCountAdd, errCtxCreateLocalHandle } from './error-context.js';

function flagsValue(context, value, names) {
    if (context.asBigInt) {
        if (typeof value !== 'bigint') {
            throw new TypeError('flags must be a bigint');
        }
        if (value < 0n || value >> BigInt(names.length) !== 0n) {
            throw new TypeError('flags have extraneous bits set');
        }
        return Number(value);
    }
    let bits = 0;
    if (typeof value === 'object' && value !== null) {
        for (const [idx, name] of names.entries()) {
            if (value[name] === true) {
                bits |= 1 << idx;
            }
        }
    } else if (value !== undefined && value !== null) {
        throw new TypeError('only an object, undefined or null can be converted to flags');
    }
    return bits;
}

export function lowerFlatBool(_context, ctx) {
    debugLog('[_lowerFlatBool()] args', { ctx });

    if (!ctx.memory) {
        throw new Error('missing memory for lower');
    }
    if (ctx.vals.length !== 1) {
        throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
    }

    if (_context.strict && typeof ctx.vals[0] !== 'boolean') {
        throw new TypeError(`invalid bool value [${ctx.vals[0]}]`);
    }
    new DataView(ctx.memory.buffer).setUint8(ctx.storagePtr, ctx.vals[0] ? 1 : 0);

    ctx.storagePtr += 1;
}

export function lowerFlatS8(_context, ctx) {
    debugLog('[_lowerFlatS8()] args', { ctx });

    if (ctx.vals.length !== 1) {
        throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
    }
    if (!ctx.memory) {
        throw new Error('missing memory for lower');
    }

    if (_context.strict) {
        requireValidNumericPrimitive('s8', ctx.vals[0]);
    }
    new DataView(ctx.memory.buffer).setInt8(ctx.storagePtr, ctx.vals[0]);

    ctx.storagePtr += 1;
}

export function lowerFlatU8(_context, ctx) {
    debugLog('[lowerFlatU8()] args', ctx);

    if (ctx.vals.length !== 1) {
        throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
    }

    if (_context.strict) {
        requireValidNumericPrimitive('u8', ctx.vals[0]);
    }

    if (!ctx.memory) {
        throw new Error('missing memory for lower');
    }
    new DataView(ctx.memory.buffer).setUint8(ctx.storagePtr, ctx.vals[0]);

    ctx.storagePtr += 1;
}

export function lowerFlatS16(_context, ctx) {
    debugLog('[lowerFlatS16()] args', { ctx });

    if (!ctx.memory) {
        throw new Error('missing memory for lower');
    }
    if (ctx.vals.length !== 1) {
        throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
    }

    const rem = ctx.storagePtr % 2;
    if (rem !== 0) {
        ctx.storagePtr += 2 - rem;
    }

    if (_context.strict) {
        requireValidNumericPrimitive('s16', ctx.vals[0]);
    }
    new DataView(ctx.memory.buffer).setInt16(ctx.storagePtr, ctx.vals[0], true);

    ctx.storagePtr += 2;
}

export function lowerFlatU16(_context, ctx) {
    debugLog('[lowerFlatU16()] args', { ctx });

    if (!ctx.memory) {
        throw new Error('missing memory for lower');
    }
    if (ctx.vals.length !== 1) {
        throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
    }

    const rem = ctx.storagePtr % 2;
    if (rem !== 0) {
        ctx.storagePtr += 2 - rem;
    }

    if (_context.strict) {
        requireValidNumericPrimitive('u16', ctx.vals[0]);
    }
    new DataView(ctx.memory.buffer).setUint16(ctx.storagePtr, ctx.vals[0], true);

    ctx.storagePtr += 2;
}

export function lowerFlatS32(_context, ctx) {
    debugLog('[lowerFlatS32()] args', { ctx });

    if (ctx.vals.length !== 1) {
        throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
    }

    const rem = ctx.storagePtr % 4;
    if (rem !== 0) {
        ctx.storagePtr += 4 - rem;
    }

    if (_context.strict) {
        requireValidNumericPrimitive('s32', ctx.vals[0]);
    }
    new DataView(ctx.memory.buffer).setInt32(ctx.storagePtr, ctx.vals[0], true);

    ctx.storagePtr += 4;
}

export function lowerFlatU32(_context, ctx) {
    debugLog('[lowerFlatU32()] args', { ctx });

    if (ctx.vals.length !== 1) {
        throw new Error(`expected single value to lower, got [${ctx.vals.length}]`);
    }

    const rem = ctx.storagePtr % 4;
    if (rem !== 0) {
        ctx.storagePtr += 4 - rem;
    }

    if (_context.strict) {
        requireValidNumericPrimitive('u32', ctx.vals[0]);
    }
    new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);

    ctx.storagePtr += 4;
}

export function lowerFlatS64(_context, ctx) {
    debugLog('[lowerFlatS64()] args', { ctx });

    if (ctx.vals.length !== 1) {
        throw new Error('unexpected number of vals');
    }

    const rem = ctx.storagePtr % 8;
    if (rem !== 0) {
        ctx.storagePtr += 8 - rem;
    }

    if (_context.strict) {
        requireValidNumericPrimitive('s64', ctx.vals[0]);
    }
    new DataView(ctx.memory.buffer).setBigInt64(ctx.storagePtr, ctx.vals[0], true);

    ctx.storagePtr += 8;
}

export function lowerFlatU64(_context, ctx) {
    debugLog('[lowerFlatU64()] args', { ctx });

    if (ctx.vals.length !== 1) {
        throw new Error('unexpected number of vals');
    }

    const rem = ctx.storagePtr % 8;
    if (rem !== 0) {
        ctx.storagePtr += 8 - rem;
    }

    if (_context.strict) {
        requireValidNumericPrimitive('u64', ctx.vals[0]);
    }
    new DataView(ctx.memory.buffer).setBigUint64(ctx.storagePtr, ctx.vals[0], true);

    ctx.storagePtr += 8;
}

export function lowerFlatFloat32(_context, ctx) {
    debugLog('[lowerFlatFloat32()] args', { ctx });

    if (ctx.vals.length !== 1) {
        throw new Error('unexpected number of vals');
    }

    const rem = ctx.storagePtr % 4;
    if (rem !== 0) {
        ctx.storagePtr += 4 - rem;
    }

    if (_context.strict) {
        requireValidNumericPrimitive('f32', ctx.vals[0]);
    }
    new DataView(ctx.memory.buffer).setFloat32(ctx.storagePtr, ctx.vals[0], true);

    ctx.storagePtr += 4;
}

export function lowerFlatFloat64(_context, ctx) {
    debugLog('[lowerFlatFloat64()] args', { ctx });

    if (ctx.vals.length !== 1) {
        throw new Error('unexpected number of vals');
    }

    const rem = ctx.storagePtr % 8;
    if (rem !== 0) {
        ctx.storagePtr += 8 - rem;
    }

    if (_context.strict) {
        requireValidNumericPrimitive('f64', ctx.vals[0]);
    }
    new DataView(ctx.memory.buffer).setFloat64(ctx.storagePtr, ctx.vals[0], true);

    ctx.storagePtr += 8;
}

export function lowerFlatChar(ctx) {
    debugLog('[_lowerFlatChar()] args', { ctx });

    const rem = ctx.storagePtr % 4;
    if (rem !== 0) {
        ctx.storagePtr += 4 - rem;
    }

    if (ctx.vals.length !== 1) {
        throw new Error('unexpected number of vals');
    }
    const value = ctx.vals[0];
    if (typeof value !== 'string') {
        throw new TypeError('char must be a string');
    }
    const codePoint = value.codePointAt(0);
    if (
        codePoint === undefined ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
        value.length !== (codePoint > 0xffff ? 2 : 1)
    ) {
        throw new TypeError('char must contain one Unicode scalar value');
    }
    new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, codePoint, true);

    ctx.storagePtr += 4;
}

export function lowerFlatStringAny(_context, ctx) {
    switch (ctx.stringEncoding) {
        case 'utf8':
            return lowerFlatStringUTF8(_context.utf8, ctx);
        case 'utf16':
            return lowerFlatStringUTF16(_context.utf16, ctx);
        case 'compact-utf16': {
            if (!ctx.realloc) {
                throw new Error('missing realloc during flat string lower');
            }
            const { ptr, len } = compactUtf16Encode(_context.utf16, ctx.vals[0], ctx.realloc, ctx.memory);
            const view = new DataView(ctx.memory.buffer);
            view.setUint32(ctx.storagePtr, ptr, true);
            view.setUint32(ctx.storagePtr + 4, len, true);
            ctx.storagePtr += 8;
            return;
        }
        default:
            throw new Error(`missing/unrecognized/unsupported string encoding [${ctx.stringEncoding}]`);
    }
}

export function lowerFlatStringUTF16(_context, ctx) {
    debugLog('[lowerFlatStringUTF16()] args', { ctx });
    if (!ctx.realloc) {
        throw new Error('missing realloc during flat string lower');
    }

    const { ptr, len } = utf16Encode(_context, ctx.vals[0], ctx.realloc, ctx.memory);

    const view = new DataView(ctx.memory.buffer);
    view.setUint32(ctx.storagePtr, ptr, true);
    view.setUint32(ctx.storagePtr + 4, len, true);

    ctx.storagePtr += 8;
}

export function lowerFlatStringUTF8(_context, ctx) {
    debugLog('[lowerFlatStringUTF8()] args', ctx);
    if (!ctx.realloc) {
        throw new Error('missing realloc during flat string lower');
    }

    const { ptr, len } = utf8Encode(_context, ctx.vals[0], ctx.realloc, ctx.memory);

    const view = new DataView(ctx.memory.buffer);
    view.setUint32(ctx.storagePtr, ptr, true);
    view.setUint32(ctx.storagePtr + 4, len, true);

    ctx.storagePtr += 8;
}

export function lowerFlatRecord(meta) {
    const { fieldMetas, size32: recordSize32, align32: recordAlign32 } = meta;
    return function lowerFlatRecordInner(ctx) {
        debugLog('[lowerFlatRecord()] args', { ctx });

        const originalPtr = ctx.storagePtr;
        const r = ctx.vals[0];
        for (const [tag, lowerFn, size32, align32] of fieldMetas) {
            const rem = ctx.storagePtr % align32;
            if (rem !== 0) {
                ctx.storagePtr += align32 - rem;
            }

            const fieldPtr = ctx.storagePtr;
            ctx.vals = [r[tag]];
            lowerFn(ctx);

            ctx.storagePtr = Math.max(ctx.storagePtr, fieldPtr + size32);
        }

        ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + recordSize32);

        const rem = ctx.storagePtr % recordAlign32;
        if (rem !== 0) {
            ctx.storagePtr += recordAlign32 - rem;
        }
    };
}

export function lowerFlatVariant(_context, meta) {
    const { variantSize32, variantAlign32, variantPayloadOffset32, caseMetas } = meta;

    const caseLookup = {};
    for (const [idx, meta] of caseMetas.entries()) {
        let tag = meta[0];
        caseLookup[tag] = { discriminant: idx, meta };
    }

    return function lowerFlatVariantInner(ctx) {
        debugLog('[lowerFlatVariant()] args', { ctx });

        const { tag, val } = ctx.vals[0];
        const variantCase = caseLookup[tag];
        if (!variantCase) {
            throw new Error(`missing tag [${tag}] (valid tags: ${Object.keys(caseLookup)})`);
        }

        const [, lowerFn] = variantCase.meta;

        const originalPtr = ctx.storagePtr;
        ctx.vals = [variantCase.discriminant];
        if (caseMetas.length < 256) {
            lowerFlatU8(_context, ctx);
        } else if (caseMetas.length >= 256 && caseMetas.length < 65536) {
            lowerFlatU16(_context, ctx);
        } else if (caseMetas.length >= 65536 && caseMetas.length < 4_294_967_296) {
            lowerFlatU32(_context, ctx);
        } else {
            throw new Error(`unsupported number of cases [${caseMetas.length}]`);
        }

        const payloadOffsetPtr = originalPtr + variantPayloadOffset32;
        ctx.storagePtr = payloadOffsetPtr;
        ctx.vals = [val];
        if (lowerFn) {
            lowerFn(ctx);
        }

        ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + variantSize32);

        const rem = ctx.storagePtr % variantAlign32;
        if (rem !== 0) {
            ctx.storagePtr += variantAlign32 - rem;
        }
    };
}

export function lowerFlatList(_context, meta) {
    const { elemLowerFn, knownLen, size32, elemSize32, elemAlign32 } = meta;

    if (!elemLowerFn) {
        throw new TypeError('missing/invalid element lower fn for list');
    }

    return function lowerFlatListInner(ctx) {
        debugLog('[lowerFlatList()] args', { ctx });

        if (ctx.useDirectParams) {
            if (ctx.params.length < 2) {
                throw new Error('insufficient params left to lower list');
            }
            const storagePtr = ctx.params[0] >>> 0;
            ctx.params = ctx.params.slice(2);

            const list = ctx.vals[0];
            if (!list) {
                throw new Error('missing direct param value');
            }

            const lowerCtx = {
                storagePtr,
                memory: ctx.memory,
                stringEncoding: ctx.stringEncoding,
                componentIdx: ctx.componentIdx,
                realloc: ctx.realloc,
                lowerResource: ctx.lowerResource,
                vals: [],
            };
            for (let idx = 0; idx < list.length; idx++) {
                const elemPtr = storagePtr + idx * elemSize32;
                lowerCtx.storagePtr = elemPtr;
                lowerCtx.vals = list.slice(idx, idx + 1);
                elemLowerFn(lowerCtx);
                lowerCtx.storagePtr = Math.max(lowerCtx.storagePtr, elemPtr + elemSize32);
            }
            ctx.storagePtr = lowerCtx.storagePtr;

            // TODO: implement parma-only known-length processing

            return;
        }

        // TODO(fix): is it possible to get a vals that are a addr and length here from
        // a component lower?

        const elems = ctx.vals[0];
        if (knownLen === undefined) {
            // unknown length
            if (!ctx.realloc) {
                throw new Error('missing realloc during flat string lower');
            }
            const dataPtr = ctx.realloc(0, 0, elemAlign32, elemSize32 * elems.length);

            ctx.vals[0] = dataPtr;
            lowerFlatU32(_context, ctx);

            ctx.vals[0] = elems.length;
            lowerFlatU32(_context, ctx);

            const origPtr = ctx.storagePtr;
            ctx.storagePtr = dataPtr;

            for (const [idx, elem] of elems.entries()) {
                const elemPtr = dataPtr + idx * elemSize32;
                ctx.storagePtr = elemPtr;
                ctx.vals = [elem];
                elemLowerFn(ctx);
                ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
            }

            ctx.storagePtr = origPtr;
        } else {
            // known length

            if (elems.length !== knownLen) {
                throw new TypeError(`invalid list input of length [${elems.length}], must be length [${knownLen}]`);
            }

            const originalPtr = ctx.storagePtr;
            for (const [idx, elem] of elems.entries()) {
                const elemPtr = originalPtr + idx * elemSize32;
                ctx.storagePtr = elemPtr;
                ctx.vals = [elem];
                elemLowerFn(ctx);
                ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
            }
        }

        // TODO(fix): special case for u8/u16/etc, we can do a direct copy

        const totalSizeBytes = knownLen === undefined ? 8 : (size32 ?? elems.length * elemSize32);
        if (ctx.storageLen !== undefined && totalSizeBytes > ctx.storageLen) {
            throw new Error('not enough storage remaining for list flat lower');
        }
    };
}

export function lowerFlatMap(_context, meta) {
    const { keyLowerFn, valueLowerFn, entrySize32, entryAlign32, valueOffset32 } = meta;

    return function lowerFlatMapInner(ctx) {
        debugLog('[lowerFlatMap()] args', { ctx });
        const map = ctx.vals[0];
        if (!(map instanceof Map)) {
            throw new TypeError('expected a Map');
        }

        let dataPtr;
        let restorePtr;
        if (ctx.useDirectParams) {
            if (ctx.params.length < 2) {
                throw new Error('insufficient params left to lower map');
            }
            dataPtr = ctx.params[0] >>> 0;
            const expectedLen = ctx.params[1];
            ctx.params = ctx.params.slice(2);
            if (expectedLen !== map.size) {
                throw new Error('map length does not match allocated storage');
            }
            restorePtr = ctx.storagePtr;
        } else {
            if (!ctx.realloc) {
                throw new Error('missing realloc during flat map lower');
            }
            dataPtr = ctx.realloc(0, 0, entryAlign32, entrySize32 * map.size);

            ctx.vals[0] = dataPtr;
            lowerFlatU32(_context, ctx);
            ctx.vals[0] = map.size;
            lowerFlatU32(_context, ctx);
            restorePtr = ctx.storagePtr;
        }

        let idx = 0;
        for (const [key, value] of map) {
            const entryPtr = dataPtr + idx * entrySize32;
            ctx.storagePtr = entryPtr;
            ctx.vals = [key];
            keyLowerFn(ctx);
            ctx.storagePtr = entryPtr + valueOffset32;
            ctx.vals = [value];
            valueLowerFn(ctx);
            idx++;
        }
        ctx.storagePtr = restorePtr;
    };
}

export function lowerFlatTuple(meta) {
    const { elemLowerMetas, size32: tupleSize32, align32: tupleAlign32 } = meta;
    return function lowerFlatTupleInner(ctx) {
        debugLog('[lowerFlatTuple()] args', { ctx });
        const originalPtr = ctx.storagePtr;
        const tuple = ctx.vals[0];
        for (const [idx, [lowerFn, size32, align32]] of elemLowerMetas.entries()) {
            const rem = ctx.storagePtr % align32;
            if (rem !== 0) {
                ctx.storagePtr += align32 - rem;
            }

            const elemPtr = ctx.storagePtr;
            ctx.vals = [tuple[idx]];
            lowerFn(ctx);
            ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + size32);
        }

        ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + tupleSize32);

        const rem = ctx.storagePtr % tupleAlign32;
        if (rem !== 0) {
            ctx.storagePtr += tupleAlign32 - rem;
        }
    };
}

export function lowerFlatFlags(_context, meta) {
    const { names, align32, intSizeBytes } = meta;

    return function lowerFlatFlagsInner(ctx) {
        debugLog('[lowerFlatFlags()] args', { ctx });
        if (ctx.vals.length !== 1) {
            throw new Error('unexpected number of vals');
        }

        const flagValue = flagsValue(_context, ctx.vals[0], names);

        const rem = ctx.storagePtr % align32;
        if (rem !== 0) {
            ctx.storagePtr += align32 - rem;
        }

        const dv = new DataView(ctx.memory.buffer);
        if (intSizeBytes === 1) {
            dv.setUint8(ctx.storagePtr, flagValue);
        } else if (intSizeBytes === 2) {
            dv.setUint16(ctx.storagePtr, flagValue, true);
        } else if (intSizeBytes === 4) {
            dv.setUint32(ctx.storagePtr, flagValue, true);
        } else {
            throw new Error(`unrecognized flag size [${intSizeBytes} bytes]`);
        }

        ctx.storagePtr += intSizeBytes;
    };
}

export function lowerFlatEnum(_context, meta) {
    const f = lowerFlatVariant(_context, meta);
    return function lowerFlatEnumInner(ctx) {
        debugLog('[lowerFlatEnum()] args', { ctx });

        const v = ctx.vals[0];
        const isNotEnumObject = v === null || typeof v !== 'object' || Object.keys(v).length !== 2 || !('tag' in v);
        if (isNotEnumObject) {
            ctx.vals[0] = { tag: v };
        }

        f(ctx);
    };
}

export function lowerFlatOption(_context, meta) {
    const { payloadMaybeNull } = meta;
    const f = lowerFlatVariant(_context, meta);
    return function lowerFlatOptionInner(ctx) {
        debugLog('[lowerFlatOption()] args', { ctx });

        const v = ctx.vals[0];
        if (v === null || v === undefined) {
            ctx.vals[0] = { tag: 'none' };
        } else if (payloadMaybeNull) {
            const isNotOptionObject =
                v === null ||
                typeof v !== 'object' ||
                Object.keys(v).length !== 2 ||
                !('tag' in v) ||
                !(v.tag === 'some' || v.tag === 'none') ||
                !('val' in v);
            if (isNotOptionObject) {
                ctx.vals[0] = { tag: 'some', val: v };
            }
        } else {
            ctx.vals[0] = { tag: 'some', val: v };
        }

        f(ctx);
    };
}

export function lowerFlatResult(_context, meta) {
    const f = lowerFlatVariant(_context, meta);
    return function lowerFlatResultInner(ctx) {
        debugLog('[lowerFlatResult()] args', { ctx });

        const v = ctx.vals[0];
        const isNotResultObject =
            v === null ||
            typeof v !== 'object' ||
            Object.keys(v).length !== 2 ||
            !('tag' in v) ||
            !('ok' === v.tag || 'err' === v.tag) ||
            !('val' in v);
        if (isNotResultObject) {
            ctx.vals[0] = { tag: 'ok', val: v };
        }

        f(ctx);
    };
}

export function lowerFlatOwn(_context, meta) {
    const { lowerFn, componentIdx, tableIdx } = meta;

    return function lowerFlatOwnInner(ctx) {
        debugLog('[lowerFlatOwn()] args', { ctx });

        if (ctx.componentIdx !== componentIdx) {
            throw new Error(
                `component index mismatch (expected [${componentIdx}], lift called from [${ctx.componentIdx}])`,
            );
        }

        const obj = ctx.vals[0];
        if (obj === undefined || obj === null) {
            throw new Error('missing resource');
        }
        const handle = ctx.lowerResource ? ctx.lowerResource(obj, tableIdx) : lowerFn(obj);

        ctx.vals[0] = handle;
        lowerFlatU32(_context, ctx);
    };
}

export function lowerFlatBorrow(ctx) {
    debugLog('[lowerFlatBorrow()] args', { ctx });
    throw new Error('flat lower for borrowed resources is not supported!');
}

export function lowerFlatFuture(_context, meta) {
    const { componentIdx, futureTableIdx, elemMeta } = meta;

    return function lowerFlatFutureInner(ctx) {
        debugLog('[lowerFlatFuture()] args', { ctx });

        let future = ctx.vals[0];
        if (!future) {
            throw new Error('missing external future value');
        }

        if (!isFutureLowerableObject(future)) {
            // A native async host function cannot return a thenable
            // without assimilating it. Preserve compatibility for a
            // single lowered layer by treating that result as already
            // settled; nested layers still arrive as FutureValue.
            future = Promise.resolve(future);
        }

        let globalRep = future[_context.resourceRep];
        let waitableIdx;
        if (globalRep) {
            const hostFuture = _context.futures.get(globalRep);
            if (!hostFuture) {
                throw new Error(`missing host future with global rep [${globalRep}]`);
            }
            waitableIdx = hostFuture.getFutureEndWaitableIdx();
        } else {
            const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
            if (!cstate) {
                throw new Error(`missing async state for component [${componentIdx}]`);
            }

            elemMeta.stringEncoding = 'utf8';

            let outermostReadEnd;
            // Lower one layer. A future-valued payload is lowered
            // recursively by elemMeta.lowerFn when this layer settles.
            let nestingLevel = 0;
            while (nestingLevel >= 0) {
                const { writeEnd, writeEndWaitableIdx, readEnd, readEndWaitableIdx } = createFuture(
                    _context.creation,
                    cstate,
                    {
                        tableIdx: futureTableIdx,
                        elemMeta,
                    },
                );

                const hostInjectFn = genFutureHostInjectFn(_context.injection, {
                    promise: future,
                    stringEncoding: elemMeta.stringEncoding,
                    hostWriteEnd: writeEnd,
                });
                readEnd.setHostInjectFn(hostInjectFn);

                outermostReadEnd = readEnd;
                future = {
                    [_context.nestedSymbol]: true,
                    readEndWaitableIdx,
                    writeEndWaitableIdx,
                    futureTableIdx,
                    componentIdx,
                };

                nestingLevel--;
            }

            waitableIdx = outermostReadEnd.waitableIdx();
        }

        // Write the idx of the waitable to memory (a waiting async task or caller)
        if (ctx.storagePtr !== undefined && ctx.storagePtr !== null) {
            ctx.vals[0] = waitableIdx;
            lowerFlatU32(_context.numeric, ctx);
        }

        return waitableIdx;
    };
}

export function lowerFlatStream(_context, meta) {
    const { componentIdx, streamTableIdx, elemMeta } = meta;

    return function lowerFlatStreamInner(ctx) {
        debugLog('[lowerFlatStream()] args', { ctx });

        const stream = ctx.vals[0];
        if (!stream) {
            throw new Error('missing external stream value');
        }

        let globalRep;
        let waitableIdx;
        if (stream instanceof _context.lowerable.Stream) {
            globalRep = stream[_context.resourceRep];
            const internalStream = _context.streams.get(globalRep);
            if (!internalStream || !(internalStream instanceof _context.InternalStream)) {
                throw new Error(`failed to find internal stream with rep [${globalRep}]`);
            }
            waitableIdx = internalStream.readEnd().waitableIdx();
        } else if (isStreamLowerableObject(_context.lowerable, stream)) {
            globalRep = stream[_context.resourceRep];

            if (globalRep) {
                const hostStream = _context.streams.get(globalRep);
                if (!hostStream) {
                    throw new Error(`missing host stream with global rep [${globalRep}]`);
                }
                waitableIdx = hostStream.getStreamEndWaitableIdx();
            } else {
                const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
                if (!cstate) {
                    throw new Error(`missing async state for component [${componentIdx}]`);
                }

                const { writeEnd, readEnd } = createStream(_context.creation, cstate, {
                    tableIdx: streamTableIdx,
                    elemMeta,
                });

                const readFn = genReadFnFromLowerableStream(_context.source, stream);
                const hostInjectFn = genStreamHostInjectFn(_context.injection, {
                    readFn,
                    hostWriteEnd: writeEnd,
                    readEnd,
                });
                readEnd.setHostInjectFn(hostInjectFn);
                readEnd.setHostDropFn(readFn.drop);

                waitableIdx = readEnd.waitableIdx();
            }
        } else {
            throw new Error('object does not conform to supported stream interfaces');
        }

        // Write the idx of the waitable to memory (a waiting async task or caller)
        if (ctx.storagePtr !== undefined && ctx.storagePtr !== null) {
            ctx.vals[0] = waitableIdx;
            lowerFlatU32(_context.numeric, ctx);
        }

        return waitableIdx;
    };
}

export function lowerFlatErrorContext(_context, errCtxTableIdx, ctx) {
    debugLog('[lowerFlatErrorContext()] args', { errCtxTableIdx, ctx });
    const { memory, realloc, vals, storagePtr, storageLen, componentIdx } = ctx;

    const errCtxGlobalRep = vals[0];

    const globalTable = _context.globalTable.get();
    const globalErrCtx = globalTable.get(errCtxGlobalRep);

    if (!globalErrCtx) {
        throw new Error('missing global error context during lower');
    }
    // A lifted local entry can remain until its host-owned value is lowered.
    // Remove only that exhausted entry, preserving other live local owners.
    if (globalErrCtx.componentIdx !== undefined && globalErrCtx.waitableIdx !== undefined) {
        const prevComponentState = getOrCreateAsyncState(_context.lookup, globalErrCtx.componentIdx);
        const prevLocalErrCtx = prevComponentState.handles.get(globalErrCtx.waitableIdx);
        if (prevLocalErrCtx && prevLocalErrCtx.refCount === 0) {
            prevComponentState.handles.remove(globalErrCtx.waitableIdx);
            const prevLocalErrCtxTable = errCtxGetLocalTable(
                _context.local,
                globalErrCtx.componentIdx,
                globalErrCtx.localTableIdx,
            );
            prevLocalErrCtxTable.remove(globalErrCtx.localIdx);
            errCtxGlobalRefCountAdd(_context.globalTable, errCtxGlobalRep, -1);
        }
    }
    const localErrCtxTable = errCtxGetLocalTable(_context.local, componentIdx, errCtxTableIdx, { upsert: true });
    const { waitableIdx: handle, localIdx } = errCtxCreateLocalHandle(
        _context,
        componentIdx,
        localErrCtxTable,
        errCtxGlobalRep,
    );
    globalErrCtx.componentIdx = componentIdx;
    globalErrCtx.waitableIdx = handle;
    globalErrCtx.localIdx = localIdx;
    globalErrCtx.localTableIdx = errCtxTableIdx;
    errCtxGlobalRefCountAdd(_context.globalTable, errCtxGlobalRep, -1);

    const lowerCtx = { memory, realloc, vals: [handle], storagePtr, storageLen, componentIdx };
    lowerFlatU32(_context.numeric, lowerCtx);
    ctx.storagePtr = lowerCtx.storagePtr;
}
