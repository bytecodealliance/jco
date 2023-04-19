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

impl Intrinsic {
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