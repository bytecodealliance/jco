//! Intrinsics that represent helpers that enable Lower integration

use crate::intrinsics::Intrinsic;
use crate::intrinsics::component::ComponentIntrinsic;
use crate::intrinsics::p3::{async_stream::AsyncStreamIntrinsic, error_context::ErrCtxIntrinsic};
use crate::intrinsics::string::StringIntrinsic;
use crate::source::Source;

use super::conversion::ConversionIntrinsic;

/// This enum contains intrinsics that enable Lower
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum LowerIntrinsic {
    /// Lower a boolean into provided storage, given a core type
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value.
    LowerFlatBool,

    /// Lower a s8 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from -128 to 127.
    LowerFlatS8,

    /// Lower a u8 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from 0 to 255.
    LowerFlatU8,

    /// Lower a s16 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from -32,768 to 32,767.
    LowerFlatS16,

    /// Lower a u16 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from 0 to 65,535.
    LowerFlatU16,

    /// Lower a s32 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from -2,147,483,648 to 2,147,483,647.
    LowerFlatS32,

    /// Lower a u32 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from 0 to 4,294,967,295.
    LowerFlatU32,

    /// Lower a s64 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807
    LowerFlatS64,

    /// Lower a u64 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value,
    /// which is bounded from 0 to 18,446,744,073,709,551,615.
    LowerFlatU64,

    /// Lower a f32 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    LowerFlatFloat32,

    /// Lower a f64 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    LowerFlatFloat64,

    /// Lower a char into provided storage given core type(s)
    LowerFlatChar,

    /// Lower a string into provided storage given core type(s), using encoding in lower ctx
    LowerFlatStringAny,

    /// Lower a UTF8 string into provided storage given core type(s)
    LowerFlatStringUtf8,

    /// Lower a UTF16 string into provided storage given core type(s)
    LowerFlatStringUtf16,

    /// Lower a record into provided storage given core type(s)
    LowerFlatRecord,

    /// Lower a variant into provided storage given core type(s)
    LowerFlatVariant,

    /// Lower a list into provided storage given core type(s)
    LowerFlatList,

    /// Lower a tuple into provided storage given core type(s)
    LowerFlatTuple,

    /// Lower flags into provided storage given core type(s)
    LowerFlatFlags,

    /// Lower flags into provided storage given core type(s)
    LowerFlatEnum,

    /// Lower an option into provided storage given core type(s)
    LowerFlatOption,

    /// Lower a result into provided storage given core type(s)
    LowerFlatResult,

    /// Lower a owned resource into provided storage given core type(s)
    LowerFlatOwn,

    /// Lower a borrowed resource into provided storage given core type(s)
    LowerFlatBorrow,

    /// Lower a future into provided storage given core type(s)
    LowerFlatFuture,

    /// Lower a stream into provided storage given core type(s)
    LowerFlatStream,

    /// Lower an error-context into provided storage given core type(s)
    LowerFlatErrorContext,
}

impl LowerIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        []
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::LowerFlatBool => "_lowerFlatBool",
            Self::LowerFlatS8 => "_lowerFlatS8",
            Self::LowerFlatU8 => "_lowerFlatU8",
            Self::LowerFlatS16 => "_lowerFlatS16",
            Self::LowerFlatU16 => "_lowerFlatU16",
            Self::LowerFlatS32 => "_lowerFlatS32",
            Self::LowerFlatU32 => "_lowerFlatU32",
            Self::LowerFlatS64 => "_lowerFlatS64",
            Self::LowerFlatU64 => "_lowerFlatU64",
            Self::LowerFlatFloat32 => "_lowerFlatFloat32",
            Self::LowerFlatFloat64 => "_lowerFlatFloat64",
            Self::LowerFlatChar => "_lowerFlatChar",
            Self::LowerFlatStringAny => "_lowerFlatStringAny",
            Self::LowerFlatStringUtf8 => "_lowerFlatStringUTF8",
            Self::LowerFlatStringUtf16 => "_lowerFlatStringUTF16",
            Self::LowerFlatRecord => "_lowerFlatRecord",
            Self::LowerFlatVariant => "_lowerFlatVariant",
            Self::LowerFlatList => "_lowerFlatList",
            Self::LowerFlatTuple => "_lowerFlatTuple",
            Self::LowerFlatFlags => "_lowerFlatFlags",
            Self::LowerFlatEnum => "_lowerFlatEnum",
            Self::LowerFlatOption => "_lowerFlatOption",
            Self::LowerFlatResult => "_lowerFlatResult",
            Self::LowerFlatOwn => "_lowerFlatOwn",
            Self::LowerFlatBorrow => "_lowerFlatBorrow",
            Self::LowerFlatFuture => "_lowerFlatFuture",
            Self::LowerFlatStream => "_lowerFlatStream",
            Self::LowerFlatErrorContext => "_lowerFlatErrorContext",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::LowerFlatBool => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();
                output.push_str(&format!(r#"
                    function _lowerFlatBool(ctx) {{
                        {debug_log_fn}('[_lowerFlatBool()] args', {{ ctx }});

                        if (!ctx.memory) {{ throw new Error("missing memory for lower"); }}
                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of core vals (expected 1)`);
                        }}

                        {require_valid_numeric_primitive_fn}.bind('bool', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 1;
                    }}
                "#));
            }

            Self::LowerFlatS8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();
                output.push_str(&format!(r#"
                    function _lowerFlatS8(ctx) {{
                        {debug_log_fn}('[_lowerFlatS8()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of core vals (expected 1)`);
                        }}
                        if (!ctx.memory) {{ throw new Error("missing memory for lower"); }}

                        {require_valid_numeric_primitive_fn}.bind('s8', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setInt32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 1;
                    }}
                "#));
            }

            Self::LowerFlatU8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_u8_fn = self.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!(r#"
                    function {lower_flat_u8_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_u8_fn}()] args', ctx);

                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of core vals (expected 1)`);
                        }}

                        {require_valid_numeric_primitive_fn}.bind('u8', ctx.vals[0]);

                        if (!ctx.memory) {{ throw new Error("missing memory for lower"); }}
                        new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 1;
                    }}
                "#));
            }

            Self::LowerFlatS16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_s16_fn = self.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!(r#"
                    function {lower_flat_s16_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_s16_fn}()] args', {{ ctx }});

                        if (!ctx.memory) {{ throw new Error("missing memory for lower"); }}
                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of core vals (expected 1)`);
                        }}

                        {require_valid_numeric_primitive_fn}.bind('s16', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setInt16(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 2;

                        const rem = ctx.storagePtr % 2;
                        if (rem !== 0) {{ ctx.storagePtr += (2 - rem); }}
                    }}
                "#));
            }

            Self::LowerFlatU16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_u16_fn = self.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!(r#"
                    function {lower_flat_u16_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_u16_fn}()] args', {{ ctx }});

                        if (!ctx.memory) {{ throw new Error("missing memory for lower"); }}
                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of core vals (expected 1)`);
                        }}

                        {require_valid_numeric_primitive_fn}.bind('u16', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setUint16(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 2;

                        const rem = ctx.storagePtr % 2;
                        if (rem !== 0) {{ ctx.storagePtr += (2 - rem); }}
                    }}
                "#));
            }

            Self::LowerFlatS32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_s32_fn = self.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!(r#"
                    function {lower_flat_s32_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_s32_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{
                            throw new Error(`unexpected number [${{ctx.vals.length}}] of core vals (expected 1)`);
                        }}
                        {require_valid_numeric_primitive_fn}.bind('s32', ctx.vals[0]);

                        new DataView(ctx.memory.buffer).setInt32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 4;

                        const rem = ctx.storagePtr % 4;
                        if (rem !== 0) {{ ctx.storagePtr += (4 - rem); }}
                    }}
                "#));
            }

            // TODO(fix) can u32s be lowered indirectly? maybe never?
            // discrepancy of indirect values and indirect params (where to get storagePtr/len)
            // to the function versus params that actually indicate where to write!
            Self::LowerFlatU32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_u32_fn = self.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!(r#"
                    function {lower_flat_u32_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_u32_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{
                            throw new Error(`expected single value to lower, got [${{ctx.vals.length}}]`);
                        }}

                        {require_valid_numeric_primitive_fn}.bind('u32', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 4;

                        const rem = ctx.storagePtr % 4;
                        if (rem !== 0) {{ ctx.storagePtr += (4 - rem); }}
                    }}
                "#));
            }

            Self::LowerFlatS64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_s64_fn = self.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!("
                    function {lower_flat_s64_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_s64_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}

                        {require_valid_numeric_primitive_fn}.bind('s64', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setBigInt64(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 8;

                        const rem = ctx.storagePtr % 8;
                        if (rem !== 0) {{ ctx.storagePtr += (8 - rem); }}
                    }}
                "));
            }

            Self::LowerFlatU64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_u64_fn = self.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!("
                    function {lower_flat_u64_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_u64_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}

                        {require_valid_numeric_primitive_fn}.bind('u64', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setBigUint64(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 8;

                        const rem = ctx.storagePtr % 8;
                        if (rem !== 0) {{ ctx.storagePtr += (8 - rem); }}
                    }}
                "));
            }

            Self::LowerFlatFloat32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_f32_fn = self.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!("
                    function {lower_flat_f32_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_f32_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}

                        {require_valid_numeric_primitive_fn}.bind('f32', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setFloat32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 8;

                        const rem = ctx.storagePtr % 8;
                        if (rem !== 0) {{ ctx.storagePtr += (8 - rem); }}
                    }}
                "));
            }

            Self::LowerFlatFloat64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_f64_fn = self.name();
                let require_valid_numeric_primitive_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::RequireValidNumericPrimitive).name();

                output.push_str(&format!("
                    function {lower_flat_f64_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_f64_fn}()] args', {{ ctx }});

                        if (vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}

                        {require_valid_numeric_primitive_fn}.bind('f64', ctx.vals[0]);
                        new DataView(ctx.memory.buffer).setFloat64(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 8;

                        const rem = ctx.storagePtr % 8;
                        if (rem !== 0) {{ ctx.storagePtr += (8 - rem); }}
                    }}
                "));
            }

            Self::LowerFlatChar => {
                let i32_to_char_fn = Intrinsic::Conversion(ConversionIntrinsic::I32ToChar).name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatChar(ctx) {{
                        {debug_log_fn}('[_lowerFlatChar()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, {i32_to_char_fn}(ctx.vals[0]), true);

                        ctx.storagePtr += 4;

                        const rem = ctx.storagePtr % 4;
                        if (rem !== 0) {{ ctx.storagePtr += (4 - rem); }}
                    }}
                "));
            }

            Self::LowerFlatStringAny => {
                let lower_flat_string_any_fn = self.name();
                let lower_flat_string_utf8_fn = Self::LowerFlatStringUtf8.name();
                let lower_flat_string_utf16_fn = Self::LowerFlatStringUtf16.name();
                output.push_str(&format!("
                    function {lower_flat_string_any_fn}(ctx) {{
                        switch (ctx.stringEncoding) {{
                            case 'utf8':
                                return {lower_flat_string_utf8_fn}(ctx);
                            case 'utf16':
                                return {lower_flat_string_utf16_fn}(ctx);
                            default:
                                throw new Error(`missing/unrecognized/unsupported string encoding [${{ctx.stringEncoding}}]`);
                        }}
                    }}
                "));
            }

            Self::LowerFlatStringUtf16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_string_utf16_fn = self.name();
                let utf16_encode_fn = Intrinsic::String(StringIntrinsic::Utf16Encode).name();

                output.push_str(&format!("
                    function {lower_flat_string_utf16_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_string_utf16_fn}()] args', {{ ctx }});
                        if (!ctx.realloc) {{ throw new Error('missing realloc during flat string lower'); }}

                        const s = ctx.vals[0];
                        const {{ ptr, len, codepoints }} = {utf16_encode_fn}(ctx.vals[0], ctx.realloc, ctx.memory);

                        const view = new DataView(ctx.memory.buffer);
                        view.setUint32(ctx.storagePtr, ptr, true);
                        view.setUint32(ctx.storagePtr + 4, codepoints, true);

                        const bytes = new Uint16Array(ctx.memory.buffer, start, codeUnits);
                        if (ctx.memory.buffer.byteLength < start + bytes.byteLength) {{
                            throw new Error('memory out of bounds');
                        }}
                        if (ctx.storageLen !== undefined && ctx.storageLen !== bytes.byteLength) {{
                            throw new Error(`storage length [${{ctx.storageLen}}] != [${{bytes.byteLength}}])`);
                        }}
                        new Uint16Array(ctx.memory.buffer, ctx.storagePtr).set(bytes);

                        ctx.storagePtr += len;
                    }}
                "));
            }

            Self::LowerFlatStringUtf8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_string_utf8_fn = self.name();
                let utf8_encode_fn = Intrinsic::String(StringIntrinsic::Utf8Encode).name();

                output.push_str(&format!("
                    function {lower_flat_string_utf8_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_string_utf8_fn}()] args', ctx);
                        if (!ctx.realloc) {{ throw new Error('missing realloc during flat string lower'); }}

                        const s = ctx.vals[0];
                        const {{ ptr, len, codepoints }} = {utf8_encode_fn}(ctx.vals[0], ctx.realloc, ctx.memory);

                        const view = new DataView(ctx.memory.buffer);
                        view.setUint32(ctx.storagePtr, ptr, true);
                        view.setUint32(ctx.storagePtr + 4, codepoints, true);

                        ctx.storagePtr += len;
                    }}
                "));
            }

            Self::LowerFlatRecord => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_record_fn = self.name();

                output.push_str(&format!("
                    function {lower_flat_record_fn}(fieldMetas) {{
                        return function {lower_flat_record_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_record_fn}()] args', {{ ctx }});

                            const [start] = vals;
                            if (ctx.storageLen !== undefined && size !== undefined && size > ctx.storageLen) {{
                                throw new Error('not enough storage remaining for record flat lower');
                            }}

                            const data = new Uint8Array(ctx.memory.buffer, start, size);
                            new Uint8Array(ctx.memory.buffer, ctx.storagePtr, size).set(data);

                            ctx.storagePtr += data.byteLength;
                        }}
                    }}
                "));
            }

            Self::LowerFlatVariant => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_variant_fn = self.name();
                let lower_u8_fn = Self::LowerFlatU8.name();
                let lower_u16_fn = Self::LowerFlatU16.name();
                let lower_u32_fn = Self::LowerFlatU32.name();

                output.push_str(&format!(r#"
                    function {lower_flat_variant_fn}(lowerMetas) {{
                        return function {lower_flat_variant_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_variant_fn}()] args', {{ ctx }});

                            const {{ tag, val }} = ctx.vals[0];
                            const disc = lowerMetas.findIndex(m => m[0] === tag);
                            if (disc === -1) {{
                                throw new Error(`invalid variant tag/discriminant [${{tag}}] (valid tags: ${{variantMetas.map(m => m[0])}})`);
                            }}

                            const [ _tag, lowerFn, size32, align32, payloadOffset32 ] = lowerMetas[disc];

                            const originalPtr = ctx.resultPtr;
                            ctx.vals = [disc];
                            let discLowerRes;
                            if (lowerMetas.length < 256) {{
                                discLowerRes = {lower_u8_fn}(ctx);
                            }} else if (lowerMetas.length >= 256 && lowerMetas.length < 65536) {{
                                discLowerRes = {lower_u16_fn}(ctx);
                            }} else if (lowerMetas.length >= 65536 && lowerMetas.length < 4_294_967_296) {{
                                discLowerRes = {lower_u32_fn}(ctx);
                            }} else {{
                                throw new Error(`unsupported number of cases [${{lowerMetas.length}}]`);
                            }}

                            ctx.resultPtr = originalPtr + payloadOffset32;

                            let payloadBytesWritten = 0;
                            if (lowerFn) {{ lowerFn({{ ...ctx, vals: [val] }}); }}

                            let bytesWritten = payloadOffset + payloadBytesWritten;

                            const rem = ctx.storagePtr % align32;
                            if (rem !== 0) {{
                                const pad = align32 - rem;
                                ctx.storagePtr += pad;
                                bytesWritten += pad;
                            }}

                            ctx.storagePtr += bytesWritten;
                        }}
                    }}
                "#));
            }

            Self::LowerFlatList => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_list_fn = self.name();

                output.push_str(&format!(r#"
                    function {lower_flat_list_fn}(args) {{
                        const {{ elemLowerFn }} = args;
                        if (!elemLowerFn) {{ throw new TypeError("missing/invalid element lower fn for list"); }}

                        return function {lower_flat_list_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_list_fn}()] args', {{ ctx }});

                            if (ctx.useDirectParams) {{
                                if (ctx.params.length < 2) {{ throw new Error('insufficient params left to lower list'); }}
                                const storagePtr = ctx.params[0];
                                const elemCount = ctx.params[1];
                                ctx.params = ctx.params.slice(2);

                                const list = ctx.vals[0];
                                if (!list) {{ throw new Error("missing direct param value"); }}

                                const lowerCtx = {{
                                    storagePtr,
                                    memory: ctx.memory,
                                    stringEncoding: ctx.stringEncoding,
                                }};
                                for (let idx = 0; idx < list.length; idx++) {{
                                    lowerCtx.vals = list.slice(idx, idx+1);
                                    elemLowerFn(lowerCtx);
                                }}

                                const bytesLowered = lowerCtx.storagePtr - ctx.storagePtr;
                                ctx.storagePtr = lowerCtx.storagePtr;

                                ctx.storagePtr += bytesLowered;
                                return;
                            }}

                            if (ctx.vals.length !== 2) {{
                                throw new Error('indirect parameter loading must have a pointer and length as vals');
                            }}
                            let [valStartPtr, valLen] = ctx.vals;
                            const totalSizeBytes = valLen * size;
                            if (ctx.storageLen !== undefined && totalSizeBytes > ctx.storageLen) {{
                                throw new Error('not enough storage remaining for list flat lower');
                            }}

                            const data = new Uint8Array(ctx.memory.buffer, valStartPtr, totalSizeBytes);
                            new Uint8Array(ctx.memory.buffer, ctx.storagePtr, totalSizeBytes).set(data);

                            ctx.storagePtr += totalSizeBytes;
                        }}
                    }}
                "#));
            }

            // TODO: broken? tuple needs align/size?
            Self::LowerFlatTuple => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_tuple_fn = self.name();

                output.push_str(&format!(
                    "
                    function {lower_flat_tuple_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_tuple_fn}()] args', {{ ctx }});

                        let [start, len] = ctx.vals;
                        if (ctx.storageLen !== undefined && len > ctx.storageLen) {{
                            throw new Error('not enough storage remaining for tuple flat lower');
                        }}

                        const data = new Uint8Array(ctx.memory.buffer, start, len);
                        new Uint8Array(ctx.memory.buffer, ctx.storagePtr, len).set(data);

                        ctx.storagePtr += data.byteLength;
                    }}
                "
                ));
            }

            Self::LowerFlatFlags => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_flags_fn = self.name();

                output.push_str(&format!("
                    function {lower_flat_flags_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_flags_fn}()] args', {{ ctx }});

                        if (ctx.vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(ctx.memory.buffer).setInt32(ctx.storagePtr, ctx.vals[0], true);

                        ctx.storagePtr += 4;

                        const rem = ctx.storagePtr % 4;
                        if (rem !== 0) {{ ctx.storagePtr += (4 - rem); }}
                    }}
                "));
            }

            Self::LowerFlatEnum => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_enum_fn = self.name();

                output.push_str(&format!("
                    function {lower_flat_enum_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_enum_fn}()] args', {{ ctx }});

                        let [start] = vals;
                        if (ctx.storageLen !== undefined && size !== undefined && size > ctx.storageLen) {{
                            throw new Error('not enough storage remaining for enum flat lower');
                        }}

                        const data = new Uint8Array(ctx.memory.buffer, start, size);
                        new Uint8Array(ctx.memory.buffer, ctx.storagePtr, size).set(data);

                        ctx.storagePtr += data.byteLength;
                    }}
                "));
            }

            Self::LowerFlatOption => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_option_fn = self.name();
                let lower_variant_fn = Self::LowerFlatVariant.name();
                output.push_str(&format!(
                    "
                    function {lower_flat_option_fn}(lowerMetas) {{
                        function {lower_flat_option_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lower_flat_option_fn}()] args', {{ ctx }});
                            return {lower_variant_fn}(lowerMetas)(ctx);
                        }}
                    }}
                "
                ));
            }

            Self::LowerFlatResult => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_result_fn = self.name();
                let lower_variant_fn = Self::LowerFlatVariant.name();
                output.push_str(&format!(
                    r#"
                    function {lower_flat_result_fn}(lowerMetas) {{
                       return function {lower_flat_result_fn}Inner(ctx) {{
                           {debug_log_fn}('[{lower_flat_result_fn}()] args', {{ lowerMetas }});
                           return {lower_variant_fn}(lowerMetas)(ctx);
                       }};
                    }}
                    "#
                ));
            }

            // TODO: implement lower flat own
            Self::LowerFlatOwn => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_own_fn = self.name();
                output.push_str(&format!(
                    "
                    function {lower_flat_own_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_own_fn}()] args', {{ ctx }});
                        throw new Error('flat lower for owned resources not yet implemented!');
                    }}
                "
                ));
            }

            Self::LowerFlatBorrow => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_borrow_fn = self.name();
                output.push_str(&format!(
                    "
                    function {lower_flat_borrow_fn}(ctx) {{
                        {debug_log_fn}('[{lower_flat_borrow_fn}()] args', {{ ctx }});
                        throw new Error('flat lower for borrowed resources is not supported!');
                    }}
                "
                ));
            }

            Self::LowerFlatFuture => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_future_fn = self.name();
                output.push_str(&format!(
                    "
                    function {lower_flat_future_fn}(futureTableIdx, ctx) {{
                        {debug_log_fn}('[{lower_flat_future_fn}()] args', {{ ctx }});
                        throw new Error('flat lower for futures not yet implemented!');
                    }}
                "
                ));
            }

            Self::LowerFlatStream => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_stream_fn = self.name();
                let global_stream_map = AsyncStreamIntrinsic::GlobalStreamMap.name();
                let external_stream_class = AsyncStreamIntrinsic::ExternalStreamClass.name();
                let internal_stream_class = AsyncStreamIntrinsic::InternalStreamClass.name();

                // TODO: fix writable is getting dropped before it can be read!!
                // We need to do some waiting?
                // Last write should have been triggering the reader to progress...
                // Then the last reads return all the data???

                output.push_str(&format!(
                    r#"
                    function {lower_flat_stream_fn}(streamTableIdx, ctx) {{
                        {debug_log_fn}('[{lower_flat_stream_fn}()] args', {{ streamTableIdx, ctx }});

                        const {{
                            memory,
                            realloc,
                            vals,
                            storagePtr: resultPtr,
                        }} = ctx;

                        const externalStream = vals[0];
                        if (!externalStream || !(externalStream instanceof {external_stream_class})) {{
                            throw new Error("invalid external stream value");
                        }}

                        const globalRep = externalStream.globalRep();
                        const internalStream = {global_stream_map}.get(globalRep);
                        if (!internalStream || !(internalStream instanceof {internal_stream_class})) {{
                            throw new Error(`failed to find internal stream with rep [${{globalRep}}]`);
                        }}

                        const readEnd = internalStream.readEnd();
                        const waitableIdx = readEnd.waitableIdx();

                        // Write the idx of the waitable to memory (a waiting async task or caller)
                        if (resultPtr) {{
                            new DataView(ctx.memory.buffer).setUint32(resultPtr, waitableIdx, true);
                        }}

                        // TODO: if we flat lower another way (host -> guest async) we need to actually
                        // modify the guests table's afresh, we can't just use the global rep!
                        // (can detect this by whether the external stream has a rep or not)

                        return waitableIdx
                    }}
                "#
                ));
            }

            // When a component-model level error context is lowered, it contains the global error-context
            // and not a component-local handle value (as it did pre-lift).
            //
            // By lowering the error context into a given component (w/ a given error context table)
            // we translate the global component model level rep into a local handle.
            //
            // see: `LiftIntrinsic::LiftFlatErrorContext`
            Self::LowerFlatErrorContext => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_flat_error_context_fn = self.name();
                let lower_u32_fn = Self::LowerFlatU32.name();
                let create_local_handle_fn = ErrCtxIntrinsic::CreateLocalHandle.name();
                let err_ctx_global_ref_count_add_fn = ErrCtxIntrinsic::GlobalRefCountAdd.name();
                let get_or_create_async_state_fn = ComponentIntrinsic::GetOrCreateAsyncState.name();
                let global_tbl = ErrCtxIntrinsic::ComponentGlobalTable.name();
                let get_local_tbl_fn = ErrCtxIntrinsic::GetLocalTable.name();

                // NOTE: at this point the error context has already been lowered into the appropriate
                // place for us via error context transfer.
                output.push_str(&format!(r#"
                    function {lower_flat_error_context_fn}(errCtxTableIdx, ctx) {{
                        {debug_log_fn}('[{lower_flat_error_context_fn}()] args', {{ errCtxTableIdx, ctx }});
                        const {{ memory, realloc, vals, storagePtr, storageLen, componentIdx }} = ctx;

                        const errCtxGlobalRep = vals[0];

                        const globalTable = {global_tbl}.get();
                        const globalErrCtx = globalTable.get(errCtxGlobalRep);

                        // Clean up the previous error context, if necessary
                        const prevComponentState = {get_or_create_async_state_fn}(globalErrCtx.componentIdx);
                        const prevLocalErrCtx = prevComponentState.handles.get(globalErrCtx.waitableIdx);
                        if (prevLocalErrCtx.refCount === 0) {{
                            const removed = prevComponentState.remove(globalErrCtx.waitableIdx);
                            if (!removed) {{
                                throw new Error(`failed to remove err ctx [${{globalErrCtx.waitableIdx}}], component [${{globalErrCtx.componentIdx}}]`);
                            }}
                            const prevLocalErrCtxTable = {get_local_tbl_fn}(globalErrCtx.componentIdx, globalErrCtx.localTableIdx);
                            prevLocalErrCtxTable.remove(globalErrCtx.localIdx)
                        }}

                        // Insert the error context into the destination tables
                        const localErrCtxTable = {get_local_tbl_fn}(componentIdx, errCtxTableIdx, {{ upsert: true }});

                        let handle = localErrCtxTable.get(componentIdx, errCtxTableIdx, );
                        if (handle === undefined) {{
                            const {{ waitableIdx, localIdx }} = {create_local_handle_fn}(
                                componentIdx,
                                localErrCtxTable,
                                errCtxGlobalRep,
                            );
                            handle = waitableIdx;
                        }} else {{
                            const cstate = {get_or_create_async_state_fn}(componentIdx);
                            const localErrCtx = cstate.handles.get(handle);
                            localErrCtx.refCount += 1;
                            localErrCtx.componentIdx = componentIdx;
                            localErrCtx.localIdx = errCtx.localIdx;
                            localErrCtx.localTableIdx = errCtxTableIdx;
                        }}

                        {err_ctx_global_ref_count_add_fn}(errCtxGlobalRep, -1);

                        {lower_u32_fn}({{ memory, realloc, vals: [handle], storagePtr, storageLen, componentIdx }});
                    }}
                "#));
            }
        }
    }
}
