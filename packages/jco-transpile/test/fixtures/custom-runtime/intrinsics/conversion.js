// Independent implementation of the numeric operation selected by this fixture.
export function toUint32(context, value) {
    if (context.strict && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffffff)) {
        throw new TypeError(`invalid u32 value [${value}]`);
    }
    return value >>> 0;
}

export function toInt32(context, value) {
    if (
        context.strict &&
        (typeof value !== 'number' || !Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff)
    ) {
        throw new TypeError(`invalid s32 value [${value}]`);
    }
    return value >> 0;
}

export function isValidNumericPrimitive(type, value) {
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
            return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
        case 's32':
            return typeof value === 'number' && Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
        case 'u64':
            return typeof value === 'bigint' && value >= 0n && value <= (1n << 64n) - 1n;
        case 's64':
            return typeof value === 'bigint' && value >= -(1n << 63n) && value <= (1n << 63n) - 1n;
        case 'f32':
        case 'f64':
            return typeof value === 'number';
        default:
            return false;
    }
}

export function requireValidNumericPrimitive(type, value) {
    if (!isValidNumericPrimitive(type, value)) {
        throw new TypeError(`invalid ${type} value [${value}]`);
    }
    return true;
}

export function i32ToChar(value) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error('invalid i32');
    }
    if (value < 0) {
        throw new Error('i32 must be greater than zero');
    }
    if (value >= 0x110000 || (0xd800 <= value && value <= 0xdfff)) {
        throw new Error('invalid i32 out of range');
    }
    return String.fromCodePoint(value);
}
