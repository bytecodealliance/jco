use crate::source::Source;
use crate::uwrite;
use std::collections::BTreeSet;
use std::fmt::Write;

#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum Intrinsic {
    Base64Compile,
    ClampGuest,
    ComponentError,
    DataView,
    F32ToI32,
    F64ToI64,
    FetchCompile,
    GetErrorPayload,
    HasOwnProperty,
    I32ToF32,
    I64ToF64,
    InstantiateCore,
    IsLE,
    ThrowInvalidBool,
    ThrowUninitialized,
    /// Implementation of https://tc39.es/ecma262/#sec-tobigint64.
    ToBigInt64,
    /// Implementation of https://tc39.es/ecma262/#sec-tobiguint64.
    ToBigUint64,
    /// Implementation of https://tc39.es/ecma262/#sec-toint16.
    ToInt16,
    /// Implementation of https://tc39.es/ecma262/#sec-toint32.
    ToInt32,
    /// Implementation of https://tc39.es/ecma262/#sec-toint8.
    ToInt8,
    /// Implementation of https://tc39.es/ecma262/#sec-tostring.
    ToString,
    /// Implementation of https://tc39.es/ecma262/#sec-touint16.
    ToUint16,
    /// Implementation of https://tc39.es/ecma262/#sec-touint32.
    ToUint32,
    /// Implementation of https://tc39.es/ecma262/#sec-touint8.
    ToUint8,
    Utf16Decoder,
    Utf16Encode,
    Utf8Decoder,
    Utf8Encode,
    Utf8EncodedLen,
    ValidateGuestChar,
    ValidateHostChar,
}

/// Emits the intrinsic `i` to this file and then returns the name of the
/// intrinsic.
pub fn render_intrinsics(
    intrinsics: &mut BTreeSet<Intrinsic>,
    no_nodejs_compat: bool,
    instantiation: bool,
) -> Source {
    let mut output = Source::default();

    // Handle intrinsic "dependence"
    if intrinsics.contains(&Intrinsic::GetErrorPayload) {
        intrinsics.insert(Intrinsic::HasOwnProperty);
    }
    if intrinsics.contains(&Intrinsic::Utf16Encode) {
        intrinsics.insert(Intrinsic::IsLE);
    }

    if intrinsics.contains(&Intrinsic::F32ToI32) || intrinsics.contains(&Intrinsic::I32ToF32) {
        output.push_str(
            "
            const i32ToF32I = new Int32Array(1);
            const i32ToF32F = new Float32Array(i32ToF32I.buffer);
        ",
        );
    }
    if intrinsics.contains(&Intrinsic::F64ToI64) || intrinsics.contains(&Intrinsic::I64ToF64) {
        output.push_str(
            "
            const i64ToF64I = new BigInt64Array(1);
            const i64ToF64F = new Float64Array(i64ToF64I.buffer);
        ",
        );
    }

    for i in intrinsics.iter() {
        match i {
          Intrinsic::ClampGuest => output.push_str("
              function clampGuest(i, min, max) {
                  if (i < min || i > max) \
                      throw new TypeError(`must be between ${min} and ${max}`);
                  return i;
              }
          "),

          Intrinsic::HasOwnProperty => output.push_str("
              const hasOwnProperty = Object.prototype.hasOwnProperty;
          "),

          Intrinsic::GetErrorPayload => {
              let hop = Intrinsic::HasOwnProperty.name();
              uwrite!(output, "
                  function getErrorPayload(e) {{
                      if (e && {hop}.call(e, 'payload')) return e.payload;
                      return e;
                  }}
              ")
          },

          Intrinsic::ComponentError => output.push_str("
              class ComponentError extends Error {
                  constructor (value) {
                      const enumerable = typeof value !== 'string';
                      super(enumerable ? `${String(value)} (see error.payload)` : value);
                      Object.defineProperty(this, 'payload', { value, enumerable });
                  }
              }
          "),

          Intrinsic::DataView => output.push_str("
              let dv = new DataView(new ArrayBuffer());
              const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
          "),

          Intrinsic::FetchCompile => if !no_nodejs_compat {
              output.push_str("
                  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
                  let _fs;
                  async function fetchCompile (url) {
                      if (isNode) {
                          _fs = _fs || await import('fs/promises');
                          return WebAssembly.compile(await _fs.readFile(url));
                      }
                      return fetch(url).then(WebAssembly.compileStreaming);
                  }
              ")
          } else {
              output.push_str("
                  const fetchCompile = url => fetch(url).then(WebAssembly.compileStreaming);
              ")
          },

          Intrinsic::Base64Compile => if !no_nodejs_compat {
              output.push_str("
                  const base64Compile = str => WebAssembly.compile(typeof Buffer !== 'undefined' ? Buffer.from(str, 'base64') : Uint8Array.from(atob(str), b => b.charCodeAt(0)));
              ")
          } else {
              output.push_str("
                  const base64Compile = str => WebAssembly.compile(Uint8Array.from(atob(str), b => b.charCodeAt(0)));
              ")
          },

          Intrinsic::InstantiateCore => if !instantiation {
              output.push_str("
                  const instantiateCore = WebAssembly.instantiate;
              ")
          },

          Intrinsic::IsLE => output.push_str("
              const isLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
          "),

          Intrinsic::ValidateGuestChar => output.push_str("
              function validateGuestChar(i) {
                  if ((i > 0x10ffff) || (i >= 0xd800 && i <= 0xdfff)) \
                      throw new TypeError(`not a valid char`);
                  return String.fromCodePoint(i);
              }
          "),

          // TODO: this is incorrect. It at least allows strings of length > 0
          // but it probably doesn't do the right thing for unicode or invalid
          // utf16 strings either.
          Intrinsic::ValidateHostChar => output.push_str("
              function validateHostChar(s) {
                  if (typeof s !== 'string') \
                      throw new TypeError(`must be a string`);
                  return s.codePointAt(0);
              }
          "),


          Intrinsic::ToInt32 => output.push_str("
              function toInt32(val) {
                  return val >> 0;
              }
          "),
          Intrinsic::ToUint32 => output.push_str("
              function toUint32(val) {
                  return val >>> 0;
              }
          "),

          Intrinsic::ToInt16 => output.push_str("
              function toInt16(val) {
                  val >>>= 0;
                  val %= 2 ** 16;
                  if (val >= 2 ** 15) {
                      val -= 2 ** 16;
                  }
                  return val;
              }
          "),
          Intrinsic::ToUint16 => output.push_str("
              function toUint16(val) {
                  val >>>= 0;
                  val %= 2 ** 16;
                  return val;
              }
          "),
          Intrinsic::ToInt8 => output.push_str("
              function toInt8(val) {
                  val >>>= 0;
                  val %= 2 ** 8;
                  if (val >= 2 ** 7) {
                      val -= 2 ** 8;
                  }
                  return val;
              }
          "),
          Intrinsic::ToUint8 => output.push_str("
              function toUint8(val) {
                  val >>>= 0;
                  val %= 2 ** 8;
                  return val;
              }
          "),

          Intrinsic::ToBigInt64 => output.push_str("
              const toInt64 = val => BigInt.asIntN(64, val);
          "),
          Intrinsic::ToBigUint64 => output.push_str("
              const toUint64 = val => BigInt.asUintN(64, val);
          "),

          // Calling `String` almost directly calls `ToString`, except that it also allows symbols,
          // which is why we have the symbol-rejecting branch above.
          //
          // Definition of `String`: https://tc39.es/ecma262/#sec-string-constructor-string-value
          Intrinsic::ToString => output.push_str("
              function toString(val) {
                  if (typeof val === 'symbol') throw new TypeError('symbols cannot be converted to strings');
                  return String(val);
              }
          "),

          Intrinsic::I32ToF32 => output.push_str("
              const i32ToF32 = i => (i32ToF32I[0] = i, i32ToF32F[0]);
          "),
          Intrinsic::F32ToI32 => output.push_str("
              const f32ToI32 = f => (i32ToF32F[0] = f, i32ToF32I[0]);
          "),
          Intrinsic::I64ToF64 => output.push_str("
              const i64ToF64 = i => (i64ToF64I[0] = i, i64ToF64F[0]);
          "),
          Intrinsic::F64ToI64 => output.push_str("
              const f64ToI64 = f => (i64ToF64F[0] = f, i64ToF64I[0]);
          "),

          Intrinsic::Utf8Decoder => output.push_str("
              const utf8Decoder = new TextDecoder();
          "),

          Intrinsic::Utf16Decoder => output.push_str("
              const utf16Decoder = new TextDecoder('utf-16');
          "),

          Intrinsic::Utf8EncodedLen => {},

          Intrinsic::Utf8Encode => output.push_str("
              const utf8Encoder = new TextEncoder();

              let utf8EncodedLen = 0;
              function utf8Encode(s, realloc, memory) {
                  if (typeof s !== 'string') \
                      throw new TypeError('expected a string');
                  if (s.length === 0) {
                      utf8EncodedLen = 0;
                      return 1;
                  }
                  let allocLen = 0;
                  let ptr = 0;
                  let writtenTotal = 0;
                  while (s.length > 0) {
                      ptr = realloc(ptr, allocLen, 1, allocLen + s.length);
                      allocLen += s.length;
                      const { read, written } = utf8Encoder.encodeInto(
                          s,
                          new Uint8Array(memory.buffer, ptr + writtenTotal, allocLen - writtenTotal),
                      );
                      writtenTotal += written;
                      s = s.slice(read);
                  }
                  if (allocLen > writtenTotal)
                      ptr = realloc(ptr, allocLen, 1, writtenTotal);
                  utf8EncodedLen = writtenTotal;
                  return ptr;
              }
          "),

          Intrinsic::Utf16Encode => {
              let is_le = Intrinsic::IsLE.name();
              uwrite!(output, "
                  function utf16Encode (str, realloc, memory) {{
                      const len = str.length, ptr = realloc(0, 0, 2, len * 2), out = new Uint16Array(memory.buffer, ptr, len);
                      let i = 0;
                      if ({is_le}) {{
                          while (i < len) out[i] = str.charCodeAt(i++);
                      }} else {{
                          while (i < len) {{
                              const ch = str.charCodeAt(i);
                              out[i++] = (ch & 0xff) << 8 | ch >>> 8;
                          }}
                      }}
                      return ptr;
                  }}
              ");
          },

          Intrinsic::ThrowInvalidBool => output.push_str("
              function throwInvalidBool() {
                  throw new TypeError('invalid variant discriminant for bool');
              }
          "),

          Intrinsic::ThrowUninitialized => output.push_str("
              function throwUninitialized() {
                  throw new TypeError('Wasm uninitialized use `await $init` first');
              }
          "),
      }
    }

    output
}

impl Intrinsic {
    pub fn get_all_names() -> &'static [&'static str] {
        &[
            "base64Compile",
            "clampGuest",
            "ComponentError",
            "dataView",
            "f32ToI32",
            "f64ToI64",
            "getErrorPayload",
            "hasOwnProperty",
            "i32ToF32",
            "i64ToF64",
            "instantiateCore",
            "isLE",
            "fetchCompile",
            "throwInvalidBool",
            "throwUninitialized",
            "toInt64",
            "toUint64",
            "toInt16",
            "toInt32",
            "toInt8",
            "toString",
            "toUint16",
            "toUint32",
            "toUint8",
            "utf16Decoder",
            "utf16Encode",
            "utf8Decoder",
            "utf8Encode",
            "utf8EncodedLen",
            "validateGuestChar",
            "validateHostChar",
        ]
    }

    pub fn name(&self) -> &'static str {
        match self {
            Intrinsic::Base64Compile => "base64Compile",
            Intrinsic::ClampGuest => "clampGuest",
            Intrinsic::ComponentError => "ComponentError",
            Intrinsic::DataView => "dataView",
            Intrinsic::F32ToI32 => "f32ToI32",
            Intrinsic::F64ToI64 => "f64ToI64",
            Intrinsic::GetErrorPayload => "getErrorPayload",
            Intrinsic::HasOwnProperty => "hasOwnProperty",
            Intrinsic::I32ToF32 => "i32ToF32",
            Intrinsic::I64ToF64 => "i64ToF64",
            Intrinsic::InstantiateCore => "instantiateCore",
            Intrinsic::IsLE => "isLE",
            Intrinsic::FetchCompile => "fetchCompile",
            Intrinsic::ThrowInvalidBool => "throwInvalidBool",
            Intrinsic::ThrowUninitialized => "throwUninitialized",
            Intrinsic::ToBigInt64 => "toInt64",
            Intrinsic::ToBigUint64 => "toUint64",
            Intrinsic::ToInt16 => "toInt16",
            Intrinsic::ToInt32 => "toInt32",
            Intrinsic::ToInt8 => "toInt8",
            Intrinsic::ToString => "toString",
            Intrinsic::ToUint16 => "toUint16",
            Intrinsic::ToUint32 => "toUint32",
            Intrinsic::ToUint8 => "toUint8",
            Intrinsic::Utf16Decoder => "utf16Decoder",
            Intrinsic::Utf16Encode => "utf16Encode",
            Intrinsic::Utf8Decoder => "utf8Decoder",
            Intrinsic::Utf8Encode => "utf8Encode",
            Intrinsic::Utf8EncodedLen => "utf8EncodedLen",
            Intrinsic::ValidateGuestChar => "validateGuestChar",
            Intrinsic::ValidateHostChar => "validateHostChar",
        }
    }
}
