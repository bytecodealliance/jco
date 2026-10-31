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
    if (!value || typeof value !== 'number') {
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
    return String.fromCharCode(value);
};

export const toInt8: ConversionModule['toInt8'] = (context, value) => {
    if (context.strict) {
        requireValidNumericPrimitive('s8', value);
    }
    let converted = (value as number) >>> 0;
    converted %= 2 ** 8;
    if (converted >= 2 ** 7) {
        converted -= 2 ** 8;
    }
    return converted;
};

export const toUint8: ConversionModule['toUint8'] = (context, value) => {
    if (context.strict) {
        requireValidNumericPrimitive('u8', value);
    }
    return ((value as number) >>> 0) % 2 ** 8;
};

export const toInt16: ConversionModule['toInt16'] = (context, value) => {
    if (context.strict) {
        requireValidNumericPrimitive('s16', value);
    }
    let converted = (value as number) >>> 0;
    converted %= 2 ** 16;
    if (converted >= 2 ** 15) {
        converted -= 2 ** 16;
    }
    return converted;
};

export const toUint16: ConversionModule['toUint16'] = (context, value) => {
    if (context.strict) {
        requireValidNumericPrimitive('u16', value);
    }
    return ((value as number) >>> 0) % 2 ** 16;
};

export const toInt32: ConversionModule['toInt32'] = (context, value) => {
    if (context.strict) {
        requireValidNumericPrimitive('s32', value);
    }
    return (value as number) >> 0;
};

export const toUint32: ConversionModule['toUint32'] = (context, value) => {
    if (context.strict) {
        requireValidNumericPrimitive('u32', value);
    }
    return (value as number) >>> 0;
};

export const toInt64: ConversionModule['toInt64'] = (context, value) => {
    const converted = BigInt(value as bigint);
    if (context.strict) {
        requireValidNumericPrimitive('s64', converted);
    }
    return BigInt.asIntN(64, converted);
};

export const toUint64: ConversionModule['toUint64'] = (context, value) => {
    const converted = BigInt(value as bigint);
    if (context.strict) {
        requireValidNumericPrimitive('u64', converted);
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
    if (value === undefined || value === null) {
        return false;
    }
    switch (type) {
        case 'bool':
            return value === 0 || value === 1;
        case 'u8':
            return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
        case 's8':
            return typeof value === 'number' && Number.isInteger(value) && value >= -128 && value <= 127;
        case 'u16':
            return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 65535;
        case 's16':
            return typeof value === 'number' && Number.isInteger(value) && value >= -32768 && value <= 32767;
        case 'u32':
            return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4_294_967_295;
        case 's32':
            return (
                typeof value === 'number' &&
                Number.isInteger(value) &&
                value >= -2_147_483_648 &&
                value <= 2_147_483_647
            );
        case 'u64':
            return typeof value === 'bigint' && value >= 0 && value <= 18_446_744_073_709_551_615n;
        case 's64':
            return typeof value === 'bigint' && value >= -9223372036854775808n && value <= 9223372036854775807n;
        case 'f32':
        case 'f64':
            return typeof value === 'number';
        default:
            return false;
    }
};

export const requireValidNumericPrimitive: ConversionModule['requireValidNumericPrimitive'] = (type, value) => {
    if (!isValidNumericPrimitive(type, value)) {
        throw new TypeError(`invalid ${type} value [${value}]`);
    }
    return true;
};

export const splitInt64: ConversionModule['splitInt64'] = (value) => {
    return [Number(value & 0xffffffffn) | 0, Number((value >> 32n) & 0xffffffffn) | 0];
};

export const mergeInt64: ConversionModule['mergeInt64'] = (low, high) => {
    return BigInt(low | 0) | (BigInt(high | 0) << 32n);
};
