use crate::source::Source;
use crate::uwrite;
use std::collections::BTreeSet;
use std::fmt::Write;

#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum Intrinsic {
    Base64Compile,
    ClampGuest,
    ComponentError,
    CurResourceBorrows,
    DataView,
    DefinedResourceTables,
    EmptyFunc,
    F32ToI32,
    F64ToI64,
    FetchCompile,
    FinalizationRegistryCreate,
    GetErrorPayload,
    GetErrorPayloadString,
    GlobalThisIdlProxy,
    HandleTables,
    HasOwnProperty,
    I32ToF32,
    I64ToF64,
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
    ToResultString,
    /// Implementation of <https://tc39.es/ecma262/#sec-tostring>
    ToString,
    /// Implementation of <https://tc39.es/ecma262/#sec-touint16>
    ToUint16,
    /// Implementation of <https://tc39.es/ecma262/#sec-touint32>
    ToUint32,
    /// Implementation of <https://tc39.es/ecma262/#sec-touint8>
    ToUint8,
    Utf16Decoder,
    Utf16Encode,
    Utf8Decoder,
    Utf8Encode,
    Utf8EncodedLen,
    ValidateGuestChar,
    ValidateHostChar,

    /// Storage of component-wide "global" `error-context` metadata
    ///
    /// Contexts are reference counted at both the global level, and locally for a single
    /// component.
    ///
    /// Component-global counts are used along with component-local counts in order
    /// to determine when an error context can *actually* be reclaimed/removed (i.e. no longer
    /// in use in either a local component or by the host in some fashion).
    ///
    /// You can consider the type of the value referenced by this intrinsic to be:
    ///
    /// ```ts
    /// // (in-binary component-global) ~i32, stable index for a component-model-wide error-context
    /// type ErrorContextRep = number;
    /// // (in-binary component-global) u32, number of references to the given handle
    /// type GlobalRefCount = number;
    /// // ('single', component-local) debug message represented by the given error-context
    /// type DebugMessage = string;
    /// // (in-binary component-global) metadata representative of an error-context
    /// type GlobalErrorContextMeta = { refCount: number, debugMessage: string };
    ///
    /// Map<ErrorContextRep, GlobalErrorContextMeta>
    /// ```
    ErrorContextComponentGlobalTable,

    /// Storage of per-component "local" `error-context` metadata
    ///
    /// Contexts are reference counted at the component-local level, with counts here used
    /// in addition to global counts to determine when an error context can be removed.
    ///
    /// This structure is a multi-level lookup based on sparse arrays, indexed by:
    ///   - component
    ///   - local context-error table index (i.e. the component-local id for a context-error)
    ///   - error-context handle
    ///
    /// You can consider the type of the value referenced by this intrinsic to be:
    ///
    /// ```ts
    /// // (in-binary component-global) i32, stable index for a given subcomponent inside the current component
    /// type ComponentIndex = number;
    /// // ('single' component-local) i32, stable index for a given error-context table (effectively identifies a component)
    /// type TableIndex = number;
    /// // ('single', component-local) i32, stable index for a given component's error-context
    /// type ErrorContextHandle = number;
    /// // (in-binary component-global) i32, stable index for a component-model-wide error-context
    /// type ErrorContextRep = number;
    /// // ('single', component-local) u32, number of references to the given handle
    /// type LocalRefCount = number;
    /// // ('single', component-local) information related to the local representation of this error-context
    /// type LocalErrorContextMeta = { rep: number, refCount: number };
    ///
    /// type ErrorContextComponentLocalTable = Map<
    ///   ComponentIndex,
    ///   Map<
    ///     ComponentErrorContextTableIndex,
    ///     Map<
    ///       ErrorContextHandle,
    ///       LocalErrorContextMeta
    ///     >
    ///   >
    /// >
    /// ```
    ///
    /// Note that garbage collection of an error context cannot be done unless *all* references are dropped
    /// (locally and globally)
    ErrorContextComponentLocalTable,

    /// Create a new error context
    ErrorContextNew,

    /// Drop an existing error context
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u64 = bigint;
    /// function errCtxDrop(tbl: ErrorContextComponentLocalTable, errContextHandle: u32): bool;
    /// ```
    ///
    /// see also: [`Intrinsic::ErrorContextComponentLocalTable`]
    ErrorContextDrop,

    /// Transfer a remote error context to a local one, from one component to another
    ///
    /// Error contexts are stored and managed via the ErrorContexts intrinsic,
    /// and this intrinsic builds on that by implementing a function that will
    /// move an error context with a handle from one component that owns it to another.
    ///
    /// This intrinsic is normally invoked when an error-context is passed across a component
    /// boundary (ex. function output, closing a stream/futrue with an error, etc.)
    ///
    /// NOTE that error contexts unlike streams/futures/resources are reference counted --
    /// transferring one does not not drop an error context.
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u64 = bigint;
    /// function errCtxTransfer(tbl: ErrorContextComponentLocalTable, errContextHandle: u32): bool;
    /// ```
    ///
    ErrorContextTransfer,

    /// Retrieve the debug message for an existing error context
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type OuputStringWriteFn = (s: string, outputPtr: u32) => void;
    /// type Options = {
    ///   callbackFnIdx?: u32,
    ///   postReturnFnIdx?: u32,
    ///   async?: bool,
    /// }
    ///
    /// function errCtxDebugMessage(
    ///   opts: Options,
    ///   writeOutput: OuputStringWriteFn,
    ///   tbl: ErrorContextComponentLocalTable,
    ///   errContextHandle: u32, // provided by CABI
    ///   outputStrPtr: u32, // provided by CABI
    /// );
    /// ```
    ///
    ErrorContextDebugMessage,

    /// Retrieve the per component sparse array lookup of error contexts
    ///
    /// See [`Intrinsics::ErrorcontextComponentLocalTable`] for the shape of the lookup.
    ///
    /// This is a utility function that is used internally but does not translate to an actual component model intrinsic.
    ErrorContextGetLocalTable,

    /// Retrieve the component-global rep for a given component-local error-context handle
    ///
    /// See [`Intrinsics::ErrorcontextComponentLocalTable`] for the shape of the per-component error-context table.
    ///
    /// This is a utility function that is used internally but does not translate to an actual component model intrinsic.
    ErrorContextGetHandleRep,

    /// Increment the ref count for a component-global error-context
    ///
    /// See [`Intrinsics::ErrorcontextComponentLocalTable`] for the shape of the global error-context table.
    ///
    /// This is a utility function that is used internally but does not translate to an actual component model intrinsic.
    ErrorContextGlobalRefCountAdd,

    /// Create a local handle in a given component table
    ///
    /// See [`Intrinsics::ErrorcontextComponentLocalTable`] for the shape of the global error-context table.
    ///
    /// Note that this function is expected to receive a table *already* indexed by component.
    ///
    /// This is a utility function that is used internally but does not translate to an actual component model intrinsic.
    ErrorContextCreateLocalHandle,

    /// Reserve a new error context at the global scope, given a debug message to use
    ErrorContextReserveGlobalRep,

    /// Return a value to a caller of an lifted export.
    ///
    /// Consider the following scenario:
    ///   - Some component A is created with a async lifted export
    ///   - A caller of component A (Host/other component) calls the lifted export
    ///   - During component A's execution, component A triggers `task.return` with a (possibly partial) result of computation
    ///   - While processing the `task.return` intrinsic:
    ///     - The host lifts the return values from the partial computation
    ///     - The host pauses execution (if necessary) of component A
    ///     - The host delivers return values to possibly waiting tasks
    ///     - The host continues executing the appropriate next task
    ///
    /// Note that it *is* possible for the lifted export to be sync.
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number;
    /// type usize = bigint;
    /// type ComponentIdx = number;
    /// type TypeIdx = number;
    /// type ValueWithTypeIdx = (ComponentIdx, TypeIdx, any);
    /// type LiftFn = function(ptr: u32, totalLen: usize): ValueWithTypeIndex[];
    ///
    /// function taskReturn(taskId: number, resultLiftFns: LiftFn[], storagePtr: u32, storageLen: usize);
    /// ```
    ///
    TaskReturn,

    /// Remove the subtask (waitable) at the given index, for a given component
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// function subtaskDrop(componentIdx: number, taskId: i32);
    /// ```
    ///
    SubtaskDrop,
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

    if intrinsics.contains(&Intrinsic::ResourceTransferBorrow)
        || intrinsics.contains(&Intrinsic::ResourceTransferBorrowValidLifting)
    {
        intrinsics.insert(Intrinsic::ResourceTableCreateBorrow);
    }

    // Attempting to perform a debug message hoist will require string encoding to memory
    if intrinsics.contains(&Intrinsic::ErrorContextDebugMessage) {
        intrinsics.extend([
            &Intrinsic::Utf8Encode,
            &Intrinsic::Utf16Encode,
            &Intrinsic::ErrorContextGetLocalTable,
        ]);
    }
    if intrinsics.contains(&Intrinsic::ErrorContextNew) {
        intrinsics.extend([
            &Intrinsic::ErrorContextComponentGlobalTable,
            &Intrinsic::ErrorContextReserveGlobalRep,
            &Intrinsic::ErrorContextCreateLocalHandle,
            &Intrinsic::ErrorContextGetLocalTable,
        ]);
    }

    if intrinsics.contains(&Intrinsic::ErrorContextDebugMessage) {
        intrinsics.extend([
            &Intrinsic::ErrorContextGlobalRefCountAdd,
            &Intrinsic::ErrorContextDrop,
            &Intrinsic::ErrorContextGetLocalTable,
        ]);
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

            Intrinsic::CurResourceBorrows => output.push_str("
                let curResourceBorrows = [];
            "),

            Intrinsic::DataView => output.push_str("
                let dv = new DataView(new ArrayBuffer());
                const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
            "),

            Intrinsic::DefinedResourceTables => {},

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
                            _fs = _fs || await import('node:fs/promises');
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

            Intrinsic::GlobalThisIdlProxy => output.push_str(r#"
                var idlProxy;
                function globalThisIdlProxy () {
                    if (idlProxy) return idlProxy;
                    const innerSymbol = Symbol('inner');
                    const isProxySymbol = Symbol('isProxy');
                    const uppercaseRegex = /html|Html|dom|Dom/g;
                    const globalNames = ['Window', 'WorkerGlobalScope'];
                    function proxy(target, fake = {}) {
                        const origTarget = target;
                        return new Proxy(fake, {
                            get: (_, prop, receiver) => {
                                if (prop === innerSymbol) return origTarget;
                                if (prop === isProxySymbol) return true;
                                if (typeof prop !== 'string') return maybeProxy(Reflect.get(origTarget, prop));
                                if (origTarget === globalThis && prop.startsWith('get') && globalNames.includes(prop.slice(3))) {
                                    return () => receiver;
                                }
                                prop = prop.replaceAll(uppercaseRegex, x => x.toUpperCase());
                                if (prop.startsWith('set')) return val => Reflect.set(origTarget, `${prop[3].toLowerCase()}${prop.slice(4)}`, val);
                                if (prop.startsWith('as')) return () => receiver;
                                const res = Reflect.get(origTarget, prop);
                                if (res === undefined && prop[0].toUpperCase() === prop[0]) {
                                    return Object.getPrototypeOf(globalThis[`${prop[0].toLowerCase()}${prop.slice(1)}`]).constructor;
                                }
                                return maybeProxy(res, prop);
                            },
                            apply: (_, thisArg, args) => {
                                if (args.length === 1 && Array.isArray(args[0]) && origTarget.length === 0) args = args[0];
                                const res = Reflect.apply(origTarget, proxyInner(thisArg), args.map(a =>  a[isProxySymbol] ? proxyInner(a) : a));
                                return typeof res === 'object' ? proxy(res) : res;
                            },
                            getPrototypeOf: _ => Reflect.getPrototypeOf(origTarget),
                            construct: (_, argArray, newTarget) => maybeProxy(Reflect.construct(origTarget, argArray, newTarget)),
                            defineProperty: (_, property, attributes) => maybeProxy(Reflect.defineProperty(origTarget, property, attributes)),
                            deleteProperty: (_, p) => maybeProxy(Reflect.deleteProperty(origTarget, p)),
                            getOwnPropertyDescriptor: (_, p) => Reflect.getOwnPropertyDescriptor(origTarget, p),
                            has: (_, p) => maybeProxy(Reflect.has(origTarget, p)),
                            isExtensible: (_) => maybeProxy(Reflect.isExtensible(origTarget)),
                            ownKeys: _ => maybeProxy(Reflect.ownKeys(origTarget)),
                            preventExtensions: _ => maybeProxy(Reflect.preventExtensions(origTarget)),
                            set: (_, p, newValue, receiver) => maybeProxy(Reflect.set(origTarget, p, newValue, receiver)),
                            setPrototypeOf: (_, v) => maybeProxy(Reflect.setPrototypeOf(origTarget, v)),
                        });
                    }
                    function maybeProxy(res, prop) {
                        // Catch Class lookups
                        if (typeof res === "function" && res.prototype?.constructor === res) return res;
                        // Catch "regular" function calls
                        if (typeof res === 'function') return proxy(res, () => {});
                        // Catch all other objects
                        if (typeof res === 'object' && res !== null) return () => proxy(res);
                        return res;
                    }
                    const proxyInner = proxy => proxy ? proxy[innerSymbol] : proxy;
                    return (idlProxy = proxy(globalThis));
                };
            "#),

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

            Intrinsic::InstantiateCore => if !instantiation {
                output.push_str("
                    const instantiateCore = WebAssembly.instantiate;
                ")
            },

            Intrinsic::IsLE => output.push_str("
                const isLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
            "),

            Intrinsic::ResourceCallBorrows => output.push_str("let resourceCallBorrows = [];"),

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

            // For own transfer, in the case of a resource transfer where that resource is never dropped,
            // it is possible to transfer in to a table that is otherwise fully uninitialized by the
            // bindgen.
            Intrinsic::ResourceTransferBorrow => {
                let handle_tables = Intrinsic::HandleTables.name();
                let resource_borrows = Intrinsic::ResourceCallBorrows.name();
                let rsc_table_remove = Intrinsic::ResourceTableRemove.name();
                let rsc_table_create_borrow = Intrinsic::ResourceTableCreateBorrow.name();
                let defined_resource_tables = Intrinsic::DefinedResourceTables.name();
                output.push_str(&format!("
                    function resourceTransferBorrow(handle, fromTid, toTid) {{
                        const fromTable = {handle_tables}[fromTid];
                        const isOwn = (fromTable[(handle << 1) + 1] & T_FLAG) !== 0;
                        const rep = isOwn ? fromTable[(handle << 1) + 1] & ~T_FLAG : {rsc_table_remove}(fromTable, handle).rep;
                        if ({defined_resource_tables}[toTid]) return rep;
                        const toTable = {handle_tables}[toTid] || ({handle_tables}[toTid] = [T_FLAG, 0]);
                        const newHandle = {rsc_table_create_borrow}(toTable, rep);
                        {resource_borrows}.push({{ rid: toTid, handle: newHandle }});
                        return newHandle;
                    }}
                "));
            },

            Intrinsic::ResourceTransferBorrowValidLifting => {
                let handle_tables = Intrinsic::HandleTables.name();
                let rsc_table_remove = Intrinsic::ResourceTableRemove.name();
                let rsc_table_create_borrow = Intrinsic::ResourceTableCreateBorrow.name();
                let defined_resource_tables = Intrinsic::DefinedResourceTables.name();
                output.push_str(&format!("
                    function resourceTransferBorrowValidLifting(handle, fromTid, toTid) {{
                        const fromTable = {handle_tables}[fromTid];
                        const isOwn = (fromTable[(handle << 1) + 1] & T_FLAG) !== 0;
                        const rep = isOwn ? fromTable[(handle << 1) + 1] & ~T_FLAG : {rsc_table_remove}(fromTable, handle).rep;
                        if ({defined_resource_tables}[toTid]) return rep;
                        const toTable = {handle_tables}[toTid] || ({handle_tables}[toTid] = [T_FLAG, 0]);
                        return {rsc_table_create_borrow}(toTable, rep);
                    }}
                "));
            },

            Intrinsic::ResourceTransferOwn => {
                let handle_tables = Intrinsic::HandleTables.name();
                let rsc_table_remove = Intrinsic::ResourceTableRemove.name();
                let rsc_table_create_own = Intrinsic::ResourceTableCreateOwn.name();
                output.push_str(&format!("
                    function resourceTransferOwn(handle, fromTid, toTid) {{
                        const {{ rep }} = {rsc_table_remove}({handle_tables}[fromTid], handle);
                        const toTable = {handle_tables}[toTid] || ({handle_tables}[toTid] = [T_FLAG, 0]);
                        return {rsc_table_create_own}(toTable, rep);
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
                    let buf = utf8Encoder.encode(s);
                    let ptr = realloc(0, 0, 1, buf.length);
                    new Uint8Array(memory.buffer).set(buf, ptr);
                    utf8EncodedLen = buf.length;
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

            Intrinsic::ErrorContextComponentGlobalTable => {
                let name = Intrinsic::ErrorContextComponentGlobalTable.name();
                output.push_str(&format!("const {name} = new Map();"));
            },

            Intrinsic::ErrorContextComponentLocalTable => {
                let name = Intrinsic::ErrorContextComponentLocalTable.name();
                output.push_str(&format!("const {name} = new Map();"));
            },

            Intrinsic::ErrorContextNew => {
                let create_local_handle_fn = Intrinsic::ErrorContextCreateLocalHandle.name();
                let reserve_global_err_ctx_fn = Intrinsic::ErrorContextReserveGlobalRep.name();
                let new_fn= Intrinsic::ErrorContextNew.name();
                let get_local_tbl_fn = Intrinsic::ErrorContextGetLocalTable.name();
                output.push_str(&format!("
                    function {new_fn}(componentIdx, errCtxTblIdx, readInputStrFn, msgPtr, msgLen) {{
                        const componentTable = {get_local_tbl_fn}(componentIdx, errCtxTblIdx);
                        const debugMessage = readInputStrFn(msgPtr, msgLen);
                        const rep = {reserve_global_err_ctx_fn}(debugMessage, 0);
                        return {create_local_handle_fn}(componentTable, rep);
                    }}
                "));
            },

            Intrinsic::ErrorContextDebugMessage => {
                let global_tbl = Intrinsic::ErrorContextComponentGlobalTable.name();
                let err_ctx_debug_msg_fn= Intrinsic::ErrorContextDebugMessage.name();
                let get_local_tbl_fn = Intrinsic::ErrorContextGetLocalTable.name();
                output.push_str(&format!("
                    function {err_ctx_debug_msg_fn}(componentIdx, errCtxTblIdx, opts, writeOutputStrFn, handle, outputStrPtr) {{
                        const componentTable = {get_local_tbl_fn}(componentIdx, errCtxTblIdx);
                        if (!componentTable.get(handle)) {{ throw new Error('missing error-context in component while retrieving debug msg'); }}
                        const rep = componentTable.get(handle).rep;
                        const msg = {global_tbl}.get(rep).debugMessage;
                        writeOutputStrFn(msg, outputStrPtr)
                    }}
                "));
            },

            Intrinsic::ErrorContextDrop => {
                let global_ref_count_add_fn = Intrinsic::ErrorContextGlobalRefCountAdd.name();
                let global_tbl = Intrinsic::ErrorContextComponentGlobalTable.name();
                let err_ctx_drop_fn= Intrinsic::ErrorContextDrop.name();
                let get_local_tbl_fn = Intrinsic::ErrorContextGetLocalTable.name();
                output.push_str(&format!("
                    function {err_ctx_drop_fn}(componentIdx, errCtxTblIdx, handle) {{
                        const localErrCtxTable = {get_local_tbl_fn}(componentIdx, errCtxTblIdx);
                        if (!localErrCtxTable.get(handle)) {{ throw new Error('missing error-context in component during drop'); }}
                        const existing = localErrCtxTable.get(handle);
                        existing.refCount -= 1;
                        if (existing.refCount === 0) {{ localErrCtxTable.delete(handle); }}
                        const globalRefCount = {global_ref_count_add_fn}(existing.rep, -1);
                        if (globalRefCount === 0) {{
                            if (existing.refCount !== 0) {{ throw new Error('local refCount exceeds global during removal'); }}
                            {global_tbl}.delete(existing.rep);
                        }}
                        return true;
                    }}
                "));
            },

            Intrinsic::ErrorContextTransfer => {
                let get_local_tbl_fn = Intrinsic::ErrorContextGetLocalTable.name();
                let drop_fn = Intrinsic::ErrorContextDrop.name();
                let get_handle_rep_fn = Intrinsic::ErrorContextGetHandleRep.name();
                let global_ref_count_add_fn = Intrinsic::ErrorContextGlobalRefCountAdd.name();
                let err_ctx_transfer_fn = Intrinsic::ErrorContextTransfer.name();
                let create_local_handle_fn = Intrinsic::ErrorContextCreateLocalHandle.name();
                // NOTE: the handle described below is *not* the error-context rep, but rather the
                // component-local handle for the canonical rep of a certain global error-context.
                output.push_str(&format!("
                    function {err_ctx_transfer_fn}(fromComponentIdx, toComponentIdx, handle, fromTableIdx, toTableIdx) {{
                        const fromTbl = {get_local_tbl_fn}(fromComponentIdx, fromTableIdx);
                        const toTbl = {get_local_tbl_fn}(toComponentIdx, toTableIdx);
                        const rep = {get_handle_rep_fn}(fromTbl, handle);
                        {global_ref_count_add_fn}(rep, 1); // Add an extra global ref count to avoid premature removal during drop
                        {drop_fn}(fromTbl, handle);
                        const newHandle = {create_local_handle_fn}(toTbl, rep);
                        {global_ref_count_add_fn}(rep, -1); // Re-normalize the global count
                        return newHandle;
                    }}
                "));
            }

            Intrinsic::ErrorContextGetHandleRep => {
                let err_ctx_get_handle_rep_fn = Intrinsic::ErrorContextGetHandleRep.name();
                output.push_str(&format!("
                    function {err_ctx_get_handle_rep_fn}(componentTable, handle) {{
                        if (!Array.isArray(componentTable[handle])) {{ throw new Error('missing error-context in component while retrieving rep'); }}
                        return componentTable[handle][1];
                    }}
                "));
            }

            Intrinsic::ErrorContextGlobalRefCountAdd => {
                let global_tbl = Intrinsic::ErrorContextComponentGlobalTable.name();
                let err_ctx_global_ref_count_add_fn = Intrinsic::ErrorContextGlobalRefCountAdd.name();
                output.push_str(&format!("
                    function {err_ctx_global_ref_count_add_fn}(rep, amount) {{
                        if (!{global_tbl}.get(rep)) {{ throw new Error('missing global error-context for rep [' + rep + '] while incrementing refcount'); }}
                        return {global_tbl}.get(rep).refCount += amount;
                    }}
                "));
            }
            Intrinsic::ErrorContextGetLocalTable => {
                let get_local_tbl_fn = Intrinsic::ErrorContextGetLocalTable.name();
                let local_tbl_var = Intrinsic::ErrorContextComponentLocalTable.name();
                output.push_str(&format!("
                    function {get_local_tbl_fn}(componentIdx, tableIdx) {{
                        if (!{local_tbl_var}.get(componentIdx)) {{ throw new Error('missing/invalid error-context sub-component idx [' + componentIdx + '] while getting local table'); }}
                        if (!{local_tbl_var}.get(componentIdx).get(tableIdx)) {{
                            throw new Error('missing/invalid error-context sub-component idx [' + componentIdx + '] table idx [' + tableIdx + '] while getting local table');
                        }}
                        return {local_tbl_var}.get(componentIdx).get(tableIdx);
                    }}
                "));
            }

            Intrinsic::ErrorContextCreateLocalHandle => {
                // TODO: Refactor to efficient tuple array sparse array setup + non-racy nextId mechanism
                let create_local_handle_fn = Intrinsic::ErrorContextCreateLocalHandle.name();
                let global_tbl = Intrinsic::ErrorContextComponentGlobalTable.name();
                output.push_str(&format!("
                    function {create_local_handle_fn}(table, rep) {{
                        if (!{global_tbl}.get(rep)) {{ throw new Error('missing/invalid global error-context w/ rep [' + rep + ']'); }}
                        const nextHandle = table.size + 1;
                        if (table.has(nextHandle)) {{ throw new Error('unexpected rep collision in global error-context map'); }}
                        table.set(nextHandle, {{ rep, refCount: 1 }});
                        {global_tbl}.get(rep).refCount += 1;
                        return nextHandle;
                    }}
                "));
            }

            Intrinsic::ErrorContextReserveGlobalRep => {
                // TODO: Refactor to efficient tuple array sparse array setup + non-racy nextId mechanism
                let global_tbl = Intrinsic::ErrorContextComponentGlobalTable.name();
                let reserve_global_err_ctx_fn = Intrinsic::ErrorContextReserveGlobalRep.name();
                output.push_str(&format!("
                    function {reserve_global_err_ctx_fn}(debugMessage, refCount) {{
                        const nextRep = {global_tbl}.size + 1;
                        if ({global_tbl}.has(nextRep)) {{ throw new Error('unexpected rep collision in global error-context map'); }}
                        {global_tbl}.set(nextRep, {{ refCount, debugMessage }});
                        return nextRep;
                    }}
                "));
            }

            Intrinsic::TaskReturn => {
                // TODO: write results into provided memory, perform checks for task & result types
                // see: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-taskreturn
                let task_return_fn = Intrinsic::TaskReturn.name();
                output.push_str(&format!("
                    function {task_return_fn}(taskId, liftFns, storagePtr, storageLen) {{
                        const originalPtr = storagePtr;
                        const results = [];
                        for (const liftFn of liftFns) {{
                            const [ componentIdx, typeIdx, val, bytesRead ] =  liftFn(storagePtr, storageLen);
                            storagePtr += bytesRead;
                            storageLen -= bytesRead;
                            results.push([componentIdx, typeIdx, val]);
                        }}
                    }}
                "));
            }

            Intrinsic::SubtaskDrop => {
                // TODO: ensure task is marked "may_leave", drop task for relevant component
                // see: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-subtaskdrop
                let subtask_drop_fn = Intrinsic::SubtaskDrop.name();
                output.push_str(&format!("
                    function {subtask_drop_fn}(componentId, taskId) {{
                    }}
                "));
            }

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
            "curResourceBorrows",
            "dataView",
            "definedResourceTables",
            "emptyFunc",
            "f32ToI32",
            "f64ToI64",
            "fetchCompile",
            "finalizationRegistryCreate",
            "getErrorPayload",
            "globalThisIdlProxy",
            "handleTables",
            "hasOwnProperty",
            "i32ToF32",
            "i64ToF64",
            "imports",
            "instantiateCore",
            "isLE",
            "resourceCallBorrows",
            "resourceTransferBorrow",
            "resourceTransferBorrowValidLifting",
            "resourceTransferOwn",
            "rscTableCreateBorrow",
            "rscTableCreateOwn",
            "rscTableGet",
            "rscTableRemove",
            "rscTableTryGet",
            "scopeId",
            "symbolCabiDispose",
            "symbolCabiLower",
            "symbolDispose",
            "symbolRscHandle",
            "symbolRscRep",
            "T_FLAG",
            "throwInvalidBool",
            "throwUninitialized",
            "toInt16",
            "toInt32",
            "toInt64",
            "toInt8",
            "toResultString",
            "toString",
            "toUint16",
            "toUint32",
            "toUint64",
            "toUint8",
            "utf16Decoder",
            "utf16Encode",
            "utf8Decoder",
            "utf8Encode",
            "utf8EncodedLen",
            "validateGuestChar",
            "validateHostChar",
            // Intrinsics: Error Contexts
            "errCtxGlobal",
            "errCtxLocal",
            "errCtxNew",
            "errCtxDrop",
            "errCtxTransfer",
            "errCtxDebugMessage",
            "errCtxGetHandleRep",
            "errCtxGlobalRefCountAdd",
            "errCtxGetLocalTable",
            "errCtxCreateLocalHandle",
            "errCtxReserveGlobalRep",
            // Intrinsics: Tasks
            "taskReturn",
            "subtaskDrop",
            // JS Globals / non intrinsic names
            "ArrayBuffer",
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
            "TextDecoder",
            "TextEncoder",
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
            Intrinsic::CurResourceBorrows => "curResourceBorrows",
            Intrinsic::DataView => "dataView",
            Intrinsic::DefinedResourceTables => "definedResourceTables",
            Intrinsic::EmptyFunc => "emptyFunc",
            Intrinsic::F32ToI32 => "f32ToI32",
            Intrinsic::F64ToI64 => "f64ToI64",
            Intrinsic::FetchCompile => "fetchCompile",
            Intrinsic::FinalizationRegistryCreate => "finalizationRegistryCreate",
            Intrinsic::GetErrorPayload => "getErrorPayload",
            Intrinsic::GetErrorPayloadString => "getErrorPayloadString",
            Intrinsic::GlobalThisIdlProxy => "globalThisIdlProxy",
            Intrinsic::HandleTables => "handleTables",
            Intrinsic::HasOwnProperty => "hasOwnProperty",
            Intrinsic::I32ToF32 => "i32ToF32",
            Intrinsic::I64ToF64 => "i64ToF64",
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

            // Dealing with error-contexts
            Intrinsic::ErrorContextComponentGlobalTable => "errCtxGlobal",
            Intrinsic::ErrorContextComponentLocalTable => "errCtxLocal",
            Intrinsic::ErrorContextNew => "errCtxNew",
            Intrinsic::ErrorContextDrop => "errCtxDrop",
            Intrinsic::ErrorContextTransfer => "errCtxTransfer",
            Intrinsic::ErrorContextDebugMessage => "errCtxDebugMessage",
            Intrinsic::ErrorContextGetHandleRep => "errCtxGetHandleRep",
            Intrinsic::ErrorContextGlobalRefCountAdd => "errCtxGlobalRefCountAdd",
            Intrinsic::ErrorContextGetLocalTable => "errCtxGetLocalTable",
            Intrinsic::ErrorContextCreateLocalHandle => "errCtxCreateLocalHandle",
            Intrinsic::ErrorContextReserveGlobalRep => "errCtxReserveGlobalRep",

            // Tasks
            Intrinsic::TaskReturn => "taskReturn",
            Intrinsic::SubtaskDrop => "subtaskDrop",
        }
    }
}
