//! Intrinsics that represent helpers that enable Lower integration

use crate::{
    intrinsics::{Intrinsic, p3::error_context::ErrCtxIntrinsic, string::StringIntrinsic},
    source::Source,
};

use super::conversion::ConversionIntrinsic;

/// This enum contains intrinsics that enable Lower
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
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
                output.push_str(&format!("
                    function _lowerFlatBool(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatBool()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length !== 1) {{
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] !== 0 && vals[0] !== 1) {{ throw new Error('invalid value for core value representing bool'); }}
                        new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
                        return 1;
                    }}
                "));
            }

            Self::LowerFlatS8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatS8(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatS8()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length !== 1) {{
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] > 127 || vals[0] < -128) {{ throw new Error('invalid value for core value representing s8'); }}
                        new DataView(memory.buffer).setInt32(storagePtr, vals[0], true);
                        return 8;
                    }}
                "));
            }

            Self::LowerFlatU8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!(r#"
                    function _lowerFlatU8(ctx) {{
                        {debug_log_fn}('[_lowerFlatU8()] args', ctx);
                        const {{ memory, realloc, vals, storagePtr, storageLen }} = ctx;
                        if (vals.length !== 1) {{
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] > 255 || vals[0] < 0) {{ throw new Error('invalid value for core value representing u8'); }}
                        if (!memory) {{ throw new Error("missing memory for lower"); }}
                        new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
                        return 1;
                    }}
                "#));
            }

            // TODO: alignment checks
            Self::LowerFlatS16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatS16(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatS16()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length !== 1) {{
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] > 32_767 || vals[0] < -32_768) {{ throw new Error('invalid value for core value representing s16'); }}
                        new DataView(memory.buffer).setInt16(storagePtr, vals[0], true);
                        return 2;
                    }}
                "));
            }

            Self::LowerFlatU16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatU16(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatU16()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length !== 1) {{
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] > 65_535 || vals[0] < 0) {{ throw new Error('invalid value for core value representing u16'); }}
                        new DataView(memory.buffer).setUint16(storagePtr, vals[0], true);
                        return 2;
                    }}
                "));
            }

            Self::LowerFlatS32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatS32(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatS32()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length !== 1) {{
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] > 2_147_483_647 || vals[0] < -2_147_483_648) {{ throw new Error('invalid value for core value representing s32'); }}
                        new DataView(memory.buffer).setInt32(storagePtr, vals[0], true);
                        return 4;
                    }}
                "));
            }

            Self::LowerFlatU32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatU32(ctx) {{
                        {debug_log_fn}('[_lowerFlatU32()] args', ctx);
                        const {{ memory, realloc, vals, storagePtr, storageLen }} = ctx;
                        if (vals.length !== 1) {{ throw new Error('expected single value to lower, got (' + vals.length + ')'); }}
                        if (vals[0] > 4_294_967_295 || vals[0] < 0) {{ throw new Error('invalid value for core value representing u32'); }}

                        // TODO(fix): fix misaligned writes properly
                        const rem = ctx.storagePtr % 4;
                        if (rem !== 0) {{ ctx.storagePtr += (4 - rem); }}

                        new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
                        return 4;
                    }}
                "));
            }

            Self::LowerFlatS64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatS64(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatS64()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 9_223_372_036_854_775_807n || vals[0] < -9_223_372_036_854_775_808n) {{ throw new Error('invalid value for core value representing s64'); }}
                        new DataView(memory.buffer).setBigInt64(storagePtr, vals[0], true);
                        return 8;
                    }}
                "));
            }

            Self::LowerFlatU64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatU64(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatU64()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 18_446_744_073_709_551_615n || vals[0] < 0n) {{ throw new Error('invalid value for core value representing u64'); }}
                        new DataView(memory.buffer).setBigUint64(storagePtr, vals[0], true);
                        return 8;
                    }}
                "));
            }

            Self::LowerFlatFloat32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatFloat32(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatFloat32()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setFloat32(storagePtr, vals[0], true);
                        return 4;
                    }}
                "));
            }

            Self::LowerFlatFloat64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatFloat64(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatFloat64()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setFloat64(storagePtr, vals[0], true);
                        return 8;
                    }}
                "));
            }

            Self::LowerFlatChar => {
                let i32_to_char_fn = Intrinsic::Conversion(ConversionIntrinsic::I32ToChar).name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatChar(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatChar()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setUint32(storagePtr, {i32_to_char_fn}(vals[0]), true);
                        return 4;
                    }}
                "));
            }

            Self::LowerFlatStringUtf16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatStringUTF16(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatStringUTF16()] args', {{ memory, vals, storagePtr, storageLen }});
                        const start = new DataView(memory.buffer).getUint32(storagePtr, vals[0], true);
                        const codeUnits = new DataView(memory.buffer).getUint32(storagePtr, vals[0] + 4, true);
                        var bytes = new Uint16Array(memory.buffer, start, codeUnits);
                        if (memory.buffer.byteLength < start + bytes.byteLength) {{
                            throw new Error('memory out of bounds');
                        }}
                        if (storageLen !== undefined && storageLen !== bytes.byteLength) {{
                            throw new Error('storage length (' + storageLen + ') != (' + bytes.byteLength + ')');
                        }}
                        new Uint16Array(memory.buffer, storagePtr).set(bytes);
                        return bytes.byteLength;
                    }}
                "));
            }

            Self::LowerFlatStringUtf8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let utf8_encode_fn = Intrinsic::String(StringIntrinsic::Utf8Encode).name();
                output.push_str(&format!("
                    function _lowerFlatStringUTF8(ctx) {{
                        {debug_log_fn}('[_lowerFlatStringUTF8()] args', ctx);
                        const {{ memory, realloc, vals, storagePtr, storageLen }} = ctx;

                        const s = vals[0];
                        const {{ ptr, len, codepoints }} = {utf8_encode_fn}(vals[0], realloc, memory);

                        const view = new DataView(memory.buffer);
                        view.setUint32(storagePtr, ptr, true);
                        view.setUint32(storagePtr + 4, codepoints, true);

                        return len;
                    }}
                "));
            }

            Self::LowerFlatRecord => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatRecord(fieldMetas) {{
                        return (size, memory, vals, storagePtr, storageLen) => {{
                            const params = [...arguments].slice(5);
                            {debug_log_fn}('[_lowerFlatRecord()] args', {{
                                size,
                                memory,
                                vals,
                                storagePtr,
                                storageLen,
                                params,
                                fieldMetas
                            }});

                            const [start] = vals;
                            if (storageLen !== undefined && size !== undefined && size > storageLen) {{
                                throw new Error('not enough storage remaining for record flat lower');
                            }}
                            const data = new Uint8Array(memory.buffer, start, size);
                            new Uint8Array(memory.buffer, storagePtr, size).set(data);
                            return data.byteLength;
                        }}
                    }}
                "));
            }

            Self::LowerFlatVariant => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_u8_fn = Self::LowerFlatU8.name();
                let lower_u16_fn = Self::LowerFlatU16.name();
                let lower_u32_fn = Self::LowerFlatU32.name();
                output.push_str(&format!(r#"
                    function _lowerFlatVariant(metadata, extra) {{
                        const {{ discriminantSizeBytes, lowerMetas }} = metadata;

                        return function _lowerFlatVariantInner(ctx) {{
                            {debug_log_fn}('[_lowerFlatVariant()] args', ctx);
                            const {{ memory, realloc, vals, storageLen, componentIdx }} = ctx;
                            let storagePtr = ctx.storagePtr;

                            const {{ tag, val }} = vals[0];
                            const variant = lowerMetas.find(vm => vm.tag === tag);
                            if (!variant) {{ throw new Error(`missing/invalid variant, no tag matches [${{tag}}] (options were ${{variantMetas.map(vm => vm.tag)}})`); }}
                            if (!variant.discriminant) {{ throw new Error(`missing/invalid discriminant for variant [${{variant}}]`); }}

                            let bytesWritten;
                            let discriminantLowerArgs = {{ memory, realloc, vals: [variant.discriminant], storagePtr, componentIdx }}
                            switch (discriminantSizeBytes) {{
                                case 1:
                                    bytesWritten = {lower_u8_fn}(discriminantLowerArgs);
                                    break;
                                case 2:
                                    bytesWritten = {lower_u16_fn}(discriminantLowerArgs);
                                    break;
                                case 4:
                                    bytesWritten = {lower_u32_fn}(discriminantLowerArgs);
                                    break;
                                default:
                                    throw new Error(`unexpected discriminant size bytes [${{discriminantSizeBytes}}]`);
                            }}
                            if (bytesWritten !== discriminantSizeBytes) {{
                                throw new Error("unexpectedly wrote more bytes than discriminant");
                            }}
                            storagePtr += bytesWritten;

                            bytesWritten += variant.lowerFn({{ memory, realloc, vals: [val], storagePtr, storageLen, componentIdx }});

                            return bytesWritten;
                        }}
                    }}
                "#));
            }

            Self::LowerFlatList => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatList(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatList()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        let [start, len] = vals;
                        const totalSizeBytes = len * size;
                        if (storageLen !== undefined && totalSizeBytes > storageLen) {{
                            throw new Error('not enough storage remaining for list flat lower');
                        }}
                        const data = new Uint8Array(memory.buffer, start, totalSizeBytes);
                        new Uint8Array(memory.buffer, storagePtr, totalSizeBytes).set(data);
                        return data.byteLength;
                    }}
                "));
            }

            Self::LowerFlatTuple => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatTuple(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatTuple()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        let [start, len] = vals;
                        if (storageLen !== undefined && len > storageLen) {{
                            throw new Error('not enough storage remaining for tuple flat lower');
                        }}
                        const data = new Uint8Array(memory.buffer, start, len);
                        new Uint8Array(memory.buffer, storagePtr, len).set(data);
                        return data.byteLength;
                    }}
                "));
            }

            Self::LowerFlatFlags => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatFlags(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatFlags()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        if (vals.length !== 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setInt32(storagePtr, vals[0], true);
                        return 4;
                    }}
                "));
            }

            Self::LowerFlatEnum => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatEnum(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatEnum()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        let [start] = vals;
                        if (storageLen !== undefined && size !== undefined && size > storageLen) {{
                            throw new Error('not enough storage remaining for enum flat lower');
                        }}
                        const data = new Uint8Array(memory.buffer, start, size);
                        new Uint8Array(memory.buffer, storagePtr, size).set(data);
                        return data.byteLength;
                    }}
                "));
            }

            Self::LowerFlatOption => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatOption(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatOption()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        let [start] = vals;
                        if (storageLen !== undefined && size !== undefined && size > storageLen) {{
                            throw new Error('not enough storage remaining for option flat lower');
                        }}
                        const data = new Uint8Array(memory.buffer, start, size);
                        new Uint8Array(memory.buffer, storagePtr, size).set(data);
                        return data.byteLength;
                    }}
                "));
            }

            // Results are just a special case of lowering variants
            Self::LowerFlatResult => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_variant_fn = Self::LowerFlatVariant.name();
                output.push_str(&format!(
                    r#"
                    function _lowerFlatResult(lowerMetas) {{
                       const invalidTag = lowerMetas.find(t => t.tag !== 'ok' && t.tag !== 'error')
                       if (invalidTag) {{ throw new Error(`invalid variant tag [${{invalidTag}}] found for result`); }}

                       return function _lowerFlatResultInner() {{
                           {debug_log_fn}('[_lowerFlatResult()] args', {{ lowerMetas }});
                           let lowerFn = {lower_variant_fn}({{ discriminantSizeBytes: 1, lowerMetas }}, {{ forResult: true }});
                           return lowerFn.apply(null, arguments);
                       }};
                    }}
                    "#
                ));
            }

            Self::LowerFlatOwn => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatOwn(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatOwn()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lower for owned resources not yet implemented!');
                    }}
                "));
            }

            Self::LowerFlatBorrow => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatBorrow(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatBorrow()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lower for borrowed resources not yet implemented!');
                    }}
                "));
            }

            Self::LowerFlatFuture => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatFuture(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatFuture()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lower for futures not yet implemented!');
                    }}
                "));
            }

            Self::LowerFlatStream => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _lowerFlatStream(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_lowerFlatStream()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lower for streams not yet implemented!');
                    }}
                "));
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
                let lower_u32_fn = Self::LowerFlatU32.name();
                let create_local_handle_fn = ErrCtxIntrinsic::CreateLocalHandle.name();
                let err_ctx_ref_count_add_fn = ErrCtxIntrinsic::GlobalRefCountAdd.name();
                let get_err_ctx_local_table_fn = ErrCtxIntrinsic::GetLocalTable.name();
                output.push_str(&format!(r#"
                    function _lowerFlatErrorContext(componentTableIdx, ctx) {{
                        {debug_log_fn}('[_lowerFlatErrorContext()] args', {{ componentTableIdx, ctx }});
                        const {{ memory, realloc, vals, storagePtr, storageLen, componentIdx }} = ctx;
                        const errCtxRep = vals[0];
                        const componentTable = {get_err_ctx_local_table_fn}(componentIdx, componentTableIdx, {{upsert: true}});
                        const handle = {create_local_handle_fn}(componentTable, errCtxRep);
                        {err_ctx_ref_count_add_fn}(errCtxRep, -1);
                        return {lower_u32_fn}({{ memory, realloc, vals: [handle], storagePtr, storageLen, componentIdx }});
                    }}
                "#));
            }
        }
    }
}
