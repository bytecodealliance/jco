//! Intrinsics that represent helpers perform conversions

use std::fmt::Write;

use crate::intrinsics::Intrinsic;
use crate::source::Source;
use crate::uwriteln;

/// This enum contains intrinsics that help perform type conversions
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
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

    /// Function that requires validity of various numeric primitive types (or throws a `TypeError`)
    RequireValidNumericPrimitive,

    /// Function that checks validity of various numeric primitive types
    IsValidNumericPrimitive,
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
            Self::RequireValidNumericPrimitive.name(),
            Self::IsValidNumericPrimitive.name(),
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
            Self::RequireValidNumericPrimitive => "_requireValidNumericPrimitive",
            Self::IsValidNumericPrimitive => "_isValidNumericPrimitive",
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

            Self::F64ToI64 => output.push_str("
                const f64ToI64 = f => (i64ToF64F[0] = f, i64ToF64I[0]);
            "),

            Self::ToBigInt64 => {
                let ensure_valid_numeric_primitive_fn = Self::RequireValidNumericPrimitive.name();
                uwriteln!(
                    output,
                    r#"
                      function toInt64(val) {{
                          const converted = BigInt(val)
                          {ensure_valid_numeric_primitive_fn}('s64', converted);
                          return BigInt.asIntN(64, converted);
                      }}
                    "#
                )
            },

            Self::ToBigUint64 => {
                let ensure_valid_numeric_primitive_fn = Self::RequireValidNumericPrimitive.name();
                uwriteln!(
                    output,
                    r#"
                      function toUint64(val) {{
                          const converted = BigInt(val)
                          {ensure_valid_numeric_primitive_fn}('u64', converted);
                          return BigInt.asUintN(64, converted);
                      }}
                    "#
                );
            },

            Self::ToInt16 => {
                let ensure_valid_numeric_primitive_fn = Self::RequireValidNumericPrimitive.name();
                uwriteln!(
                    output,
                    r#"
                      function toInt16(val) {{
                          {ensure_valid_numeric_primitive_fn}('s16', val);
                          val >>>= 0;
                          val %= 2 ** 16;
                          if (val >= 2 ** 15) {{
                              val -= 2 ** 16;
                          }}
                          return val;
                      }}
                    "#
                );
            },

            Self::ToUint16 => {
                let ensure_valid_numeric_primitive_fn = Self::RequireValidNumericPrimitive.name();
                uwriteln!(
                    output,
                    r#"
                      function toUint16(val) {{
                          {ensure_valid_numeric_primitive_fn}('u16', val);
                          val >>>= 0;
                          val %= 2 ** 16;
                          return val;
                      }}
                    "#
                )
            },

            Self::ToInt32 => {
                let ensure_valid_numeric_primitive_fn = Self::RequireValidNumericPrimitive.name();
                uwriteln!(
                    output,
                    r#"
                      function toInt32(val) {{
                          {ensure_valid_numeric_primitive_fn}('s32', val);
                          return val >> 0;
                      }}
                    "#
                );
            },

            Self::ToInt8 => {
                let ensure_valid_numeric_primitive_fn = Self::RequireValidNumericPrimitive.name();
                uwriteln!(
                    output,
                    r#"
                      function toInt8(val) {{
                          {ensure_valid_numeric_primitive_fn}('s8', val);
                          val >>>= 0;
                          val %= 2 ** 8;
                          if (val >= 2 ** 7) {{
                              val -= 2 ** 8;
                          }}
                          return val;
                      }}
                   "#
                );
            },

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


            Self::ToUint32 => {
                let ensure_valid_numeric_primitive_fn = Self::RequireValidNumericPrimitive.name();
                uwriteln!(
                    output,
                    r#"
                      function toUint32(val) {{
                          {ensure_valid_numeric_primitive_fn}('u32', val);
                          return val >>> 0;
                      }}
                    "#
                )
            },

            Self::ToUint8 => {
                let ensure_valid_numeric_primitive_fn = Self::RequireValidNumericPrimitive.name();
                uwriteln!(
                    output,
                    r#"
                      function toUint8(val) {{
                          {ensure_valid_numeric_primitive_fn}('u8', val);
                          val >>>= 0;
                          val %= 2 ** 8;
                          return val;
                      }}
                    "#
                );
            },

            Self::I32ToChar => {
                output.push_str("
                    function i32ToChar(n) {
                        if (!n || typeof n !== 'number') { throw new Error('invalid i32'); }
                        if (n < 0) { throw new Error('i32 must be greater than zero'); }
                        if (n >= 0x110000) { throw new Error('invalid i32, out of range'); }
                        if (0xD800 <= n && n <= 0xDFFF) { throw new Error('invalid i32 out of range'); }
                        return String.fromCharCode(n);
                    }
                ");
            }

            Self::RequireValidNumericPrimitive => {
                let name = self.name();
                let is_valid_numeric_primitive_fn = Self::IsValidNumericPrimitive.name();

                output.push_str(&format!(r#"
                    function {name}(ty, v) {{
                        if (v === undefined  || v === null || !{is_valid_numeric_primitive_fn}(ty, v)) {{
                            throw new TypeError(`invalid ${{ty}} value [${{v}}]`);
                        }}
                        return true;
                    }}
                "#))
            }

            Self::IsValidNumericPrimitive => {
                let name = self.name();
                output.push_str(&format!(r#"
                    function {name}(ty, v) {{
                        if (v === undefined || v === null) {{ return false; }}
                        switch (ty) {{
                            case 'bool':
                                return v === 0 || v === 1;
                                break;
                            case 'u8':
                                return v >= 0 && v <= 255;
                                break;
                            case 's8':
                                return v >= -128 && v <= 127;
                                break;
                            case 'u16':
                                return v >= 0 && v <= 65535;
                                break;
                            case 's16':
                                return v >= -32768 && v <= 32767;
                            case 'u32':
                                return v >= 0 && v <= 4_294_967_295;
                            case 's32':
                                return v >= -2_147_483_648 && v <= 2_147_483_647;
                            case 'u64':
                                return typeof v === 'bigint' && v >= 0 && v <= 18_446_744_073_709_551_615n;
                            case 's64':
                                return typeof v === 'bigint' && v >= -9223372036854775808n && v <= 9223372036854775807n;
                                break;
                            case 'f32':
                            case 'f64': return typeof v === 'number';
                            default:
                                return false;
                        }}
                        return true;
                    }}
               "#
                ));
            }

        }
    }
}
