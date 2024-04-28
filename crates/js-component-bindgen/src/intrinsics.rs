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
    EmptyFunc,
    F32ToI32,
    F64ToI64,
    FetchCompile,
    FinalizationRegistryCreate,
    GetErrorPayload,
    GetErrorPayloadString,
    HandleTables,
    HasOwnProperty,
    I32ToF32,
    I64ToF64,
    ImportedResourceCnt,
    InstantiateCore,
    IsLE,
    ResourceTableFlag,
    ResourceTableCreateBorrow,
    ResourceTableCreateOwn,
    ResourceTableGet,
    ResourceTableEnsureBorrowDrop,
    ResourceTableRemove,
    ResourceCallBorrows,
    ResourceTransferBorrow,
    ResourceTransferBorrowValidLifting,
    ResourceTransferOwn,
    ScopeId,
    SymbolCabiDispose,
    SymbolCabiLower,
    SymbolResourceHandle,
    SymbolResourceRep,
    SymbolDispose,
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
    ToResultString,
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
    if intrinsics.contains(&Intrinsic::GetErrorPayload)
        || intrinsics.contains(&Intrinsic::GetErrorPayloadString)
    {
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
            Intrinsic::Base64Compile => if !no_nodejs_compat {
                output.push_str("
                    const base64Compile = str => WebAssembly.compile(typeof Buffer !== 'undefined' ? Buffer.from(str, 'base64') : Uint8Array.from(atob(str), b => b.charCodeAt(0)));
                ")
            } else {
                output.push_str("
                    const base64Compile = str => WebAssembly.compile(Uint8Array.from(atob(str), b => b.charCodeAt(0)));
                ")
            },

            Intrinsic::ClampGuest => output.push_str("
                function clampGuest(i, min, max) {
                    if (i < min || i > max) \
                        throw new TypeError(`must be between ${min} and ${max}`);
                    return i;
                }
            "),

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

            Intrinsic::EmptyFunc => output.push_str("
                const emptyFunc = () => {};
            "),

            Intrinsic::FinalizationRegistryCreate => output.push_str("
                function finalizationRegistryCreate (unregister) {
                    if (typeof FinalizationRegistry === 'undefined') {
                        return { unregister () {} };
                    }
                    return new FinalizationRegistry(unregister);
                }
            "),

            Intrinsic::F64ToI64 => output.push_str("
                const f64ToI64 = f => (i64ToF64F[0] = f, i64ToF64I[0]);
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

            Intrinsic::GetErrorPayload => {
                let hop = Intrinsic::HasOwnProperty.name();
                uwrite!(output, "
                    function getErrorPayload(e) {{
                        if (e && {hop}.call(e, 'payload')) return e.payload;
                        if (e instanceof Error) throw e;
                        return e;
                    }}
                ")
            },

            Intrinsic::GetErrorPayloadString => {
                let hop = Intrinsic::HasOwnProperty.name();
                uwrite!(output, "
                    function getErrorPayloadString(e) {{
                        if (e && {hop}.call(e, 'payload')) return e.payload;
                        if (e instanceof Error) return e.message;
                        return e;
                    }}
                ")
            },

            Intrinsic::HandleTables => output.push_str("
                const handleTables = [];
            "),

            Intrinsic::HasOwnProperty => output.push_str("
                const hasOwnProperty = Object.prototype.hasOwnProperty;
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

            Intrinsic::ImportedResourceCnt => output.push_str("importedResourceCnt"),

            Intrinsic::InstantiateCore => if !instantiation {
                output.push_str("
                    const instantiateCore = WebAssembly.instantiate;
                ")
            },

            Intrinsic::IsLE => output.push_str("
                const isLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
            "),

            Intrinsic::ResourceCallBorrows => output.push_str("let resourceCallBorrows = [];"),

            // 
            // # Resource table slab implementation
            // 
            // Resource table slab implementation on top of a fixed "SMI" array in JS engines,
            // a fixed contiguous array of u32s, for performance. We don't use a typed array because
            // we need resizability without reserving a large buffer.
            //
            // The flag bit for all data values is 1 << 30. We avoid the use of the highest bit
            // entirely to not trigger SMI deoptimization.
            //
            // Each entry consists of a pair of u32s, either a free list entry, or a data entry.
            //
            // ## Free List Entries:
            //
            //  |    index (x, u30)   |       ~unused~      |
            //  |------ 32 bits ------|------ 32 bits ------|
            //  | 01xxxxxxxxxxxxxxxxx | ################### |
            //
            // Free list entries use only the first value in the pair, with the high bit always set
            // to indicate that the pair is part of the free list. The first pair of entries at
            // indices 0 and 1 is the free list head, with the initial values of 1 << 30 and 0
            // respectively. Removing the 1 << 30 flag gives 0, which indicates the end of the free
            // list.
            //
            // ## Data Entries:
            //
            //  |    scope (x, u30)   | own(o), rep(x, u30) |
            //  |------ 32 bits ------|------ 32 bits ------|
            //  | 00xxxxxxxxxxxxxxxxx | 0oxxxxxxxxxxxxxxxxx |
            //
            // Data entry pairs consist of a first u30 scope entry and a second rep entry. The field
            // is only called the scope for interface shape consistency, but is actually used for the
            // ref count for own handles and the scope id for borrow handles. The high bit is never
            // set for this first entry to distinguish the pair from the free list. The second item
            // in the pair is the rep for  the resource, with the high bit in this entry indicating
            // if it is an own handle.
            //
            // The free list numbering and the handle numbering are the same, indexing by pair, so to
            // get from a handle or free list numbering to an index, we multiply by two.
            //
            // For example, to access a handle n, we read the pair of values n * 2 and n * 2 + 1 in
            // the array to get the context and rep respectively. If the high bit is set on the
            // context, we throw for an invalid handle. The rep value is masked out from the
            // ownership high bit, also throwing for an invalid zero rep.
            //
            Intrinsic::ResourceTableFlag => output.push_str("
                const T_FLAG = 1 << 30;
            "),

            Intrinsic::ResourceTableCreateBorrow => output.push_str("
                function rscTableCreateBorrow (table, rep) {
                    const free = table[0] & ~T_FLAG;
                    if (free === 0) {
                        table.push(scopeId);
                        table.push(rep);
                        return (table.length >> 1) - 1;
                    }
                    table[0] = table[free];
                    table[free << 1] = scopeId;
                    table[(free << 1) + 1] = rep;
                    return free;
                }
            "),

            Intrinsic::ResourceTableCreateOwn => output.push_str("
                function rscTableCreateOwn (table, rep) {
                    const free = table[0] & ~T_FLAG;
                    if (free === 0) {
                        table.push(0);
                        table.push(rep | T_FLAG);
                        return (table.length >> 1) - 1;
                    }
                    table[0] = table[free << 1];
                    table[free << 1] = 0;
                    table[(free << 1) + 1] = rep | T_FLAG;
                    return free;
                }
            "),

            Intrinsic::ResourceTableGet => output.push_str("
                function rscTableGet (table, handle) {
                    const scope = table[handle << 1];
                    const val = table[(handle << 1) + 1];
                    const own = (val & T_FLAG) !== 0;
                    const rep = val & ~T_FLAG;
                    if (rep === 0 || (scope & T_FLAG) !== 0) throw new TypeError('Invalid handle');
                    return { rep, scope, own };
                }
            "),

            Intrinsic::ResourceTableEnsureBorrowDrop => output.push_str("
                function rscTableEnsureBorrowDrop (table, handle, scope) {
                    if (table[handle << 1] === scope)
                        throw new TypeError('Resource borrow was not dropped at end of call');
                }
            "),

            Intrinsic::ResourceTableRemove => output.push_str("
                function rscTableRemove (table, handle) {
                    const scope = table[handle << 1];
                    const val = table[(handle << 1) + 1];
                    const own = (val & T_FLAG) !== 0;
                    const rep = val & ~T_FLAG;
                    if (val === 0 || (scope & T_FLAG) !== 0) throw new TypeError('Invalid handle');
                    table[handle << 1] = table[0] | T_FLAG;
                    table[0] = handle | T_FLAG;
                    return { rep, scope, own };
                }
            "),

            Intrinsic::ResourceTransferBorrow => {
                let handle_tables = Intrinsic::HandleTables.name();
                let resource_borrows = Intrinsic::ResourceCallBorrows.name();
                let rsc_table_remove = Intrinsic::ResourceTableRemove.name();
                let rsc_table_create_borrow = Intrinsic::ResourceTableCreateBorrow.name();
                let imported_rsc_cnt = Intrinsic::ImportedResourceCnt.name();
                output.push_str(&format!("
                    function resourceTransferBorrow(handle, fromRid, toRid) {{
                        const rep = fromRid < {imported_rsc_cnt} ? {rsc_table_remove}({handle_tables}[fromRid], handle).rep : handle;
                        if (toRid >= {imported_rsc_cnt}) return rep;
                        const newHandle = {rsc_table_create_borrow}({handle_tables}[toRid], rep);
                        {resource_borrows}.push({{ rid: toRid, handle: newHandle }});
                        return newHandle;
                    }}
                "));
            },

            Intrinsic::ResourceTransferBorrowValidLifting => {
                let handle_tables = Intrinsic::HandleTables.name();
                let rsc_table_remove = Intrinsic::ResourceTableRemove.name();
                let rsc_table_create_borrow = Intrinsic::ResourceTableCreateBorrow.name();
                let imported_rsc_cnt = Intrinsic::ImportedResourceCnt.name();
                output.push_str(&format!("
                    function resourceTransferBorrowValidLifting(handle, fromRid, toRid) {{
                        const rep = fromRid < {imported_rsc_cnt} ? {rsc_table_remove}({handle_tables}[fromRid], handle).rep : handle;
                        if (toRid >= {imported_rsc_cnt}) return rep;
                        return {rsc_table_create_borrow}({handle_tables}[toRid], rep);
                    }}
                "));
            },

            Intrinsic::ResourceTransferOwn => {
                let handle_tables = Intrinsic::HandleTables.name();
                let rsc_table_remove = Intrinsic::ResourceTableRemove.name();
                let rsc_table_create_own = Intrinsic::ResourceTableCreateOwn.name();
                output.push_str(&format!("
                    function resourceTransferOwn(handle, fromRid, toRid) {{
                        const {{ rep }} = {rsc_table_remove}({handle_tables}[fromRid], handle);
                        return {rsc_table_create_own}({handle_tables}[toRid], rep);
                    }}
                "));
            },

            Intrinsic::SymbolCabiDispose => output.push_str("
                const symbolCabiDispose = Symbol.for('cabiDispose');
            "),

            Intrinsic::SymbolCabiLower => output.push_str("
                const symbolCabiLower = Symbol.for('cabiLower');
            "),

            Intrinsic::ScopeId => output.push_str("
                let scopeId = 0;
            "),

            Intrinsic::SymbolResourceHandle => output.push_str("
                const symbolRscHandle = Symbol('handle');
            "),

            Intrinsic::SymbolResourceRep => output.push_str("
                const symbolRscRep = Symbol.for('cabiRep');
            "),

            Intrinsic::SymbolDispose => output.push_str("
                const symbolDispose = Symbol.dispose || Symbol.for('dispose');
            "),

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

            Intrinsic::ToBigInt64 => output.push_str("
                const toInt64 = val => BigInt.asIntN(64, BigInt(val));
            "),

            Intrinsic::ToBigUint64 => output.push_str("
                const toUint64 = val => BigInt.asUintN(64, BigInt(val));
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

            Intrinsic::ToInt32 => output.push_str("
                function toInt32(val) {
                    return val >> 0;
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

            Intrinsic::ToResultString => output.push_str("
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

            Intrinsic::ToUint16 => output.push_str("
                function toUint16(val) {
                    val >>>= 0;
                    val %= 2 ** 16;
                    return val;
                }
            "),

            Intrinsic::ToUint32 => output.push_str("
                function toUint32(val) {
                    return val >>> 0;
                }
            "),

            Intrinsic::ToUint8 => output.push_str("
                function toUint8(val) {
                    val >>>= 0;
                    val %= 2 ** 8;
                    return val;
                }
            "),

            Intrinsic::Utf16Decoder => output.push_str("
                const utf16Decoder = new TextDecoder('utf-16');
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

            Intrinsic::Utf8Decoder => output.push_str("
                const utf8Decoder = new TextDecoder();
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
                        ptr = realloc(ptr, allocLen, 1, allocLen += s.length * 2);
                        const { read, written } = utf8Encoder.encodeInto(
                            s,
                            new Uint8Array(memory.buffer, ptr + writtenTotal, allocLen - writtenTotal),
                        );
                        writtenTotal += written;
                        s = s.slice(read);
                    }
                    utf8EncodedLen = writtenTotal;
                    return ptr;
                }
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
      }
    }

    output
}

impl Intrinsic {
    pub fn get_global_names() -> &'static [&'static str] {
        &[
            // Intrinsic list exactly as below
            "base64Compile",
            "clampGuest",
            "ComponentError",
            "dataView",
            "emptyFunc",
            "f32ToI32",
            "f64ToI64",
            "fetchCompile",
            "finalizationRegistryCreate",
            "getErrorPayload",
            "handleTables",
            "hasOwnProperty",
            "i32ToF32",
            "i64ToF64",
            "importedResourceCnt",
            "instantiateCore",
            "isLE",
            "resourceCallBorrows",
            "T_FLAG",
            "rscTableCreateBorrow",
            "rscTableCreateOwn",
            "rscTableGet",
            "rscTableTryGet",
            "rscTableRemove",
            "resourceTransferBorrow",
            "resourceTransferBorrowValidLifting",
            "resourceTransferOwn",
            "scopeId",
            "symbolCabiDispose",
            "symbolCabiLower",
            "symbolDispose",
            "symbolRscHandle",
            "symbolRscRep",
            "throwInvalidBool",
            "throwUninitialized",
            "toInt64",
            "toUint64",
            "toInt16",
            "toInt32",
            "toInt8",
            "toResultString",
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
            // JS Globals / non intrinsic names
            "BigInt",
            "BigInt64Array",
            "DataView",
            "dv",
            "emptyFunc",
            "Error",
            "fetch",
            "Float32Array",
            "Float64Array",
            "Int32Array",
            "Object",
            "process",
            "String",
            "toUint64",
            "TypeError",
            "Uint16Array",
            "Uint8Array",
            "URL",
            "WebAssembly",
        ]
    }

    pub fn name(&self) -> &'static str {
        match self {
            Intrinsic::Base64Compile => "base64Compile",
            Intrinsic::ClampGuest => "clampGuest",
            Intrinsic::ComponentError => "ComponentError",
            Intrinsic::DataView => "dataView",
            Intrinsic::EmptyFunc => "emptyFunc",
            Intrinsic::F32ToI32 => "f32ToI32",
            Intrinsic::F64ToI64 => "f64ToI64",
            Intrinsic::FetchCompile => "fetchCompile",
            Intrinsic::FinalizationRegistryCreate => "finalizationRegistryCreate",
            Intrinsic::GetErrorPayload => "getErrorPayload",
            Intrinsic::GetErrorPayloadString => "getErrorPayloadString",
            Intrinsic::HandleTables => "handleTables",
            Intrinsic::HasOwnProperty => "hasOwnProperty",
            Intrinsic::I32ToF32 => "i32ToF32",
            Intrinsic::I64ToF64 => "i64ToF64",
            Intrinsic::ImportedResourceCnt => "importedResourceCnt",
            Intrinsic::InstantiateCore => "instantiateCore",
            Intrinsic::IsLE => "isLE",
            Intrinsic::ResourceCallBorrows => "resourceCallBorrows",
            Intrinsic::ResourceTableFlag => "T_FLAG",
            Intrinsic::ResourceTableCreateBorrow => "rscTableCreateBorrow",
            Intrinsic::ResourceTableCreateOwn => "rscTableCreateOwn",
            Intrinsic::ResourceTableGet => "rscTableGet",
            Intrinsic::ResourceTableEnsureBorrowDrop => "rscTableTryGet",
            Intrinsic::ResourceTableRemove => "rscTableRemove",
            Intrinsic::ResourceTransferBorrow => "resourceTransferBorrow",
            Intrinsic::ResourceTransferBorrowValidLifting => "resourceTransferBorrowValidLifting",
            Intrinsic::ResourceTransferOwn => "resourceTransferOwn",
            Intrinsic::ScopeId => "scopeId",
            Intrinsic::SymbolCabiDispose => "symbolCabiDispose",
            Intrinsic::SymbolCabiLower => "symbolCabiLower",
            Intrinsic::SymbolDispose => "symbolDispose",
            Intrinsic::SymbolResourceHandle => "symbolRscHandle",
            Intrinsic::SymbolResourceRep => "symbolRscRep",
            Intrinsic::ThrowInvalidBool => "throwInvalidBool",
            Intrinsic::ThrowUninitialized => "throwUninitialized",
            Intrinsic::ToBigInt64 => "toInt64",
            Intrinsic::ToBigUint64 => "toUint64",
            Intrinsic::ToInt16 => "toInt16",
            Intrinsic::ToInt32 => "toInt32",
            Intrinsic::ToInt8 => "toInt8",
            Intrinsic::ToResultString => "toResultString",
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
