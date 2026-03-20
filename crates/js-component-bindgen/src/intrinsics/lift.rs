//! Intrinsics that represent helpers that enable Lift integration

use crate::intrinsics::Intrinsic;
use crate::intrinsics::component::ComponentIntrinsic;
use crate::intrinsics::p3::async_stream::AsyncStreamIntrinsic;
use crate::intrinsics::p3::error_context::ErrCtxIntrinsic;
use crate::intrinsics::string::StringIntrinsic;
use crate::source::Source;

use super::conversion::ConversionIntrinsic;

/// This enum contains intrinsics that enable Lift
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum LiftIntrinsic {
    /// Lift a boolean into provided storage, given a core type
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    ///
    /// In this case, coreVals is expected to contain precisely *one* numerical (u32-equivalent) value.
    LiftFlatBool,

    /// Lift a s8 into provided storage given core type(s)
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
    LiftFlatS8,

    /// Lift a u8 into provided storage given core type(s)
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
    LiftFlatU8,

    /// Lift a s16 into provided storage given core type(s)
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
    LiftFlatS16,

    /// Lift a u16 into provided storage given core type(s)
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
    LiftFlatU16,

    /// Lift a s32 into provided storage given core type(s)
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
    LiftFlatS32,

    /// Lift a u32 into provided storage given core type(s)
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
    LiftFlatU32,

    /// Lift a s64 into provided storage given core type(s)
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
    LiftFlatS64,

    /// Lift a u64 into provided storage given core type(s)
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
    LiftFlatU64,

    /// Lift a f32 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    LiftFlatFloat32,

    /// Lift a f64 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    LiftFlatFloat64,

    /// Lift a char into provided storage given core type(s) that represent utf8
    LiftFlatChar,

    /// Lift a UTF8 string into provided storage given core type(s)
    LiftFlatStringUtf8,

    /// Lift a UTF16 string into provided storage given core type(s)
    LiftFlatStringUtf16,

    /// Lift a record into provided storage given core type(s)
    LiftFlatRecord,

    /// Lift a variant into provided storage given core type(s)
    LiftFlatVariant,

    /// Lift a list into provided storage given core type(s)
    LiftFlatList,

    /// Lift a tuple into provided storage given core type(s)
    LiftFlatTuple,

    /// Lift flags into provided storage given core type(s)
    LiftFlatFlags,

    /// Lift flags into provided storage given core type(s)
    LiftFlatEnum,

    /// Lift an option into provided storage given core type(s)
    LiftFlatOption,

    /// Lift a result into provided storage given core type(s)
    LiftFlatResult,

    /// Lift a owned resource into provided storage given core type(s)
    LiftFlatOwn,

    /// Lift a borrowed resource into provided storage given core type(s)
    LiftFlatBorrow,

    /// Lift a future into provided storage given core type(s)
    LiftFlatFuture,

    /// Lift a stream into provided storage given core type(s)
    LiftFlatStream,

    /// Lift an error-context into provided storage given core type(s)
    LiftFlatErrorContext,
}

impl LiftIntrinsic {
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
            Self::LiftFlatBool => "_liftFlatBool",
            Self::LiftFlatS8 => "_liftFlatS8",
            Self::LiftFlatU8 => "_liftFlatU8",
            Self::LiftFlatS16 => "_liftFlatS16",
            Self::LiftFlatU16 => "_liftFlatU16",
            Self::LiftFlatS32 => "_liftFlatS32",
            Self::LiftFlatU32 => "_liftFlatU32",
            Self::LiftFlatS64 => "_liftFlatS64",
            Self::LiftFlatU64 => "_liftFlatU64",
            Self::LiftFlatFloat32 => "_liftFlatFloat32",
            Self::LiftFlatFloat64 => "_liftFlatFloat64",
            Self::LiftFlatChar => "_liftFlatChar",
            Self::LiftFlatStringUtf8 => "_liftFlatStringUTF8",
            Self::LiftFlatStringUtf16 => "_liftFlatStringUTF16",
            Self::LiftFlatRecord => "_liftFlatRecord",
            Self::LiftFlatVariant => "_liftFlatVariant",
            Self::LiftFlatList => "_liftFlatList",
            Self::LiftFlatTuple => "_liftFlatTuple",
            Self::LiftFlatFlags => "_liftFlatFlags",
            Self::LiftFlatEnum => "_liftFlatEnum",
            Self::LiftFlatOption => "_liftFlatOption",
            Self::LiftFlatResult => "_liftFlatResult",
            Self::LiftFlatOwn => "_liftFlatOwn",
            Self::LiftFlatBorrow => "_liftFlatBorrow",
            Self::LiftFlatFuture => "_liftFlatFuture",
            Self::LiftFlatStream => "_liftFlatStream",
            Self::LiftFlatErrorContext => "_liftFlatErrorContext",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::LiftFlatBool => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_bool_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_bool_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_bool_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length === 0) {{ throw new Error('expected at least a single i32 argument'); }}
                            val = ctx.params[0] === 1;
                            ctx.params = ctx.params.slice(1);
                            return [val, ctx];
                        }}

                        if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 1) {{
                            throw new Error('not enough storage remaining for lift');
                        }}

                        val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr, true) === 1;

                        ctx.storagePtr += 1;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 1; }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatS8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_s8_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_s8_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_s8_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length === 0) {{ throw new Error('expected at least a single i32 argument'); }}
                            val = ctx.params[0];
                            ctx.params = ctx.params.slice(1);
                            return [val, ctx];
                        }}

                        if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 1) {{
                            throw new Error('not enough storage remaining for lift');
                        }}
                        val = new DataView(ctx.memory.buffer).getInt8(ctx.storagePtr, true);
                        ctx.storagePtr += 1;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 1; }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatU8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_u8_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_u8_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_u8_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length === 0) {{ throw new Error('expected at least a single i32 argument'); }}
                            val = ctx.params[0];
                            ctx.params = ctx.params.slice(1);
                            return [val, ctx];
                        }}

                        if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 1) {{
                            throw new Error('not enough storage remaining for lift');
                        }}

                        val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr, true);

                        ctx.storagePtr += 1;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 1; }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatS16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_s16_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_s16_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_s16_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length === 0) {{ throw new Error('expected at least a single i32 argument'); }}
                            val = ctx.params[0];
                            ctx.params = ctx.params.slice(1);
                        }} else {{
                            if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 2) {{
                                throw new Error('not enough storage remaining for lift');
                            }}
                            val = new DataView(ctx.memory.buffer).getInt16(ctx.storagePtr, true);
                            ctx.storagePtr += 2;
                            if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 2; }}
                        }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatU16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_u16_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_u16_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_u16_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (params.length === 0) {{ throw new Error('expected at least a single i32 argument'); }}
                            val = ctx.params[0];
                            ctx.params = ctx.params.slice(1);
                            return [val, ctx];
                        }}

                        if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 2) {{
                            throw new Error('not enough storage remaining for lift');
                        }}

                        val = new DataView(ctx.memory.buffer).getUint16(ctx.storagePtr, true);

                        ctx.storagePtr += 2;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 2; }}

                        const rem = ctx.storagePtr % 2;
                        if (rem !== 0) {{ ctx.storagePtr += (2 - rem); }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatS32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_s32_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_s32_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_s32_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length === 0) {{ throw new Error('expected at least a single i32 argument'); }}
                            val = ctx.params[0];
                            ctx.params = ctx.params.slice(1);
                            return [val, ctx];
                        }}

                        if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 4) {{
                            throw new Error('not enough storage remaining for lift');
                        }}
                        val = new DataView(ctx.memory.buffer).getInt32(ctx.storagePtr, true);
                        ctx.storagePtr += 4;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 4; }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatU32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_u32_fn = self.name();
                output.push_str(&format!(r#"
                    function {lift_flat_u32_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_u32_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length === 0) {{ throw new Error('expected at least a single i34 argument'); }}
                            val = ctx.params[0];
                            ctx.params = ctx.params.slice(1);
                            return [val, ctx];
                        }}

                        if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 4) {{
                            throw new Error('not enough storage remaining for lift');
                        }}
                        val = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
                        ctx.storagePtr += 4;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 4; }}

                        return [val, ctx];
                    }}
                "#));
            }

            Self::LiftFlatS64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_s64_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_s64_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_s64_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length === 0) {{ throw new Error('expected at least one single i64 argument'); }}
                            if (typeof ctx.params[0] !== 'bigint') {{ throw new Error('expected bigint'); }}
                            val = ctx.params[0];
                            ctx.params = ctx.params.slice(1);
                            return [val, ctx];
                        }}

                        if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 8) {{
                            throw new Error('not enough storage remaining for lift');
                        }}
                        val = new DataView(ctx.memory.buffer).getBigInt64(ctx.storagePtr, true);
                        ctx.storagePtr += 8;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 8; }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatU64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_u64_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_u64_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_u64_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length === 0) {{ throw new Error('expected at least one single i64 argument'); }}
                            if (typeof ctx.params[0] !== 'bigint') {{ throw new Error('expected bigint'); }}
                            val = ctx.params[0];
                            ctx.params = ctx.params.slice(1);
                            return [val, ctx];
                        }}

                        if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 8) {{
                            throw new Error('not enough storage remaining for lift');
                        }}
                        val = new DataView(ctx.memory.buffer).getBigUint64(ctx.storagePtr, true);
                        ctx.storagePtr += 8;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 8; }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatFloat32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_f32_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_f32_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_f32_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length === 0) {{ throw new Error('expected at least one single f32 argument'); }}
                            val = ctx.params[0];
                            ctx.params = ctx.params.slice(1);
                            return [val, ctx];
                        }}

                        if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 4) {{
                            throw new Error('not enough storage remaining for lift');
                        }}
                        val = new DataView(ctx.memory.buffer).getFloat32(ctx.storagePtr, true);

                        ctx.storagePtr += 4;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 4; }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatFloat64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_f64_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_f64_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_f64_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length === 0) {{ throw new Error('expected at least one single f64 argument'); }}
                            val = ctx.params[0];
                            ctx.params = ctx.params.slice(1);
                            return [val, ctx];
                        }}

                        if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 8) {{
                            throw new Error('not enough storage remaining for lift');
                        }}
                        val = new DataView(ctx.memory.buffer).getFloat64(ctx.storagePtr, true);
                        ctx.storagePtr += 8;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 8; }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatChar => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let i32_to_char_fn = Intrinsic::Conversion(ConversionIntrinsic::I32ToChar).name();
                let lift_flat_char_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_char_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_char_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length === 0) {{ throw new Error('expected at least one single i32 argument'); }}
                            val = {i32_to_char_fn}(ctx.params[0]);
                            ctx.params = ctx.params.slice(1);
                            return [val, ctx];
                        }}

                        if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 4) {{
                            throw new Error('not enough storage remaining for lift');
                        }}
                        val = {i32_to_char_fn}(new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true));
                        ctx.storagePtr += 4;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen -= 4; }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatStringUtf8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let decoder = Intrinsic::String(StringIntrinsic::GlobalTextDecoderUtf8).name();
                let lift_flat_string_utf8_fn = self.name();

                output.push_str(&format!(r#"
                    function {lift_flat_string_utf8_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_string_utf8_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length < 2) {{ throw new Error('expected at least two u32 arguments'); }}
                            const offset = ctx.params[0];
                            if (!Number.isSafeInteger(offset)) {{  throw new Error('invalid offset'); }}
                            const len = ctx.params[1];
                            if (!Number.isSafeInteger(len)) {{  throw new Error('invalid len'); }}
                            val = {decoder}.decode(new DataView(ctx.memory.buffer, offset, len));
                            ctx.params = ctx.params.slice(2);
                            return [val, ctx];
                        }}

                        const start = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
                        const codeUnits = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr + 4, true);
                        val = {decoder}.decode(new Uint8Array(ctx.memory.buffer, start, codeUnits));

                        ctx.storagePtr += 8;

                        const rem = ctx.storagePtr % 4;
                        if (rem !== 0) {{ ctx.storagePtr += (4 - rem); }}

                        return [val, ctx];
                    }}
                "#));
            }

            Self::LiftFlatStringUtf16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let decoder = Intrinsic::String(StringIntrinsic::Utf16Decoder).name();
                let lift_flat_string_utf16_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_string_utf16_fn}(ctx) {{
                        {debug_log_fn}('[{lift_flat_string_utf16_fn}()] args', {{ ctx }});
                        let val;

                        if (ctx.useDirectParams) {{
                            if (ctx.params.length < 2) {{ throw new Error('expected at least two u32 arguments'); }}
                            const offset = ctx.params[0];
                            if (!Number.isSafeInteger(offset)) {{  throw new Error('invalid offset'); }}
                            const len = ctx.params[1];
                            if (!Number.isSafeInteger(len)) {{  throw new Error('invalid len'); }}
                            val = {decoder}.decode(new DataView(ctx.memory.buffer, offset, len));
                            ctx.params = ctx.params.slice(2);
                            return [val, ctx];
                        }}

                        const data = new DataView(ctx.memory.buffer)
                        const start = data.getUint32(ctx.storagePtr, vals[0], true);
                        const codeUnits = data.getUint32(ctx.storagePtr, vals[0] + 4, true);
                        val = {decoder}.decode(new Uint16Array(ctx.memory.buffer, start, codeUnits));
                        ctx.storagePtr = ctx.storagePtr + 2 * codeUnits;
                        if (ctx.storageLen !== undefined) {{ ctx.storageLen = ctx.storageLen - 2 * codeUnits }}

                        return [val, ctx];
                    }}
                "));
            }

            Self::LiftFlatRecord => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_record_fn = self.name();
                output.push_str(&format!(
                    r#"
                    function {lift_flat_record_fn}(keysAndLiftFns) {{
                        return function {lift_flat_record_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lift_flat_record_fn}()] args', {{ ctx }});

                            if (ctx.useDirectParams) {{
                                ctx.storagePtr = ctx.params[0];
                            }}

                            const res = {{}};
                            for (const [key, liftFn, _size32, align32] of keysAndLiftFns) {{
                                let [val, newCtx] = liftFn(ctx);
                                res[key] = val;
                                ctx = newCtx;

                                const rem = ctx.storagePtr % align32;
                                if (rem !== 0) {{ ctx.storagePtr += align32 - rem; }}
                            }}

                            return [res, ctx];
                        }}
                    }}
                "#
                ));
            }

            Self::LiftFlatVariant => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_variant_fn = self.name();
                let lift_u8 = Self::LiftFlatU8.name();
                let lift_u16 = Self::LiftFlatU16.name();
                let lift_u32 = Self::LiftFlatU32.name();
                output.push_str(&format!(r#"
                    function {lift_flat_variant_fn}(casesAndLiftFns) {{
                        return function {lift_flat_variant_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lift_flat_variant_fn}()] args', {{ ctx }});

                            const origUseParams = ctx.useDirectParams;

                            let caseIdx;
                            let liftRes;
                            const originalPtr = ctx.storagePtr;
                            const numCases =  casesAndLiftFns.length;
                            if (casesAndLiftFns.length < 256) {{
                                liftRes = {lift_u8}(ctx);
                            }} else if (numCases >= 256 && numCases < 65536) {{
                                liftRes = {lift_u16}(ctx);
                            }} else if (numCases >= 65536 && numCases < 4_294_967_296) {{
                                liftRes = {lift_u32}(ctx);
                            }} else {{
                                throw new Error(`unsupported number of variant cases [${{numCases}}]`);
                            }}
                            caseIdx = liftRes[0];
                            ctx = liftRes[1];

                            const [ tag, liftFn, size32, align32, payloadOffset32 ] = casesAndLiftFns[caseIdx];
                            if (payloadOffset32 === undefined) {{ throw new Error('unexpectedly missing payload offset'); }}

                            if (originalPtr !== undefined) {{
                                ctx.storagePtr = originalPtr + payloadOffset32;
                            }}

                            let val;
                            if (liftFn === null) {{
                                val = {{ tag }};
                                // NOTE: here we need to move past the entire object in memory
                                // despite moving to the payload which we now know is missing/unnecessary
                                ctx.storagePtr = originalPtr + size32;
                            }} else {{
                                const [newVal, newCtx] = liftFn(ctx);
                                val = {{ tag, val: newVal }};
                                ctx = newCtx;

                                // NOTE: Padding can be left over after doing the lift if it was less than
                                // space left for the payload normally.
                                if (ctx.storagePtr < originalPtr + size32) {{
                                    ctx.storagePtr = originalPtr + size32;
                                }}
                            }}

                            const rem = ctx.storagePtr % align32;
                            if (rem !== 0) {{ ctx.storagePtr += align32 - rem; }}

                            return [val, ctx];
                        }}
                    }}
                "#));
            }

            Self::LiftFlatList => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_list_fn = self.name();
                let lift_u32 = Self::LiftFlatU32.name();

                output.push_str(&format!("
                    function {lift_flat_list_fn}(meta) {{
                        const {{ elemLiftFn, align32, knownLen }} = meta;

                        function {lift_flat_list_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lift_flat_list_fn}()] args', {{ ctx }});

                            let metaPtr;
                            let dataPtr;
                            let len;
                            if (ctx.useDirectParams) {{
                                if (knownLen) {{
                                    dataPtr = {lift_u32}(ctx);
                                }} else {{
                                    metaPtr = {lift_u32}(ctx);
                                }}
                            }} else {{
                                if (knownLen) {{
                                    dataPtr = {lift_u32}(ctx);
                                }} else {{
                                    metaPtr = {lift_u32}(ctx);
                                }}
                            }}

                            if (metaPtr) {{
                                if (dataPtr !== undefined) {{ throw new Error('both meta and data pointers should not be set yet'); }}

                                if (ctx.useDirectParams) {{
                                    ctx.useDirectParams = false;
                                    ctx.storagePtr = metaPtr;
                                    ctx.storageLen = 8;

                                    dataPtr = {lift_u32}(ctx);
                                    len = {lift_u32}(ctx);

                                    ctx.useDirectParams = true;
                                    ctx.storagePtr = null;
                                    ctx.storageLen = null;
                                }} else {{
                                    dataPtr = {lift_u32}(ctx);
                                    len = {lift_u32}(ctx);
                                }}
                            }}

                            const val = [];
                            for (var i = 0; i < len; i++) {{
                                const [res, nextCtx] = elemLiftFn(ctx);
                                val.push(res);
                                ctx = nextCtx;

                                const rem = ctx.storagePtr % align32;
                                if (rem !== 0) {{ ctx.storagePtr += align32 - rem; }}
                            }}

                            return [val, ctx];
                        }}
                    }}
                "));
            }

            Self::LiftFlatTuple => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_tuple_fn = self.name();
                output.push_str(&format!(
                    "
                    function {lift_flat_tuple_fn}(elemLiftFns) {{
                        return function {lift_flat_tuple_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lift_flat_tuple_fn}()] args', {{ ctx }});

                            const val = [];
                            for (const [ liftFn, size32, align32 ]  of elemLiftFns) {{
                                const [newValue, newCtx] = liftFn(ctx);
                                val.push(newValue);
                                ctx = newCtx;

                                const rem = ctx.storagePtr % align32;
                                if (rem !== 0) {{ ctx.storagePtr += align32 - rem; }}
                            }}

                            return [val, ctx];
                        }}
                    }}
                "
                ));
            }

            // NOTE: enums are returned as the string tag that would normally
            // e.g. `{tag: 'member0' }` -> `'member0'`
            Self::LiftFlatEnum => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_variant = Self::LiftFlatVariant.name();
                let lift_flat_enum_fn = self.name();
                output.push_str(&format!(
                    r#"
                    function {lift_flat_enum_fn}(casesAndLiftFns) {{
                        return function {lift_flat_enum_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lift_flat_enum_fn}()] args', {{ ctx }});
                            const res = {lift_variant}(casesAndLiftFns)(ctx);
                            res[0] = res[0].tag;
                            return res;
                        }}
                    }}
                    "#
                ));
            }

            Self::LiftFlatOption => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_variant = Self::LiftFlatVariant.name();
                let lift_flat_option_fn = self.name();
                output.push_str(&format!(
                    r#"
                    function {lift_flat_option_fn}(casesAndLiftFns) {{
                        return function {lift_flat_option_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lift_flat_option_fn}()] args', {{ ctx }});
                            return {lift_variant}(casesAndLiftFns)(ctx);
                        }}
                    }}
                "#
                ));
            }

            Self::LiftFlatResult => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_variant = Self::LiftFlatVariant.name();
                let lift_flat_result_fn = self.name();
                output.push_str(&format!(
                    r#"
                    function {lift_flat_result_fn}(casesAndLiftFns) {{
                        return function {lift_flat_result_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lift_flat_result_fn}()] args', {{ ctx }});
                            return {lift_variant}(casesAndLiftFns)(ctx);
                        }}
                    }}
                    "#
                ));
            }

            Self::LiftFlatFlags => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_flags_fn = self.name();
                let lift_u8 = Self::LiftFlatU8.name();
                let lift_u16 = Self::LiftFlatU16.name();
                let lift_u32 = Self::LiftFlatU32.name();

                output.push_str(&format!(
                    r#"
                    function {lift_flat_flags_fn}(meta) {{
                        const {{ names, size32, align32, intSize }} = meta;

                        return function {lift_flat_flags_fn}Inner(ctx) {{
                            {debug_log_fn}('[{lift_flat_flags_fn}()] args', {{ ctx }});

                            const val = {{}};

                            let liftRes;
                            let align;
                            switch (intSize) {{
                                case 1:
                                    liftRes = {lift_u8}(ctx);
                                    break;
                                case 2:
                                    liftRes = {lift_u16}(ctx);
                                    break;
                                case 4:
                                    liftRes = {lift_u32}(ctx);
                                    break;
                                default:
                                    throw new Error('invalid flags size');
                            }}
                            let bits = liftRes[0];
                            ctx = liftRes[1];

                            for (const name of names) {{
                                val[name] = (bits & 1) === 1;
                                bits >>>= 1;
                            }}

                            const rem = ctx.storagePtr % align32;
                            if (rem !== 0) {{ ctx.storagePtr += align32 - rem; }}

                            return [val, ctx];
                        }}
                    }}
                    "#
                ));
            }

            Self::LiftFlatOwn => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_own_fn = self.name();
                output.push_str(&format!(r#"
                    function {lift_flat_own_fn}(componentTableIdx, size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[{lift_flat_own_fn}()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for owned resources not yet implemented!');
                    }}
                "#
                ));
            }

            Self::LiftFlatBorrow => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_borrow_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_borrow_fn}(componentTableIdx, size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[{lift_flat_borrow_fn}()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for borrowed resources not yet implemented!');
                    }}
                "));
            }

            Self::LiftFlatFuture => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lift_flat_future_fn = self.name();
                output.push_str(&format!("
                    function {lift_flat_future_fn}(componentTableIdx, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[{lift_flat_future_fn}()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for futures not yet implemented!');
                    }}
                "));
            }

            Self::LiftFlatStream => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let external_stream_class =
                    Intrinsic::AsyncStream(AsyncStreamIntrinsic::ExternalStreamClass).name();
                let lift_flat_stream_fn = self.name();
                let global_stream_table_map = AsyncStreamIntrinsic::GlobalStreamTableMap.name();

                output.push_str(&format!(r#"
                    function {lift_flat_stream_fn}(streamTableIdx, ctx) {{
                        {debug_log_fn}('[{lift_flat_stream_fn}()] args', {{ streamTableIdx, ctx }});
                        const {{ memory, useDirectParams, params }} = ctx;

                        const {{ table, componentIdx }} = {global_stream_table_map}[streamTableIdx];
                        if (componentIdx === undefined || !table) {{
                            throw new Error(`invalid global stream table state for table [${{tableIdx}}]`);
                        }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate) {{ throw new Error(`missing async state for component [${{componentIdx}}]`); }}

                        const streamEndWaitableIdx = params[0];
                        if (!streamEndWaitableIdx) {{ throw new Error('missing stream idx'); }}

                        const streamEnd = cstate.getStreamEnd({{ tableIdx: streamTableIdx, streamEndWaitableIdx }});
                        if (!streamEnd) {{
                            throw new Error(`missing stream end [${{streamEndWaitableIdx}}] (table [${{streamTableIdx}}]) in component [${{componentIdx}}] during lift`);
                        }}

                        // TODO: check for borrowed type
                        // TODO: check for readable only
                        // TODO: confirm shared type matches tyep for lift
                        // TODO: check for IDLE state

                        const stream = new {external_stream_class}({{
                            globalRep: streamEnd.globalStreamMapRep(),
                            isReadable: streamEnd.isReadable(),
                            isWritable: streamEnd.isWritable(),
                            writeFn: (v) => {{ return streamEnd.write(v); }},
                            readFn: () => {{ return streamEnd.read(); }},
                        }});

                        return [ stream, ctx ];
                    }}
                "#));
            }

            // Since error contexts are reference counted, when one is lifted from a component to a
            // component model value, we assume that the host has taken control of it until it has been lowered
            // into a component
            //
            // When we lift an error context, we increase the global ref count as it must be accounted for
            // at the component model (host) level.
            //
            // This means that *before* lifting an error context object's `val` property represents a local
            // handle (an index into a component-local error context table), but *after* lifting, it represents
            // a component-global "rep" (i.e. the component model represenation).
            //
            Self::LiftFlatErrorContext => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let get_err_ctx_local_table_fn = ErrCtxIntrinsic::GetLocalTable.name();
                let err_ctx_ref_count_add_fn = ErrCtxIntrinsic::GlobalRefCountAdd.name();
                let lift_flat_error_fn = self.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();

                output.push_str(&format!(r#"
                    function {lift_flat_error_fn}(errCtxTableIdx, ctx) {{
                        {debug_log_fn}('[{lift_flat_error_fn}()] ctx', ctx);
                        const {{ useDirectParams, params, componentIdx }} = ctx;

                        let val;
                        let table;
                        if (useDirectParams) {{
                            if (params.length === 0) {{ throw new Error('expected at least one single i32 argument'); }}
                            val = ctx.params[0];
                            ctx.params = ctx.params.slice(1);
                            table = {get_err_ctx_local_table_fn}(componentIdx, errCtxTableIdx);
                        }} else {{
                            throw new Error('indirect flat lift for error-contexts not yet implemented!');
                        }}

                        let handle = table.get(val);
                        if (handle === undefined) {{
                            throw new Error(`missing  error ctx (handle [${{val}}], component [${{componentIdx}}], error context table [${{errCtxTableIdx}}])`);
                        }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        const errCtx = cstate.handles.get(handle);
                        if (!errCtx || errCtx.globalRep === undefined || errCtx.refCount === undefined) {{
                            throw new Error(`malformed error context (handle [${{handle}}], component [${{componentIdx}}])`);
                        }}

                        errCtx.refCount -= 1;
                        // NOTE: we aovoid doing clean up eagerly here

                        {err_ctx_ref_count_add_fn}(errCtx.globalRep);

                        return [errCtx.globalRep, ctx];
                    }}
                "#));
            }
        }
    }
}
