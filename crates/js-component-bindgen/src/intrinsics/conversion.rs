//! Intrinsics that represent helpers perform conversions

use crate::{intrinsics::Intrinsic, source::Source};

/// This enum contains intrinsics that help perform type conversions
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ConversionIntrinsic {
    I32ToF32,
    I64ToF64,
    F32ToI32,
    F64ToI64,

    /// Convert a i32 to a char
    I32ToChar,

    /// Implementation of <https://tc39.es/ecma262/#sec-tobigint64>
    ToBigInt64,
    /// Implementation of <https://tc39.es/ecma262/#sec-tobiguint64>
    ToBigUint64,
    /// Implementation of <https://tc39.es/ecma262/#sec-toint16>
    ToInt16,
    /// Implementation of <https://tc39.es/ecma262/#sec-toint32>
    ToInt32,
    /// Implementation of <https://tc39.es/ecma262/#sec-toint8>
    ToInt8,

    /// Implementation of <https://tc39.es/ecma262/#sec-tostring>
    ToString,
    /// Implementation of <https://tc39.es/ecma262/#sec-touint16>
    ToUint16,
    /// Implementation of <https://tc39.es/ecma262/#sec-touint32>
    ToUint32,
    /// Implementation of <https://tc39.es/ecma262/#sec-touint8>
    ToUint8,

    ToResultString,
}

impl ConversionIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            "f32ToI32",
            "f64ToI64",
            "i32ToChar",
            "i32ToF32",
            "i64ToF64",
            "toInt16",
            "toInt32",
            "toInt64",
            "toInt8",
            "toResultString",
            "toString",
            "toUint16",
            "toUint32",
            "toUint64",
            "toUint64",
            "toUint8",
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::ToBigInt64 => "toInt64",
            Self::I32ToChar => "i32ToChar",
            Self::ToBigUint64 => "toUint64",
            Self::ToInt16 => "toInt16",
            Self::ToInt32 => "toInt32",
            Self::ToInt8 => "toInt8",
            Self::ToResultString => "toResultString",
            Self::ToString => "toString",
            Self::ToUint16 => "toUint16",
            Self::ToUint32 => "toUint32",
            Self::ToUint8 => "toUint8",
            Self::I32ToF32 => "i32ToF32",
            Self::I64ToF64 => "i64ToF64",
            Self::F32ToI32 => "f32ToI32",
            Self::F64ToI64 => "f64ToI64",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::I32ToF32 => output.push_str(
                "
                const i32ToF32 = i => (i32ToF32I[0] = i, i32ToF32F[0]);
            ",
            ),

            Self::F32ToI32 => output.push_str(
                "
                const f32ToI32 = f => (i32ToF32F[0] = f, i32ToF32I[0]);
            ",
            ),

            Self::I64ToF64 => output.push_str(
                "
                const i64ToF64 = i => (i64ToF64I[0] = i, i64ToF64F[0]);
            ",
            ),
            Self::ToBigInt64 => output.push_str("
                const toInt64 = val => BigInt.asIntN(64, BigInt(val));
            "),

            Self::ToBigUint64 => output.push_str("
                const toUint64 = val => BigInt.asUintN(64, BigInt(val));
            "),

            Self::ToInt16 => output.push_str("
                function toInt16(val) {
                    val >>>= 0;
                    val %= 2 ** 16;
                    if (val >= 2 ** 15) {
                        val -= 2 ** 16;
                    }
                    return val;
                }
            "),

            Self::ToInt32 => output.push_str("
                function toInt32(val) {
                    return val >> 0;
                }
            "),

            Self::ToInt8 => output.push_str("
                function toInt8(val) {
                    val >>>= 0;
                    val %= 2 ** 8;
                    if (val >= 2 ** 7) {
                        val -= 2 ** 8;
                    }
                    return val;
                }
            "),

            Self::ToResultString => output.push_str("
                function toResultString(obj) {
                    return JSON.stringify(obj, (_, v) => {
                        if (v && Object.getPrototypeOf(v) === Uint8Array.prototype) {
                            return `[${v[Symbol.toStringTag]} (${v.byteLength})]`;
                        } else if (typeof v === 'bigint') {
                            return v.toString();
                        }
                        return v;
                    });
                }
            "),

            Self::ToString => output.push_str("
                function toString(val) {
                    if (typeof val === 'symbol') throw new TypeError('symbols cannot be converted to strings');
                    return String(val);
                }
            "),

            Self::ToUint16 => output.push_str("
                function toUint16(val) {
                    val >>>= 0;
                    val %= 2 ** 16;
                    return val;
                }
            "),

            Self::ToUint32 => output.push_str("
                function toUint32(val) {
                    return val >>> 0;
                }
            "),

            Self::ToUint8 => output.push_str("
                function toUint8(val) {
                    val >>>= 0;
                    val %= 2 ** 8;
                    return val;
                }
            "),

            Self::F64ToI64 => output.push_str("
                const f64ToI64 = f => (i64ToF64F[0] = f, i64ToF64I[0]);
            "),

            Self::I32ToChar => {
                output.push_str("
                    function _i32ToChar = (n) => {
                        if (!n || typeof n !== 'number') { throw new Error('invalid i32'); }
                        if (n < 0) { throw new Error('i32 must be greater than zero'); }
                        if (n >= 0x110000) { throw new Error('invalid i32, out of range'); }
                        if (0xD800 <= n && n <= 0xDFFF) { throw new Error('invalid i32 out of range'); }
                        return String.fromCharCode(n);
                    }
                ");
            }

        }
    }
}
