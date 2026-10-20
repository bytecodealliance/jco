/** Operations corresponding to bindgen's conversion.rs intrinsics. */
export interface ConversionIntrinsics {
    i32ToF32(value: number): number;
    f32ToI32(value: number): number;
    i64ToF64(value: bigint): number;
    f64ToI64(value: number): bigint;
    i32ToChar(value: number): string;
    toInt8(value: unknown): number;
    toUint8(value: unknown): number;
    toInt16(value: unknown): number;
    toUint16(value: unknown): number;
    toInt32(value: unknown): number;
    toUint32(value: unknown): number;
    toInt64(value: unknown): bigint;
    toUint64(value: unknown): bigint;
    toString(value: unknown): string;
    toResultString(value: unknown): string | undefined;
    isValidNumericPrimitive(type: string, value: unknown): boolean;
    requireValidNumericPrimitive(type: string, value: unknown): true;
    splitInt64(value: bigint): [number, number];
    mergeInt64(low: number, high: number): bigint;
}

function isValidNumericPrimitive(type: string, value: unknown): boolean {
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
}

function requireValidNumericPrimitive(type: string, value: unknown): true {
    if (!isValidNumericPrimitive(type, value)) {
        throw new TypeError(`invalid ${type} value [${value}]`);
    }
    return true;
}

export function createConversionIntrinsics(strict: boolean): ConversionIntrinsics {
    // Bitcast scratch storage belongs to this store. Coercion can call user JS,
    // so keep assignment/read ordering identical to the inline implementation.
    const i32 = new Int32Array(1);
    const f32 = new Float32Array(i32.buffer);
    const i64 = new BigInt64Array(1);
    const f64 = new Float64Array(i64.buffer);

    return {
        i32ToF32(value) {
            i32[0] = value;
            return f32[0];
        },
        f32ToI32(value) {
            f32[0] = value;
            return i32[0];
        },
        i64ToF64(value) {
            i64[0] = value;
            return f64[0];
        },
        f64ToI64(value) {
            f64[0] = value;
            return i64[0];
        },
        i32ToChar(value) {
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
        },
        toInt8(value) {
            if (strict) {
                requireValidNumericPrimitive('s8', value);
            }
            let converted = (value as number) >>> 0;
            converted %= 2 ** 8;
            if (converted >= 2 ** 7) {
                converted -= 2 ** 8;
            }
            return converted;
        },
        toUint8(value) {
            if (strict) {
                requireValidNumericPrimitive('u8', value);
            }
            return ((value as number) >>> 0) % 2 ** 8;
        },
        toInt16(value) {
            if (strict) {
                requireValidNumericPrimitive('s16', value);
            }
            let converted = (value as number) >>> 0;
            converted %= 2 ** 16;
            if (converted >= 2 ** 15) {
                converted -= 2 ** 16;
            }
            return converted;
        },
        toUint16(value) {
            if (strict) {
                requireValidNumericPrimitive('u16', value);
            }
            return ((value as number) >>> 0) % 2 ** 16;
        },
        toInt32(value) {
            if (strict) {
                requireValidNumericPrimitive('s32', value);
            }
            return (value as number) >> 0;
        },
        toUint32(value) {
            if (strict) {
                requireValidNumericPrimitive('u32', value);
            }
            return (value as number) >>> 0;
        },
        toInt64(value) {
            const converted = BigInt(value as bigint);
            if (strict) {
                requireValidNumericPrimitive('s64', converted);
            }
            return BigInt.asIntN(64, converted);
        },
        toUint64(value) {
            const converted = BigInt(value as bigint);
            if (strict) {
                requireValidNumericPrimitive('u64', converted);
            }
            return BigInt.asUintN(64, converted);
        },
        toString(value) {
            if (typeof value === 'symbol') {
                throw new TypeError('symbols cannot be converted to strings');
            }
            return String(value);
        },
        toResultString(value) {
            return JSON.stringify(value, (_, v) => {
                if (v && Object.getPrototypeOf(v) === Uint8Array.prototype) {
                    return `[${v[Symbol.toStringTag]} (${v.byteLength})]`;
                } else if (typeof v === 'bigint') {
                    return v.toString();
                }
                return v;
            });
        },
        isValidNumericPrimitive,
        requireValidNumericPrimitive,
        splitInt64(value) {
            return [Number(value & 0xffffffffn) | 0, Number((value >> 32n) & 0xffffffffn) | 0];
        },
        mergeInt64(low, high) {
            return BigInt(low | 0) | (BigInt(high | 0) << 32n);
        },
    };
}
