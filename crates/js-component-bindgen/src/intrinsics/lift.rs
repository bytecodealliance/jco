//! Intrinsics that represent helpers that enable Lift integration

use crate::{intrinsics::Intrinsic, source::Source};

use super::conversion::ConversionIntrinsic;

/// This enum contains intrinsics that enable Lift
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
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
    LiftFlatCharUtf8,

    /// Lift a char into provided storage given core type(s) that represent utf16
    LiftFlatCharUtf16,

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
            Self::LiftFlatCharUtf16 => "_liftFlatCharUTF16",
            Self::LiftFlatCharUtf8 => "_liftFlatCharUTF8",
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
                output.push_str(&format!("
                    function _liftFlatBool(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatBool()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ 
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] !== 0 && vals[0] !== 1) {{ throw new Error('invalid value for core value representing bool'); }}
                        new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
                        return 1;
                    }}
                "));
            }

            Self::LiftFlatS8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatS8(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatS8()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ 
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] > 127 || vals[0] < -128) {{ throw new Error('invalid value for core value representing s8'); }}
                        new DataView(memory.buffer).setInt32(storagePtr, vals[0], true);
                        return 8;
                    }}
                "));
            }

            Self::LiftFlatU8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatU8(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatU8()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ 
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] > 255 || vals[0] < 0) {{ throw new Error('invalid value for core value representing u8'); }}
                        new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
                        return 8;
                    }}
                "));
            }

            Self::LiftFlatS16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatS16(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatS16()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ 
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] > 32_767 || vals[0] < -32_768) {{ throw new Error('invalid value for core value representing s16'); }}
                        new DataView(memory.buffer).setInt16(storagePtr, vals[0], true);
                        return 16;
                    }}
                "));
            }

            Self::LiftFlatU16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatU16(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatU16()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ 
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] > 65_535 || vals[0] < 0) {{ throw new Error('invalid value for core value representing u16'); }}
                        new DataView(memory.buffer).setUint16(storagePtr, vals[0], true);
                        return 16;
                    }}
                "));
            }

            Self::LiftFlatS32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatS32(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatS32()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ 
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] > 2_147_483_647 || vals[0] < -2_147_483_648) {{ throw new Error('invalid value for core value representing s32'); }}
                        new DataView(memory.buffer).setInt32(storagePtr, vals[0], true);
                        return 32;
                    }}
                "));
            }

            Self::LiftFlatU32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatU32(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatU32()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ 
                            throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
                        }}
                        if (vals[0] > 4_294_967_295 || vals[0] < 0) {{ throw new Error('invalid value for core value representing u32'); }}
                        new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
                        return 32;
                    }}
                "));
            }

            Self::LiftFlatS64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatS64(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatS64()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 9_223_372_036_854_775_807n || vals[0] < -9_223_372_036_854_775_808n) {{ throw new Error('invalid value for core value representing s64'); }}
                        new DataView(memory.buffer).setBigInt64(storagePtr, vals[0], true);
                        return 64;
                    }}
                "));
            }

            Self::LiftFlatU64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatU64(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatU64()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 18_446_744_073_709_551_615n || vals[0] < 0n) {{ throw new Error('invalid value for core value representing u64'); }}
                        new DataView(memory.buffer).setBigUint64(storagePtr, vals[0], true);
                        return 64;
                    }}
                "));
            }

            Self::LiftFlatFloat32 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatFloat32(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatFloat32()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setFloat32(storagePtr, vals[0], true);
                        return 32;
                    }}
                "));
            }

            Self::LiftFlatFloat64 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatFloat64(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatFloat64()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setFloat64(storagePtr, vals[0], true);
                        return 64;
                    }}
                "));
            }

            Self::LiftFlatCharUtf16 => {
                let i32_to_char_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::I32ToCharUtf16).name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatCharUTF16(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatCharUTF16()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setFloat64(storagePtr, {i32_to_char_fn}(vals[0]), true);
                        return 4;
                    }}
                "));
            }

            Self::LiftFlatCharUtf8 => {
                let i32_to_char_fn =
                    Intrinsic::Conversion(ConversionIntrinsic::I32ToCharUtf8).name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatCharUTF8(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatStringUTF16()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setUint32(storagePtr, {i32_to_char_fn}(vals[0]), true);
                        return 4;
                    }}
                "));
            }

            Self::LiftFlatStringUtf16 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatStringUTF16(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatStringUTF16()] args', {{ memory, vals, storagePtr, storageLen }});
                        const start = new DataView(memory.buffer).getUint32(storagePtr, vals[0], true);
                        const codeUnits = new DataView(memory.buffer).getUint32(storagePtr, vals[0] + 4, true);
                        var bytes = new Uint16Array(memory.buffer, start, codeUnits);
                        if (memory.buffer.byteLength < start + bytes.byteLength) {{
                            throw new Error('memory out of bounds');
                        }}
                        if (storageLen !== bytes.byteLength) {{
                            throw new Error('storage length (' + storageLen + ') != (' + bytes.byteLength + ')');
                        }}
                        new Uint16Array(memory.buffer, storagePtr).set(bytes);
                        return bytes.byteLength;
                    }}
                "));
            }

            Self::LiftFlatStringUtf8 => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatStringUTF8(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatStringUTF8()] args', {{ memory, vals, storagePtr, storageLen }});
                        const start = new DataView(memory.buffer).getUint32(storagePtr, vals[0], true);
                        const codeUnits = new DataView(memory.buffer).getUint32(storagePtr, vals[0] + 4, true);
                        var bytes = new Uint8Array(memory.buffer, start, codeUnits);
                        if (memory.buffer.byteLength < start + bytes.byteLength) {{
                            throw new Error('memory out of bounds');
                        }}
                        if (storageLen !== bytes.byteLength) {{
                            throw new Error('storage length (' + storageLen + ') != (' + bytes.byteLength + ')');
                        }}
                        new Uint8Array(memory.buffer, storagePtr).set(bytes);
                        return bytes.byteLength;
                    }}
                "));
            }

            Self::LiftFlatRecord => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatRecord(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatVariant()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        const [start] = vals;
                        if (size > storageLen) {{
                            throw new Error('not enough storage remaining for record flat lift');
                        }}
                        const data = new Uint8Array(memory.buffer, start, size);
                        new Uint8Array(memory.buffer, storagePtr, size).set(data);
                        return data.byteLength;
                    }}
                "));
            }

            Self::LiftFlatVariant => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatVariant(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatVariant()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        let [start, totalSize] = vals;
                        if (size > storageLen) {{
                            throw new Error('not enough storage remaining for variant flat lift');
                        }}
                        const data = new Uint8Array(memory.buffer, start, totalSize);
                        new Uint8Array(memory.buffer, storagePtr, totalSize).set(data);
                        return data.byteLength;
                    }}
                "));
            }

            Self::LiftFlatList => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatList(elemSize, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatList()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        let [start, len] = vals;
                        const totalSizeBytes = len * elemSize;
                        if (totalSizeBytes > storageLen) {{
                            throw new Error('not enough storage remaining for list flat lift');
                        }}
                        const data = new Uint8Array(memory.buffer, start, totalSizeBytes);
                        new Uint8Array(memory.buffer, storagePtr, totalSizeBytes).set(data);
                        return data.byteLength;
                    }}
                "));
            }

            Self::LiftFlatTuple => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatTuple(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatTuple()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        let [start, size] = vals;
                        if (size > storageLen) {{
                            throw new Error('not enough storage remaining for tuple flat lift');
                        }}
                        const data = new Uint8Array(memory.buffer, start, size);
                        new Uint8Array(memory.buffer, storagePtr, size).set(data);
                        return data.byteLength;
                    }}
                "));
            }

            Self::LiftFlatFlags => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatFlags(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatFlags()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setInt32(storagePtr, vals[0], true);
                        return 4;
                    }}
                "));
            }

            Self::LiftFlatEnum => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatEnum(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatEnum()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        let [start] = vals;
                        if (size > storageLen) {{
                            throw new Error('not enough storage remaining for enum flat lift');
                        }}
                        const data = new Uint8Array(memory.buffer, start, size);
                        new Uint8Array(memory.buffer, storagePtr, size).set(data);
                        return data.byteLength;
                    }}
                "));
            }

            Self::LiftFlatOption => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatOption(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatOption()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        let [start] = vals;
                        if (size > storageLen) {{
                            throw new Error('not enough storage remaining for option flat lift');
                        }}
                        const data = new Uint8Array(memory.buffer, start, size);
                        new Uint8Array(memory.buffer, storagePtr, size).set(data);
                        return data.byteLength;
                    }}
                "));
            }

            Self::LiftFlatResult => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatResult(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatResult()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        let [start, totalSize] = vals;
                        if (totalSize !== storageLen) {{
                            throw new Error('storage length doesn't match variant size');
                        }}
                        const data = new Uint8Array(memory.buffer, start, totalSize);
                        new Uint8Array(memory.buffer, storagePtr, totalSize).set(data);
                        return data.byteLength;
                    }}
                "));
            }

            Self::LiftFlatOwn => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatOwn(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatOwn()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for owned resources not yet implemented!');
                    }}
                "));
            }

            Self::LiftFlatBorrow => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatBorrow(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatBorrow()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for borrowed resources not yet implemented!');
                    }}
                "));
            }

            Self::LiftFlatFuture => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatFuture(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatFuture()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for futures not yet implemented!');
                    }}
                "));
            }

            Self::LiftFlatStream => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatStream(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatStream()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for streams not yet implemented!');
                    }}
                "));
            }

            Self::LiftFlatErrorContext => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatErrorContext(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatErrorContext()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for error-contexts not yet implemented!');
                    }}
                "));
            }
        }
    }
}
