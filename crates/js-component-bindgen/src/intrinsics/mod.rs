//! Intrinsics used from JS

use std::collections::BTreeSet;
use std::fmt::Write;

use crate::source::Source;
use crate::uwrite;

pub(crate) mod conversion;
use conversion::ConversionIntrinsic;

pub(crate) mod js_helper;
use js_helper::JsHelperIntrinsic;

pub(crate) mod webidl;
use webidl::WebIdlIntrinsic;

pub(crate) mod string;
use string::StringIntrinsic;

pub(crate) mod resource;
use resource::ResourceIntrinsic;

pub(crate) mod lift;
use lift::LiftIntrinsic;

pub(crate) mod component;
use component::ComponentIntrinsic;

pub(crate) mod p3;
use p3::async_future::AsyncFutureIntrinsic;
use p3::async_stream::AsyncStreamIntrinsic;
use p3::async_task::AsyncTaskIntrinsic;
use p3::error_context::ErrCtxIntrinsic;
use p3::waitable::WaitableIntrinsic;

/// List of all intrinsics that are used by these
///
/// These intrinsics refer to JS code that is included in order to make
/// transpiled WebAssembly components and their imports/exports functional
/// in the relevant JS context.
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum Intrinsic {
    JsHelper(JsHelperIntrinsic),
    WebIdl(WebIdlIntrinsic),
    Conversion(ConversionIntrinsic),
    String(StringIntrinsic),
    Resource(ResourceIntrinsic),
    ErrCtx(ErrCtxIntrinsic),
    AsyncTask(AsyncTaskIntrinsic),
    Waitable(WaitableIntrinsic),
    Lift(LiftIntrinsic),
    AsyncStream(AsyncStreamIntrinsic),
    AsyncFuture(AsyncFutureIntrinsic),
    Component(ComponentIntrinsic),

    /// Enable debug logging
    DebugLog,

    Base64Compile,
    ClampGuest,
    FetchCompile,

    // Globals
    SymbolCabiDispose,
    SymbolCabiLower,
    SymbolResourceHandle,
    SymbolResourceRep,
    SymbolDispose,
    ScopeId,
    DefinedResourceTables,
    HandleTables,

    // Global Initializers
    FinalizationRegistryCreate,

    // Global classes
    ComponentError,

    // WASI object helpers
    GetErrorPayload,
    GetErrorPayloadString,

    /// Class that manages (and synchronizes) writes to managed buffers
    ManagedBufferClass,

    /// Buffer manager that is used to synchronize component writes
    BufferManagerClass,

    /// Global for an instantiated buffer manager singleton
    GlobalBufferManager,

    /// Reusable table structure for holding canonical ABI objects by their representation/identifier of (e.g. resources, waitables, etc)
    ///
    /// Representations of objects stored in one of these tables is a u32 (0 is expected to be an invalid index).
    RepTableClass,

    /// Event codes used for async, as a JS enum
    AsyncEventCodeEnum,

    /// Write an async event (e.g. result of waitable-set.wait) to linear memory
    WriteAsyncEventToMemory,

    // JS helper functions
    IsLE,
    ThrowInvalidBool,
    ThrowUninitialized,
    HasOwnProperty,
    InstantiateCore,

    /// JS helper function for check whether a given type is borrowed
    ///
    /// Generally the only kind of type that can be borrowed is a resource
    /// handle, so this helper checks for that.
    IsBorrowedType,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) enum DeterminismProfile {
    #[default]
    Deterministic,
    Random,
}

/// Arguments to `render_intrinsics`
pub struct RenderIntrinsicsArgs<'a> {
    /// List of intrinsics being built for use
    pub(crate) intrinsics: &'a mut BTreeSet<Intrinsic>,
    /// Whether to use NodeJS compat
    pub(crate) no_nodejs_compat: bool,
    /// Whether instantiation has occurred
    pub(crate) instantiation: bool,
    /// The kind of determinism to use
    pub(crate) determinism: DeterminismProfile,
}

/// Emits the intrinsic `i` to this file and then returns the name of the
/// intrinsic.
pub fn render_intrinsics(args: RenderIntrinsicsArgs) -> Source {
    let mut output = Source::default();

    // Always include debug logging
    args.intrinsics.insert(Intrinsic::DebugLog);

    // Handle intrinsic "dependence"
    if args.intrinsics.contains(&Intrinsic::GetErrorPayload)
        || args.intrinsics.contains(&Intrinsic::GetErrorPayloadString)
    {
        args.intrinsics.insert(Intrinsic::HasOwnProperty);
    }
    if args
        .intrinsics
        .contains(&Intrinsic::String(StringIntrinsic::Utf16Encode))
    {
        args.intrinsics.insert(Intrinsic::IsLE);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Conversion(ConversionIntrinsic::F32ToI32))
        || args
            .intrinsics
            .contains(&Intrinsic::Conversion(ConversionIntrinsic::I32ToF32))
    {
        output.push_str(
            "
            const i32ToF32I = new Int32Array(1);
            const i32ToF32F = new Float32Array(i32ToF32I.buffer);
        ",
        );
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Conversion(ConversionIntrinsic::F64ToI64))
        || args
            .intrinsics
            .contains(&Intrinsic::Conversion(ConversionIntrinsic::I64ToF64))
    {
        output.push_str(
            "
            const i64ToF64I = new BigInt64Array(1);
            const i64ToF64F = new Float64Array(i64ToF64I.buffer);
        ",
        );
    }

    if args.intrinsics.contains(&Intrinsic::Resource(
        ResourceIntrinsic::ResourceTransferBorrow,
    )) || args.intrinsics.contains(&Intrinsic::Resource(
        ResourceIntrinsic::ResourceTransferBorrowValidLifting,
    )) {
        args.intrinsics.insert(Intrinsic::Resource(
            ResourceIntrinsic::ResourceTableCreateBorrow,
        ));
    }

    // Attempting to perform a debug message hoist will require string encoding to memory
    if args
        .intrinsics
        .contains(&Intrinsic::ErrCtx(ErrCtxIntrinsic::DebugMessage))
    {
        args.intrinsics.extend([
            &Intrinsic::String(StringIntrinsic::Utf8Encode),
            &Intrinsic::String(StringIntrinsic::Utf16Encode),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::GetLocalTable),
        ]);
    }
    if args
        .intrinsics
        .contains(&Intrinsic::ErrCtx(ErrCtxIntrinsic::New))
    {
        args.intrinsics.extend([
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::ComponentGlobalTable),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::ReserveGlobalRep),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::CreateLocalHandle),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::GetLocalTable),
        ]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::ErrCtx(ErrCtxIntrinsic::DebugMessage))
    {
        args.intrinsics.extend([
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::GlobalRefCountAdd),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::Drop),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::GetLocalTable),
        ]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::ContextGet))
        || args
            .intrinsics
            .contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::ContextSet))
    {
        args.intrinsics.extend([
            &Intrinsic::AsyncTask(AsyncTaskIntrinsic::GlobalAsyncCurrentTaskMap),
            &Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass),
            &Intrinsic::AsyncEventCodeEnum,
            &Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask),
        ]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Component(ComponentIntrinsic::BackpressureSet))
    {
        args.intrinsics.extend([&Intrinsic::Component(
            ComponentIntrinsic::GlobalBackpressureMap,
        )]);
    }

    if args.intrinsics.contains(&Intrinsic::Component(
        ComponentIntrinsic::GetOrCreateAsyncState,
    )) {
        args.intrinsics.extend([&Intrinsic::RepTableClass]);
    }

    for current_intrinsic in args.intrinsics.iter() {
        match current_intrinsic {
            Intrinsic::JsHelper(i) => i.render(&mut output),
            Intrinsic::Conversion(i) => i.render(&mut output),
            Intrinsic::String(i) => i.render(&mut output),
            Intrinsic::ErrCtx(i) => i.render(&mut output),
            Intrinsic::Resource(i) => i.render(&mut output),
            Intrinsic::AsyncTask(i) => i.render(&mut output),
            Intrinsic::Waitable(i) => i.render(&mut output, &args),
            Intrinsic::Lift(i) => i.render(&mut output),
            Intrinsic::AsyncStream(i) => i.render(&mut output),
            Intrinsic::AsyncFuture(i) => i.render(&mut output),
            Intrinsic::Component(i) => i.render(&mut output),

            Intrinsic::Base64Compile => {
                if !args.no_nodejs_compat {
                    output.push_str("
                    const base64Compile = str => WebAssembly.compile(typeof Buffer !== 'undefined' ? Buffer.from(str, 'base64') : Uint8Array.from(atob(str), b => b.charCodeAt(0)));
                ")
                } else {
                    output.push_str("
                    const base64Compile = str => WebAssembly.compile(Uint8Array.from(atob(str), b => b.charCodeAt(0)));
                ")
                }
            }

            Intrinsic::ClampGuest => output.push_str(
                "
                function clampGuest(i, min, max) {
                    if (i < min || i > max) \
                    throw new TypeError(`must be between ${min} and ${max}`);
                    return i;
                }
            ",
            ),

            Intrinsic::ComponentError => output.push_str(
                "
                class ComponentError extends Error {
                    constructor (value) {
                        const enumerable = typeof value !== 'string';
                        super(enumerable ? `${String(value)} (see error.payload)` : value);
                        Object.defineProperty(this, 'payload', { value, enumerable });
                    }
                }
            ",
            ),

            Intrinsic::DefinedResourceTables => {}

            Intrinsic::FinalizationRegistryCreate => output.push_str(
                "
                function finalizationRegistryCreate (unregister) {
                    if (typeof FinalizationRegistry === 'undefined') {
                        return { unregister () {} };
                    }
                    return new FinalizationRegistry(unregister);
                }
            ",
            ),

            Intrinsic::FetchCompile => {
                if !args.no_nodejs_compat {
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
                    output.push_str(
                        "
                    const fetchCompile = url => fetch(url).then(WebAssembly.compileStreaming);
                ",
                    )
                }
            }

            Intrinsic::GetErrorPayload => {
                let hop = Intrinsic::HasOwnProperty.name();
                uwrite!(
                    output,
                    "
                    function getErrorPayload(e) {{
                        if (e && {hop}.call(e, 'payload')) return e.payload;
                        if (e instanceof Error) throw e;
                        return e;
                    }}
                "
                )
            }

            Intrinsic::GetErrorPayloadString => {
                let hop = Intrinsic::HasOwnProperty.name();
                uwrite!(
                    output,
                    "
                    function getErrorPayloadString(e) {{
                        if (e && {hop}.call(e, 'payload')) return e.payload;
                        if (e instanceof Error) return e.message;
                        return e;
                    }}
                "
                )
            }

            Intrinsic::WebIdl(w) => w.render(&mut output),

            Intrinsic::HandleTables => output.push_str(
                "
                const handleTables = [];
            ",
            ),

            Intrinsic::HasOwnProperty => output.push_str(
                "
                const hasOwnProperty = Object.prototype.hasOwnProperty;
            ",
            ),

            Intrinsic::InstantiateCore => {
                if !args.instantiation {
                    output.push_str(
                        "
                    const instantiateCore = WebAssembly.instantiate;
                ",
                    )
                }
            }

            Intrinsic::IsLE => output.push_str(
                "
                const isLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
            ",
            ),

            Intrinsic::SymbolCabiDispose => output.push_str(
                "
                const symbolCabiDispose = Symbol.for('cabiDispose');
            ",
            ),

            Intrinsic::SymbolCabiLower => output.push_str(
                "
                const symbolCabiLower = Symbol.for('cabiLower');
            ",
            ),

            Intrinsic::ScopeId => output.push_str(
                "
                let scopeId = 0;
            ",
            ),

            Intrinsic::SymbolResourceHandle => output.push_str(
                "
                const symbolRscHandle = Symbol('handle');
            ",
            ),

            Intrinsic::SymbolResourceRep => output.push_str(
                "
                const symbolRscRep = Symbol.for('cabiRep');
            ",
            ),

            Intrinsic::SymbolDispose => output.push_str(
                "
                const symbolDispose = Symbol.dispose || Symbol.for('dispose');
            ",
            ),

            Intrinsic::ThrowInvalidBool => output.push_str(
                "
                function throwInvalidBool() {
                    throw new TypeError('invalid variant discriminant for bool');
                }
            ",
            ),

            Intrinsic::ThrowUninitialized => output.push_str(
                "
                function throwUninitialized() {
                    throw new TypeError('Wasm uninitialized use `await $init` first');
                }
            ",
            ),

            Intrinsic::DebugLog => {
                let fn_name = Intrinsic::DebugLog.name();
                output.push_str(&format!(
                    "
                    const {fn_name} = (...args) => {{
                        if (!globalThis?.process?.env?.JCO_DEBUG) {{ return; }}
                        console.debug(...args);
                    }}
                "
                ));
            }

            Intrinsic::AsyncEventCodeEnum => {
                let name = Intrinsic::AsyncEventCodeEnum.name();
                output.push_str(&format!(
                    "
                    const {name} = {{
                        NONE: 'none',
                        TASK_CANCELLED: 'task-cancelled',
                        STREAM_READ: 'stream-read',
                        STREAM_WRITE: 'stream-write',
                        FUTURE_READ: 'future-read',
                        FUTURE_WRITE: 'future-write',
                    }};
                "
                ));
            }

            Intrinsic::IsBorrowedType => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let is_borrowed_type_fn = Intrinsic::IsBorrowedType.name();
                let defined_resource_tables = Intrinsic::DefinedResourceTables.name();
                output.push_str(&format!("
                    function {is_borrowed_type_fn}(componentInstanceID, typeIdx) {{
                        {debug_log_fn}('[{is_borrowed_type_fn}()] args', {{ componentInstanceID, typeIdx }});
                        const table = {defined_resource_tables}[componentInstanceID];
                        if (!table) {{ return false; }}
                        const handle = table[(typeIdx << 1) + 1];
                        if (!handle) {{ return false; }}
                        const isOwned = (handle & T_FLAG) !== 0;
                        return !isOwned;
                    }}
                "));
            }

            Intrinsic::ManagedBufferClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let managed_buffer_class = Intrinsic::ManagedBufferClass.name();
                output.push_str(&format!(
                    "
                    class {managed_buffer_class} {{
                        constructor(args) {{
                            {debug_log_fn}('[{managed_buffer_class}#constructor()] args', args);
                        }}
                    }}
                "
                ));
            }

            Intrinsic::BufferManagerClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let buffer_manager_class = Intrinsic::BufferManagerClass.name();
                let managed_buffer_class = Intrinsic::ManagedBufferClass.name();
                output.push_str(&format!("
                    class {buffer_manager_class} {{
                        #buffers = new Map();
                        #bufferIDs = new Map();

                        private constructor() {{ }}

                        getNextBufferID(componentInstanceID) {{
                            const current = this.#bufferIDs.get(args.componentInstanceID, 0);
                            if (typeof current === 'undefined') {{
                                this.#bufferIDs.set(args.componentInstanceID, 1);
                                return 0;
                            }}
                            this.#bufferIDs.set(args.componentInstanceID, current + 1);
                            return current;
                        }}

                        createBuffer(args) {{
                            {debug_log_fn}('[{buffer_manager_class}#create()] args', args);
                            if (!args || typeof args !== 'object') {{ throw new TypeError('missing/invalid argument object'); }}
                            if (!args.componentInstanceID) {{ throw new TypeError('missing/invalid component instance ID'); }}
                            if (!args.start) {{ throw new TypeError('missing/invalid start pointer'); }}
                            if (!args.len) {{ throw new TypeError('missing/invalid buffer length'); }}
                            const {{ componentInstanceID, start, len, typeIdx }} = args;

                            if (!this.#buffers.has(componentInstanceID)) {{
                                this.#buffers.set(componentInstanceID, new Map());
                            }}
                            const instanceBuffers = this.#buffers.get(componentInstanceID);

                            const nextBufID = this.getNextBufferID(args.componentInstanceID);

                            // TODO: check alignment and bounds, if typeIdx is present
                            instanceBuffers.set(nextBufID, new {managed_buffer_class}());

                            return nextBufID;
                        }}
                    }}
                "));
            }

            Intrinsic::GlobalBufferManager => {
                let global_buffer_manager = Intrinsic::GlobalBufferManager.name();
                let buffer_manager_class = Intrinsic::BufferManagerClass.name();
                output.push_str(&format!(
                    "
                    const {global_buffer_manager} = new {buffer_manager_class}();
                "
                ));
            }

            Intrinsic::WriteAsyncEventToMemory => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let write_async_event_to_memory_fn = Intrinsic::WriteAsyncEventToMemory.name();
                output.push_str(&format!("
                    function {write_async_event_to_memory_fn}(memory, task, event, ptr) {{
                        {debug_log_fn}('[{write_async_event_to_memory_fn}()] args', {{ memory, task, event, ptr }});
                        throw new Error('not implemented');
                    }}
                "));
            }

            Intrinsic::RepTableClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!("
                    class {rep_table_class} {{
                        #data = [0, null];

                        insert(val) {{
                            {debug_log_fn}('[{rep_table_class}#insert()] args', {{ val }});
                            const freeIdx = this.#data[0];
                            if (freeIdx === 0) {{
                                this.#data.push(val);
                                this.#data.push(null);
                                return (this.#data.length >> 1) - 1;
                            }}
                            this.#data[0] = this.#data[freeIdx];
                            const newFreeIdx = freeIdx << 1;
                            this.#data[newFreeIdx] = val;
                            this.#data[newFreeIdx + 1] = null;
                            return free;
                        }}

                        get(rep) {{
                            {debug_log_fn}('[{rep_table_class}#insert()] args', {{ rep }});
                            const baseIdx = idx << 1;
                            const val = this.#data[baseIdx];
                            return val;
                        }}

                        contains(rep) {{
                            {debug_log_fn}('[{rep_table_class}#insert()] args', {{ rep }});
                            const baseIdx = idx << 1;
                            return !!this.#data[baseIdx];
                        }}

                        remove(rep) {{
                            {debug_log_fn}('[{rep_table_class}#insert()] args', {{ idx }});
                            if (this.#data.length === 2) {{ throw new Error('invalid'); }}

                            const baseIdx = idx << 1;
                            const val = this.#data[baseIdx];
                            if (val === 0) {{ throw new Error('invalid resource rep (cannot be 0)'); }}
                            this.#data[baseIdx] = this.#data[0];
                            this.#data[0] = idx;
                            return val;
                        }}

                        clear() {{
                            this.#data = [0, null];
                        }}
                    }}
                "));
            }
        }
    }

    output
}

impl Intrinsic {
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        JsHelperIntrinsic::get_global_names()
            .into_iter()
            .chain(vec![
                // Intrinsic list exactly as below
                "base64Compile",
                "clampGuest",
                "ComponentError",
                "definedResourceTables",
                "fetchCompile",
                "finalizationRegistryCreate",
                "getErrorPayload",
                "handleTables",
                "hasOwnProperty",
                "imports",
                "instantiateCore",
                "isLE",
                "scopeId",
                "symbolCabiDispose",
                "symbolCabiLower",
                "symbolDispose",
                "symbolRscHandle",
                "symbolRscRep",
                "T_FLAG",
                "throwInvalidBool",
                "throwUninitialized",
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
                "TypeError",
                "Uint16Array",
                "Uint8Array",
                "URL",
                "WebAssembly",
            ])
    }

    pub fn name(&self) -> &'static str {
        match self {
            Intrinsic::JsHelper(i) => i.name(),
            Intrinsic::Conversion(i) => i.name(),
            Intrinsic::WebIdl(i) => i.name(),
            Intrinsic::String(i) => i.name(),
            Intrinsic::ErrCtx(i) => i.name(),
            Intrinsic::AsyncTask(i) => i.name(),
            Intrinsic::Waitable(i) => i.name(),
            Intrinsic::Resource(i) => i.name(),
            Intrinsic::Lift(i) => i.name(),
            Intrinsic::AsyncStream(i) => i.name(),
            Intrinsic::AsyncFuture(i) => i.name(),
            Intrinsic::Component(i) => i.name(),

            Intrinsic::Base64Compile => "base64Compile",
            Intrinsic::ClampGuest => "clampGuest",
            Intrinsic::ComponentError => "ComponentError",
            Intrinsic::DefinedResourceTables => "definedResourceTables",
            Intrinsic::FetchCompile => "fetchCompile",
            Intrinsic::FinalizationRegistryCreate => "finalizationRegistryCreate",
            Intrinsic::GetErrorPayload => "getErrorPayload",
            Intrinsic::GetErrorPayloadString => "getErrorPayloadString",
            Intrinsic::HandleTables => "handleTables",
            Intrinsic::HasOwnProperty => "hasOwnProperty",
            Intrinsic::InstantiateCore => "instantiateCore",
            Intrinsic::IsLE => "isLE",
            Intrinsic::ScopeId => "scopeId",
            Intrinsic::SymbolCabiDispose => "symbolCabiDispose",
            Intrinsic::SymbolCabiLower => "symbolCabiLower",
            Intrinsic::SymbolDispose => "symbolDispose",
            Intrinsic::SymbolResourceHandle => "symbolRscHandle",
            Intrinsic::SymbolResourceRep => "symbolRscRep",
            Intrinsic::ThrowInvalidBool => "throwInvalidBool",
            Intrinsic::ThrowUninitialized => "throwUninitialized",

            Intrinsic::IsBorrowedType => "_isBorrowedType",

            Intrinsic::DebugLog => "_debugLog",

            // Data structures
            Intrinsic::RepTableClass => "RepTable",

            // Buffers for managed/synchronized writing to/from component memory
            Intrinsic::ManagedBufferClass => "ManagedBuffer",
            Intrinsic::BufferManagerClass => "BufferManager",
            Intrinsic::GlobalBufferManager => "BUFFER_MGR",

            // Helpers for working with async state
            Intrinsic::AsyncEventCodeEnum => "ASYNC_EVENT_CODE",
            Intrinsic::WriteAsyncEventToMemory => "writeAsyncEventToMemory",
        }
    }
}
