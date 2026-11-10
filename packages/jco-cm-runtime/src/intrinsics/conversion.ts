import type { ConversionModule } from '../runtime.js';

/** Allocate only the selected scratch family, once per instantiation. */
export const initializeBitcast32: ConversionModule['initializeBitcast32'] = () => {
    const i32 = new Int32Array(1);
    return { i32, f32: new Float32Array(i32.buffer) };
};
export const initializeBitcast64: ConversionModule['initializeBitcast64'] = () => {
    const i64 = new BigInt64Array(1);
    return { i64, f64: new Float64Array(i64.buffer) };
};

export const i32ToF32: ConversionModule['i32ToF32'] = (context, value) => {
    context.i32[0] = value;
    return context.f32[0];
};

export const f32ToI32: ConversionModule['f32ToI32'] = (context, value) => {
    context.f32[0] = value;
    return context.i32[0];
};

export const i64ToF64: ConversionModule['i64ToF64'] = (context, value) => {
    context.i64[0] = value;
    return context.f64[0];
};

export const f64ToI64: ConversionModule['f64ToI64'] = (context, value) => {
    context.f64[0] = value;
    return context.i64[0];
};

export const i32ToChar: ConversionModule['i32ToChar'] = (value) => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error('invalid i32');
    }
    if (value < 0) {
        throw new Error('i32 must be greater than zero');
    }
    if (value >= 0x110000) {
        throw new Error('invalid i32, out of range');
    }
    if (0xd800 <= value && value <= 0xdfff) {
        throw new Error('invalid i32 out of range');
    }
    return String.fromCodePoint(value);
};

export const toInt8: ConversionModule['toInt8'] = (context, value) => {
    if (context.strict && !isInt8(value)) {
        invalidNumericPrimitive('s8', value);
    }
    return ((value as number) << 24) >> 24;
};

export const toUint8: ConversionModule['toUint8'] = (context, value) => {
    if (context.strict && !isUint8(value)) {
        invalidNumericPrimitive('u8', value);
    }
    return (value as number) & 255;
};

export const toInt16: ConversionModule['toInt16'] = (context, value) => {
    if (context.strict && !isInt16(value)) {
        invalidNumericPrimitive('s16', value);
    }
    return ((value as number) << 16) >> 16;
};

export const toUint16: ConversionModule['toUint16'] = (context, value) => {
    if (context.strict && !isUint16(value)) {
        invalidNumericPrimitive('u16', value);
    }
    return (value as number) & 65535;
};

export const toInt32: ConversionModule['toInt32'] = (context, value) => {
    if (context.strict && !isInt32(value)) {
        invalidNumericPrimitive('s32', value);
    }
    return (value as number) >> 0;
};

export const toUint32: ConversionModule['toUint32'] = (context, value) => {
    if (context.strict && !isUint32(value)) {
        invalidNumericPrimitive('u32', value);
    }
    return (value as number) >>> 0;
};

export const toInt64: ConversionModule['toInt64'] = (context, value) => {
    const converted = BigInt(value as bigint);
    if (context.strict && !isInt64(converted)) {
        invalidNumericPrimitive('s64', converted);
    }
    return BigInt.asIntN(64, converted);
};

export const toUint64: ConversionModule['toUint64'] = (context, value) => {
    const converted = BigInt(value as bigint);
    if (context.strict && !isUint64(converted)) {
        invalidNumericPrimitive('u64', converted);
    }
    return BigInt.asUintN(64, converted);
};

export const toString: ConversionModule['toString'] = (value) => {
    if (typeof value === 'symbol') {
        throw new TypeError('symbols cannot be converted to strings');
    }
    return String(value);
};

export const toResultString: ConversionModule['toResultString'] = (value) => {
    return JSON.stringify(value, (_, v) => {
        if (v && Object.getPrototypeOf(v) === Uint8Array.prototype) {
            return `[${v[Symbol.toStringTag]} (${v.byteLength})]`;
        } else if (typeof v === 'bigint') {
            return v.toString();
        }
        return v;
    });
};

export const isValidNumericPrimitive: ConversionModule['isValidNumericPrimitive'] = (type, value) => {
    switch (type) {
        case 'bool':
            return value === 0 || value === 1;
        case 's8':
            return isInt8(value);
        case 'u8':
            return isUint8(value);
        case 's16':
            return isInt16(value);
        case 'u16':
            return isUint16(value);
        case 's32':
            return isInt32(value);
        case 'u32':
            return isUint32(value);
        case 's64':
            return isInt64(value);
        case 'u64':
            return isUint64(value);
        case 'f32':
        case 'f64':
            return typeof value === 'number';
        default:
            return false;
    }
};

export const requireValidNumericPrimitive: ConversionModule['requireValidNumericPrimitive'] = (type, value) => {
    if (!isValidNumericPrimitive(type, value)) {
        invalidNumericPrimitive(type, value);
    }
    return true;
};

export const splitInt64: ConversionModule['splitInt64'] = (value) => {
    return [Number(value & 0xffffffffn) | 0, Number((value >> 32n) & 0xffffffffn) | 0];
};

export const mergeInt64: ConversionModule['mergeInt64'] = (low, high) => {
    return BigInt(low | 0) | (BigInt(high | 0) << 32n);
};

// A valid integer is unchanged by truncation to its width. The type checks
// reject non-numeric inputs before coercion; separate predicates keep unused widths out of bundles.
const isInt8 = (value: unknown): value is number => typeof value === 'number' && value === (value << 24) >> 24;
const isUint8 = (value: unknown): value is number => typeof value === 'number' && value === (value & 255);
const isInt16 = (value: unknown): value is number => typeof value === 'number' && value === (value << 16) >> 16;
const isUint16 = (value: unknown): value is number => typeof value === 'number' && value === (value & 65535);
const isInt32 = (value: unknown): value is number => typeof value === 'number' && value === value >> 0;
const isUint32 = (value: unknown): value is number => typeof value === 'number' && value === value >>> 0;
const isInt64 = (value: unknown): value is bigint => typeof value === 'bigint' && value === BigInt.asIntN(64, value);
const isUint64 = (value: unknown): value is bigint => typeof value === 'bigint' && value === BigInt.asUintN(64, value);

/** Report the same conversion failure for direct and type-dispatched validation. */
function invalidNumericPrimitive(type: string, value: unknown): never {
    throw new TypeError(`invalid ${type} value [${value}]`);
}
