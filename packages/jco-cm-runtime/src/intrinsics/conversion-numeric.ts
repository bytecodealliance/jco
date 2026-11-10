// A valid integer is unchanged by truncation to its width. The type checks
// reject non-numeric inputs before coercion. Each width has its own predicate, so a
// bundle only keeps the widths it converts.
export const isInt8 = (value: unknown): value is number => typeof value === 'number' && value === (value << 24) >> 24;
export const isUint8 = (value: unknown): value is number => typeof value === 'number' && value === (value & 255);
export const isInt16 = (value: unknown): value is number => typeof value === 'number' && value === (value << 16) >> 16;
export const isUint16 = (value: unknown): value is number => typeof value === 'number' && value === (value & 65535);
export const isInt32 = (value: unknown): value is number => typeof value === 'number' && value === value >> 0;
export const isUint32 = (value: unknown): value is number => typeof value === 'number' && value === value >>> 0;
export const isInt64 = (value: unknown): value is bigint =>
    typeof value === 'bigint' && value === BigInt.asIntN(64, value);
export const isUint64 = (value: unknown): value is bigint =>
    typeof value === 'bigint' && value === BigInt.asUintN(64, value);

/** Report the same conversion failure for direct and type-dispatched validation. */
export function invalidNumericPrimitive(type: string, value: unknown): never {
    throw new TypeError(`invalid ${type} value [${value}]`);
}
