//! Intrinsics used from JS

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write;
use std::sync::Mutex;

use crate::source::Source;
use crate::{TranspileOpts, uwrite, uwriteln};

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

pub(crate) mod lower;
use lower::LowerIntrinsic;

pub(crate) mod component;
use component::ComponentIntrinsic;

pub(crate) mod p3;
use p3::async_future::AsyncFutureIntrinsic;
use p3::async_stream::AsyncStreamIntrinsic;
use p3::async_task::AsyncTaskIntrinsic;
use p3::error_context::ErrCtxIntrinsic;
use p3::host::HostIntrinsic;
use p3::waitable::WaitableIntrinsic;

/// List of all intrinsics that are used by these
///
/// These intrinsics refer to JS code that is included in order to make
/// transpiled WebAssembly components and their imports/exports functional
/// in the relevant JS context.
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
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
    Lower(LowerIntrinsic),
    AsyncStream(AsyncStreamIntrinsic),
    AsyncFuture(AsyncFutureIntrinsic),
    Component(ComponentIntrinsic),
    Host(HostIntrinsic),

    // Polyfills
    PromiseWithResolversPonyfill,

    /// Enable debug logging
    DebugLog,

    /// Global setting for determinism (used in async)
    GlobalAsyncDeterminism,

    /// Randomly produce a boolean true/false
    CoinFlip,

    // Basic type helpers
    ConstantI32Max,
    ConstantI32Min,
    TypeCheckValidI32,
    TypeCheckAsyncFn,
    AsyncFunctionCtor,

    Base64Compile,
    ClampGuest,
    FetchCompile,

    // Globals
    SymbolCabiDispose,
    SymbolCabiLower,
    SymbolResourceHandle,
    SymbolResourceRep,
    SymbolDispose,
    SymbolAsyncIterator,
    SymbolIterator,
    ScopeId,
    HandleTables,

    /// Class that conforms to a `ReadableStreams`-like interface and is usable externally
    ///
    /// This is normally the `ReadableStream` class provided by the platform itself.
    PlatformReadableStreamClass,

    // Global Initializers
    FinalizationRegistryCreate,

    // Global classes
    ComponentError,
    WebAssemblyRuntimeError,

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

    // JS helper functions
    IsLE,
    ThrowInvalidBool,
    ThrowUninitialized,
    HasOwnProperty,
    InstantiateCore,

    /// Tracking of component memories
    GlobalComponentMemoryMap,

    /// Tracking of component memories
    RegisterGlobalMemoryForComponent,

    /// Tracking of component memories
    LookupMemoriesForComponent,

    /// Global that tracks the current task
    GlobalCurrentTaskMeta,

    /// Gets the current global task state
    GetGlobalCurrentTaskMetaFn,

    /// Gets the current global task state
    SetGlobalCurrentTaskMetaFn,

    /// Execute a closure with a certain set current task
    WithGlobalCurrentTaskMetaFn,

    /// Execute an async closure with a certain set current task
    WithGlobalCurrentTaskMetaFnAsync,

    /// Clear the global task meta
    ClearGlobalCurrentTaskMetaFn,

    /// Wrap the JS payload of a `WebAssembly.Suspending` import so the
    /// importing component's current-task register survives suspension
    SuspendingImportWrapperFn,
}

macro_rules! impl_from_intrinsic {
    ($($ty:ty => $variant:ident),+ $(,)?) => {
        $(
            impl From<$ty> for Intrinsic {
                fn from(intrinsic: $ty) -> Self {
                    Self::$variant(intrinsic)
                }
            }
        )+
    };
}

impl_from_intrinsic! {
    JsHelperIntrinsic => JsHelper,
    WebIdlIntrinsic => WebIdl,
    ConversionIntrinsic => Conversion,
    StringIntrinsic => String,
    ResourceIntrinsic => Resource,
    ErrCtxIntrinsic => ErrCtx,
    AsyncTaskIntrinsic => AsyncTask,
    WaitableIntrinsic => Waitable,
    LiftIntrinsic => Lift,
    LowerIntrinsic => Lower,
    AsyncStreamIntrinsic => AsyncStream,
    AsyncFutureIntrinsic => AsyncFuture,
    ComponentIntrinsic => Component,
    HostIntrinsic => Host,
}

impl Intrinsic {
    pub fn render(&self, output: &mut Source, args: &RenderIntrinsicsArgs) {
        match self {
            Intrinsic::JsHelper(i) => i.render(output, args),
            Intrinsic::Conversion(i) => i.render(output, args),
            Intrinsic::String(i) => i.render(output, args),
            Intrinsic::ErrCtx(i) => i.render(output, args),
            Intrinsic::Resource(i) => i.render(output, args),
            Intrinsic::AsyncTask(i) => i.render(output, args),
            Intrinsic::Waitable(i) => i.render(output, args),
            Intrinsic::Lift(i) => i.render(output, args),
            Intrinsic::Lower(i) => i.render(output, args),
            Intrinsic::AsyncStream(i) => i.render(output, args),
            Intrinsic::AsyncFuture(i) => i.render(output, args),
            Intrinsic::Component(i) => i.render(output, args),
            Intrinsic::Host(i) => i.render(output, args),

            Intrinsic::GlobalAsyncDeterminism => {
                uwriteln!(
                    output,
                    "const {var_name} = '{determinism}';",
                    var_name = self.name(),
                    determinism = args.determinism_profile,
                );
            }

            Intrinsic::CoinFlip => {
                uwriteln!(
                    output,
                    "const {var_name} = () => {{ return Math.random() > 0.5; }};",
                    var_name = self.name(),
                );
            }

            Intrinsic::ConstantI32Min => output.push_str(&format!(
                "const {const_name} = -2_147_483_648;\n",
                const_name = self.name()
            )),

            Intrinsic::ConstantI32Max => {
                uwriteln!(
                    output,
                    r#"
                      const {const_name} = 2_147_483_647;
                    "#,
                    const_name = self.name()
                )
            }

            Intrinsic::TypeCheckValidI32 => {
                let i32_const_min = args.require_intrinsic(Intrinsic::ConstantI32Min);
                let i32_const_max = args.require_intrinsic(Intrinsic::ConstantI32Max);

                uwriteln!(
                    output,
                    r#"
                      const {fn_name} = (n) => typeof n === 'number' && n >= {i32_const_min} && n <= {i32_const_max};
                    "#,
                    fn_name = self.name()
                );
            }

            Intrinsic::AsyncFunctionCtor => {
                let async_fn_type = args.require_intrinsic(Intrinsic::AsyncFunctionCtor);
                uwriteln!(
                    output,
                    "const {async_fn_type} = (async () => {{}}).constructor;"
                );
            }

            Intrinsic::TypeCheckAsyncFn => {
                let async_fn_check = args.require_intrinsic(Intrinsic::TypeCheckAsyncFn);
                let async_fn_ctor = args.require_intrinsic(Intrinsic::AsyncFunctionCtor);
                uwriteln!(
                    output,
                    r#"
                    const {async_fn_check} = (f) => {{
                        return f instanceof {async_fn_ctor};
                    }};
                    "#,
                );
            }

            Intrinsic::Base64Compile => {
                if !args.transpile_opts.nodejs_compat_disabled {
                    uwriteln!(
                        output,
                        r#"
                          const base64Compile = str => WebAssembly.compile(
                              typeof Buffer !== 'undefined'
                                  ? Buffer.from(str, 'base64')
                                  : Uint8Array.from(atob(str), b => b.charCodeAt(0))
                          );
                        "#
                    );
                } else {
                    uwriteln!(
                        output,
                        r#"
                          const base64Compile = str => WebAssembly.compile(Uint8Array.from(atob(str), b => b.charCodeAt(0)));
                        "#
                    );
                }
            }

            Intrinsic::ClampGuest => {
                uwriteln!(
                    output,
                    r#"
                      function clampGuest(i, min, max) {{
                          if (i < min || i > max) {{
                              throw new TypeError(`must be between ${{min}} and ${{max}}`);
                          }}
                          return i;
                      }}
                    "#
                );
            }

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

            Intrinsic::WebAssemblyRuntimeError => {
                output.push_str("const WebAssemblyRuntimeError = WebAssembly.RuntimeError;\n")
            }

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
                if !args.transpile_opts.nodejs_compat_disabled {
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
                let hop = args.require_intrinsic(Intrinsic::HasOwnProperty);
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
                let hop = args.require_intrinsic(Intrinsic::HasOwnProperty);
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

            Intrinsic::WebIdl(w) => w.render(output),

            Intrinsic::HandleTables => {
                let var_name = self.name();
                uwriteln!(
                    output,
                    r#"
                      const {var_name} = [];
                    "#,
                );
            }

            Intrinsic::HasOwnProperty => output.push_str(
                "
                const hasOwnProperty = Object.prototype.hasOwnProperty;
            ",
            ),

            Intrinsic::InstantiateCore => {
                if !args.instantiation_occurred {
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

            Intrinsic::ScopeId => {
                let name = self.name();
                uwriteln!(output, "let {name} = 0;");
            }

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

            Intrinsic::SymbolDispose => {
                let var_name = self.name();
                uwriteln!(
                    output,
                    "const {var_name} = Symbol.dispose || Symbol.for('dispose');"
                );
            }

            Intrinsic::SymbolAsyncIterator => {
                let var_name = self.name();
                uwriteln!(output, "const {var_name} = Symbol.asyncIterator;");
            }

            Intrinsic::SymbolIterator => {
                let var_name = self.name();
                uwriteln!(output, "const {var_name} = Symbol.iterator;");
            }

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
                let fn_name = args.require_intrinsic(Intrinsic::DebugLog);
                output.push_str(&format!(
                    "
                    const {fn_name} = (...args) => {{
                        if (!globalThis?.process?.env?.JCO_DEBUG) {{ return; }}
                        console.debug(...args);
                    }};
                "
                ));
            }

            Intrinsic::PromiseWithResolversPonyfill => {
                let fn_name = self.name();
                output.push_str(&format!(
                    r#"
                    function {fn_name}() {{
                        if (Promise.withResolvers) {{
                            return Promise.withResolvers();
                        }} else {{
                            let resolve;
                            let reject;
                            const promise = new Promise((res, rej) => {{
                                resolve = res;
                                reject = rej;
                            }});
                            return {{ promise, resolve, reject }};
                        }}
                    }}
                "#
                ));
            }

            Intrinsic::AsyncEventCodeEnum => {
                let name = args.require_intrinsic(Intrinsic::AsyncEventCodeEnum);
                output.push_str(&format!(
                    "
                    const {name} = {{
                        NONE: 0,
                        SUBTASK: 1,
                        STREAM_READ: 2,
                        STREAM_WRITE: 3,
                        FUTURE_READ: 4,
                        FUTURE_WRITE: 5,
                        TASK_CANCELLED: 6,
                    }};
                "
                ));
            }

            Intrinsic::ManagedBufferClass => {
                let debug_log_fn = args.require_intrinsic(Intrinsic::DebugLog);
                let managed_buffer_class = args.require_intrinsic(Intrinsic::ManagedBufferClass);
                let handle_tables = args.require_intrinsic(Intrinsic::HandleTables);
                let table_flag = args
                    .require_intrinsic(Intrinsic::Resource(ResourceIntrinsic::ResourceTableFlag));
                let table_remove = args
                    .require_intrinsic(Intrinsic::Resource(ResourceIntrinsic::ResourceTableRemove));
                let table_create_own = args.require_intrinsic(Intrinsic::Resource(
                    ResourceIntrinsic::ResourceTableCreateOwn,
                ));
                output.push_str(&format!(
                    r#"
                    class {managed_buffer_class} {{
                        static MAX_LENGTH = 2**28 - 1;
                        #componentIdx;
                        #memory;

                        #elemMeta = null;

                        #start;
                        #ptr;
                        capacity;
                        processed = 0;

                        #hostOnlyData; // initial data (only filled out for host-owned)

                        target;

                        constructor(args) {{
                            if (args.capacity > {managed_buffer_class}.MAX_LENGTH) {{
                                 throw new Error(`buffer size [${{args.capacity}}] greater than max length`);
                            }}
                            if (args.componentIdx === undefined) {{ throw new TypeError('missing/invalid component idx'); }}
                            if (args.capacity === undefined) {{ throw new TypeError('missing/invalid capacity'); }}
                            if (!args.elemMeta || typeof args.elemMeta.align32 !== 'number') {{
                                throw new TypeError('missing/invalid element metadata');
                            }}

                            if (!args.memory && args.start === undefined && args.data === undefined) {{
                                throw new TypeError('either memory and start ptr or data must be provided for managed buffers');
                            }}

                            if (args.memory && args.start == undefined) {{
                                throw new TypeError('missing/invalid start ptr, depsite memory being present');
                            }}

                            if (!args.elemMeta.isNone && args.capacity > 0) {{
                                if (args.start && args.start % args.elemMeta.align32 !== 0) {{
                                    throw new Error(`invalid alignment: type with 32bit alignment [${{args.elemMeta.align32}}] at starting pointer [${{args.start}}]`);
                                }}
                                // TODO: memory lenght bounds check
                            }}

                            this.#componentIdx = args.componentIdx;
                            this.#memory = args.memory;
                            this.#start = args.start;
                            this.#ptr = this.#start;
                            this.capacity = args.capacity;
                            this.#elemMeta = args.elemMeta;

                            if (args.data !== undefined && !Array.isArray(args.data)) {{
                                throw new TypeError('host-only data must be an array');
                            }}
                            this.#hostOnlyData = args.data;

                            this.target = args.target;
                        }}

                        setTarget(tgt) {{ this.target = tgt; }}

                        remaining() {{
                            return this.capacity - this.processed;
                        }}

                        componentIdx() {{ return this.#componentIdx; }}

                        getElemMeta() {{ return this.#elemMeta; }}

                        isHostOwned() {{ return !this.#memory; }}

                        read(count, opts = {{}}) {{
                            {debug_log_fn}('[{managed_buffer_class}#read()] args', {{ count }});
                            if (count === undefined || count <= 0) {{
                                throw new TypeError(`missing/invalid count [${{count}}]`);
                            }}

                            const cap = this.capacity;
                            if (count > cap) {{
                                throw new Error(`cannot read [${{count}}] elements from buffer with capacity [${{cap}}]`);
                            }}

                            let values = [];
                            if (this.#elemMeta.isNone) {{
                                values = [...new Array(count)].map(() => null);
                            }} else {{
                                if (this.isHostOwned()) {{
                                    values = this.#hostOnlyData.slice(0, count);
                                    this.#hostOnlyData = this.#hostOnlyData.slice(count);
                                }} else if (this.#elemMeta.payloadTypeName === 'U8') {{
                                    values = Array.from(new Uint8Array(this.#memory.buffer, this.#ptr, count));
                                    this.#ptr += count;
                                }} else {{
                                    let currentCount = count;
                                    let startPtr = this.#ptr;
                                    if (this.#elemMeta.stringEncoding === undefined) {{
                                        throw new Error('string encoding unknown during read');
                                    }}
                                    let liftCtx = {{
                                        storagePtr: startPtr,
                                        memory: this.#memory,
                                        componentIdx: this.#componentIdx,
                                        stringEncoding: this.#elemMeta.stringEncoding,
                                        liftResource: opts.transferResources ? (handle, tableIdx) => {{
                                            const {{ rep }} = {table_remove}({handle_tables}[tableIdx], handle);
                                            return {{ rep }};
                                        }} : undefined,
                                    }};
                                    if (currentCount < 0) {{ throw new Error('unexpectedly invalid count'); }}
                                    while (currentCount > 0) {{
                                        const [value, _ctx] = this.#elemMeta.liftFn(liftCtx);
                                        values.push(value);
                                        currentCount -= 1;
                                    }}
                                    this.#ptr = liftCtx.storagePtr;
                                }}
                            }}

                            this.processed += count;
                            return values;
                        }}

                        write(values, opts = {{}}) {{
                            {debug_log_fn}('[{managed_buffer_class}#write()] args', {{ values }});

                            if (!Array.isArray(values)) {{ throw new TypeError('values input to write() must be an array'); }}
                            let rc = this.remaining();
                            if (values.length > rc) {{
                                throw new Error(`cannot write [${{values.length}}] elements to managed buffer with remaining capacity [${{rc}}]`);
                            }}

                            if (this.#elemMeta.isNone) {{
                                if (!values.every(v => v === null)) {{
                                    throw new Error('non-null values in write() to unit managed buffer');
                                }}
                            }} else {{
                                if (this.isHostOwned()) {{
                                    this.#hostOnlyData = this.#hostOnlyData.concat(values);
                                }} else if (this.#elemMeta.payloadTypeName === 'U8') {{
                                    new Uint8Array(this.#memory.buffer, this.#ptr, values.length).set(values);
                                    this.#ptr += values.length;
                                }} else {{
                                    let startPtr = this.#ptr;
                                    if (this.#elemMeta.stringEncoding === undefined) {{
                                        throw new Error('string encoding unknown during write');
                                    }}

                                    const lowerCtx = {{
                                        memory: this.#memory,
                                        storagePtr: startPtr,
                                        componentIdx: this.#componentIdx,
                                        stringEncoding: this.#elemMeta.stringEncoding,
                                        realloc: this.#elemMeta.getReallocFn?.(),
                                        getReallocFn: this.#elemMeta.getReallocFn,
                                        lowerResource: opts.transferResources ? (resource, tableIdx) => {{
                                            let table = {handle_tables}[tableIdx];
                                            if (!table) {{
                                                table = [{table_flag}, 0];
                                                table._createdReps = new Set();
                                                {handle_tables}[tableIdx] = table;
                                            }}
                                            return {table_create_own}(table, resource.rep);
                                        }} : undefined,
                                    }}
                                    for (const v of values) {{
                                        lowerCtx.vals = [v];
                                        this.#elemMeta.lowerFn(lowerCtx);
                                    }}

                                    this.#ptr = lowerCtx.storagePtr;
                                }}
                            }}

                            this.processed += values.length;
                        }}

                    }}
                "#
                ));
            }

            Intrinsic::BufferManagerClass => {
                let debug_log_fn = args.require_intrinsic(Intrinsic::DebugLog);
                let buffer_manager_class = args.require_intrinsic(Intrinsic::BufferManagerClass);
                let managed_buffer_class = args.require_intrinsic(Intrinsic::ManagedBufferClass);

                output.push_str(&format!(r#"
                    class {buffer_manager_class} {{
                        #buffers = new Map();
                        #bufferIDs = new Map();

                        // NOTE: componentIdx === -1 indicates the host
                        getNextBufferID(componentIdx) {{
                            const current = this.#bufferIDs.get(componentIdx);
                            if (current === undefined) {{
                                this.#bufferIDs.set(componentIdx, 1n);
                                return 1n;
                            }}
                            const next = current + 1n;
                            this.#bufferIDs.set(componentIdx, next);
                            return next;
                        }}

                        getBuffer(componentIdx, bufferID) {{
                            {debug_log_fn}('[{buffer_manager_class}#getBuffer()] args', {{ componentIdx, bufferID }});
                            return this.#buffers.get(componentIdx)?.get(bufferID);
                        }}

                        createBuffer(args) {{
                            {debug_log_fn}('[{buffer_manager_class}#createBuffer()] args', args);
                            if (!args || typeof args !== 'object') {{ throw new TypeError('missing/invalid argument object'); }}

                            if (args.start === undefined && args.data === undefined) {{
                                throw new  TypeError('either a starting pointer or initial values must be provided');
                            }}

                            if (args.start !== undefined && args.componentIdx === undefined) {{ throw new TypeError('missing/invalid component idx'); }}
                            if (args.count === undefined) {{ throw new TypeError('missing/invalid obj count'); }}
                            if (!args.elemMeta) {{ throw new TypeError('missing/invalid element metadata for use with managed buffer'); }}

                            const {{ componentIdx, data, start, count }} = args;

                            if (!this.#buffers.has(componentIdx)) {{ this.#buffers.set(componentIdx, new Map()); }}
                            const instanceBuffers = this.#buffers.get(componentIdx);

                            const nextBufID = this.getNextBufferID(componentIdx);

                            const buffer = new {managed_buffer_class}({{
                                componentIdx,
                                memory: args.memory,
                                start: args.start,
                                capacity: args.count,
                                elemMeta: args.elemMeta,
                                data: args.data,
                                target: args.target,
                                stringEncoding: args.stringEncoding,
                            }});

                            if (instanceBuffers.has(nextBufID)) {{
                                throw new Error(`managed buffer with ID [${{nextBufID}}] already exists`);
                            }}
                            instanceBuffers.set(nextBufID, buffer);

                            return {{ id: nextBufID, buffer }};
                        }}

                        deleteBuffer(componentIdx, bufferID) {{
                            {debug_log_fn}('[{buffer_manager_class}#deleteBuffer()] args', {{ componentIdx, bufferID }});
                            return this.#buffers.get(componentIdx)?.delete(bufferID);
                        }}

                    }}
                "#));
            }

            Intrinsic::GlobalBufferManager => {
                let global_buffer_manager = args.require_intrinsic(Intrinsic::GlobalBufferManager);
                let buffer_manager_class = args.require_intrinsic(Intrinsic::BufferManagerClass);
                output.push_str(&format!(
                    "const {global_buffer_manager} = new {buffer_manager_class}();"
                ));
            }

            Intrinsic::RepTableClass => {
                let debug_log_fn = args.require_intrinsic(Intrinsic::DebugLog);
                let rep_table_class = args.require_intrinsic(Intrinsic::RepTableClass);
                output.push_str(&format!(r#"
                    class {rep_table_class} {{
                        // Sentinel marking a freed slot; the freelist link for a freed slot
                        // lives in the odd cell. This keeps get()/contains()/remove() on freed
                        // reps well-defined (previously they returned/corrupted freelist links).
                        static FREE = Symbol('{rep_table_class}.free');

                        #data = [0, null];
                        #size = 0;
                        #target;

                        constructor(args) {{
                            this.target = args?.target;
                        }}

                        data() {{ return this.#data; }}

                        insert(val) {{
                            {debug_log_fn}('[{rep_table_class}#insert()] args', {{ val, target: this.target }});
                            const freeIdx = this.#data[0];
                            if (freeIdx === 0) {{
                                this.#data.push(val);
                                this.#data.push(null);
                                const rep = (this.#data.length >> 1) - 1;
                                {debug_log_fn}('[{rep_table_class}#insert()] inserted', {{ val, target: this.target, rep }});
                                this.#size += 1;
                                return rep;
                            }}
                            const placementIdx = freeIdx << 1;
                            if (this.#data[placementIdx] !== {rep_table_class}.FREE) {{
                                throw new Error('corrupt rep table freelist: head does not point at a freed slot');
                            }}
                            this.#data[0] = this.#data[placementIdx + 1];
                            this.#data[placementIdx] = val;
                            this.#data[placementIdx + 1] = null;
                            {debug_log_fn}('[{rep_table_class}#insert()] inserted', {{ val, target: this.target, rep: freeIdx }});
                            this.#size += 1;
                            return freeIdx;
                        }}

                        get(rep) {{
                            {debug_log_fn}('[{rep_table_class}#get()] args', {{ rep, target: this.target }});
                            if (rep === 0) {{ throw new Error('invalid resource rep during get, (cannot be 0)'); }}

                            const baseIdx = rep << 1;
                            const val = this.#data[baseIdx];
                            if (val === {rep_table_class}.FREE) {{ return undefined; }}
                            return val;
                        }}

                        contains(rep) {{
                            {debug_log_fn}('[{rep_table_class}#contains()] args', {{ rep, target: this.target }});
                            if (rep === 0) {{ throw new Error('invalid resource rep during contains, (cannot be 0)'); }}

                            const baseIdx = rep << 1;
                            const val = this.#data[baseIdx];
                            return val !== {rep_table_class}.FREE && !!val;
                        }}

                        remove(rep) {{
                            {debug_log_fn}('[{rep_table_class}#remove()] args', {{ rep, target: this.target }});
                            if (rep === 0) {{ throw new Error('invalid resource rep during remove, (cannot be 0)'); }}
                            if (this.#data.length === 2) {{ throw new Error('invalid'); }}

                            const baseIdx = rep << 1;
                            if (baseIdx >= this.#data.length) {{
                                throw new Error(`invalid rep [${{rep}}] during remove, out of range`);
                            }}
                            const val = this.#data[baseIdx];
                            if (val === {rep_table_class}.FREE) {{
                                throw new Error(`double removal of rep [${{rep}}] (already freed)`);
                            }}

                            this.#data[baseIdx] = {rep_table_class}.FREE;
                            this.#data[baseIdx + 1] = this.#data[0];
                            this.#data[0] = rep;
                            this.#size -= 1;

                            return val;
                        }}

                        size() {{ return this.#size; }}

                        clear() {{
                            {debug_log_fn}('[{rep_table_class}#clear()] args', {{ rep, target: this.target }});
                            this.#data = [0, null];
                        }}
                    }}
                "#));
            }

            Intrinsic::GlobalComponentMemoryMap => {
                let global_component_memory_map =
                    args.require_intrinsic(Intrinsic::GlobalComponentMemoryMap);
                output.push_str(&format!(
                    "const {global_component_memory_map} = new Map();\n"
                ));
            }

            Intrinsic::RegisterGlobalMemoryForComponent => {
                let global_component_memory_map =
                    args.require_intrinsic(Intrinsic::GlobalComponentMemoryMap);
                let register_global_component_memory =
                    args.require_intrinsic(Intrinsic::RegisterGlobalMemoryForComponent);
                output.push_str(&format!(
                    r#"
                      function {register_global_component_memory}(args) {{
                          const {{ componentIdx, memory, memoryIdx }} = args ?? {{}};
                          if (componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          if (memory === undefined && memoryIdx === undefined) {{ throw new TypeError('missing both memory & memory idx'); }}
                          let inner = {global_component_memory_map}.get(componentIdx);
                          if (!inner) {{
                              inner = {{}};
                              {global_component_memory_map}.set(componentIdx, inner);
                          }}

                          inner[memoryIdx] = {{ memory, memoryIdx, componentIdx }};
                      }}
                    "#)
                );
            }

            Intrinsic::LookupMemoriesForComponent => {
                let global_component_memory_map =
                    args.require_intrinsic(Intrinsic::GlobalComponentMemoryMap);
                let lookup_global_memories_for_component =
                    args.require_intrinsic(Intrinsic::LookupMemoriesForComponent);
                output.push_str(&format!(
                    r#"
                      function {lookup_global_memories_for_component}(args) {{
                          const {{ componentIdx }} = args ?? {{}};
                          if (args.componentIdx === undefined) {{ throw new TypeError("missing component idx"); }}

                          const metas = {global_component_memory_map}.get(componentIdx);
                          if (!metas) {{ return []; }}

                          if (args.memoryIdx === undefined) {{
                              return Object.values(metas);
                          }}

                          const meta = metas[args.memoryIdx];
                          return meta?.memory;
                      }}
                    "#)
                );
            }

            Self::GlobalCurrentTaskMeta => {
                let name = self.name();
                output.push_str(&format!("const {name} = {{}};\n"));
            }

            Self::GetGlobalCurrentTaskMetaFn => {
                let get_current_global_task_meta_fn =
                    args.require_intrinsic(Self::GetGlobalCurrentTaskMetaFn);
                let global_current_task_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentTaskMeta);

                uwriteln!(
                    output,
                    r#"
                      function {get_current_global_task_meta_fn}(componentIdx) {{
                          if (componentIdx === null || componentIdx === undefined) {{
                              throw new Error("missing/invalid component idx");
                          }}
                          const v = {global_current_task_meta_obj}[componentIdx];
                          if (v === undefined || v === null) {{
                              return undefined;
                          }}
                          return {{ ...v }};
                      }}
                    "#,
                );
            }

            Self::SetGlobalCurrentTaskMetaFn => {
                let set_global_current_task_meta_fn = self.name();
                let global_current_task_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentTaskMeta);

                uwriteln!(
                    output,
                    r#"
                      function {set_global_current_task_meta_fn}(args) {{
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          const {{ taskID, componentIdx }} = args;
                          return {global_current_task_meta_obj}[componentIdx] = {{ taskID, componentIdx }};
                      }}
                    "#,
                );
            }

            Self::WithGlobalCurrentTaskMetaFn => {
                let debug_log_fn = args.require_intrinsic(Intrinsic::DebugLog);
                let with_global_current_task_meta_fn =
                    args.require_intrinsic(Self::WithGlobalCurrentTaskMetaFn);
                let global_current_task_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentTaskMeta);

                output.push_str(&format!(
                    r#"
                      function {with_global_current_task_meta_fn}(args) {{
                          {debug_log_fn}('[{with_global_current_task_meta_fn}()] args', args);
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          if (!args.fn) {{ throw new TypeError('missing fn'); }}
                          const {{ taskID, componentIdx, fn }} = args;
                          const previous = {global_current_task_meta_obj}[componentIdx] ?? null;

                          try {{
                              {global_current_task_meta_obj}[componentIdx] = {{ taskID, componentIdx }};
                              return fn();
                          }} catch (err) {{
                              {debug_log_fn}("error while executing sync callee/callback", {{
                                  ...args,
                                  err,
                              }});
                              throw err;
                          }} finally {{
                              // Synchronous wrappers can nest without any intervening JS
                              // scheduling. Restore the caller rather than clearing it so
                              // helper core exports (for example fused return adapters) can
                              // temporarily run under a different task of the same component.
                              {global_current_task_meta_obj}[componentIdx] = previous;
                          }}
                      }}
                    "#,
                ));
            }

            // NOTE: this function wrapper/closure intrinsic essentially acts as a
            // defactor task queue, ensuring that the right "current task" is set when
            // callees and/or callbacks (WebAssembly functions) run.
            //
            // The idea here is to avoid creating *our own* centralized task queue/event loop,
            // and allow the underlying JS runtime (NodeJS, Browser) to do it's normal scheduling.
            //
            // This costs us complexity -- an `await`/`.then()`/etc anywhere else could park a
            // runtime task and bring us here, in which case we'd be executing *right* before a completely
            // unrelated task (this matters most when it's multiple tasks in the same component idx)
            //
            // e.g.:
            // 1. [componentIdx 1, task 2] entered -- it's async so this is an `await task.enter()`
            // 2. JS runtime switches away from that task
            // 3. [componentIdx 1, task 1] already running, and is about to run it's callee or a callback
            //
            // At (3), we must be careful because the "current" thread is *not* [componentIdx 1, task 1] which
            // is about to try to run it's callback.
            //
            // This is complicated because when two tasks run at the same time, we have to ensure that the component
            // is not exclusively locked by one task. This generally happens @ task.enter(), but an interleaving
            // of events in which this check happens, then *another* task attempts to exclusively lock could happen.
            //
            // In the future, this mechanism may be replaced with a simple event loop that necessarily executes
            // all pending work serially, with this intrinsic becoming simply queueing work onto that event loop.
            //
            Self::WithGlobalCurrentTaskMetaFnAsync => {
                let debug_log_fn = args.require_intrinsic(Intrinsic::DebugLog);
                let with_global_current_task_meta_async_fn =
                    args.require_intrinsic(Self::WithGlobalCurrentTaskMetaFnAsync);
                let global_current_task_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentTaskMeta);

                output.push_str(&format!(
                    r#"
                      async function {with_global_current_task_meta_async_fn}(args) {{
                          {debug_log_fn}('[{with_global_current_task_meta_async_fn}()] args', args);
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          if (!args.fn) {{ throw new TypeError('missing fn'); }}

                          const {{ taskID, componentIdx, fn }} = args;

                          try {{
                              {global_current_task_meta_obj}[componentIdx] = {{ taskID, componentIdx }};
                              return await fn();
                          }} catch (err) {{
                              {debug_log_fn}("error while executing async callee/callback", {{
                                  ...args,
                                  err,
                              }});
                              throw err;
                          }} finally {{
                              {global_current_task_meta_obj}[componentIdx] = null;
                          }}
                      }}
                    "#,
                ));
            }

            Self::ClearGlobalCurrentTaskMetaFn => {
                let debug_log_fn = args.require_intrinsic(Intrinsic::DebugLog);
                let clear_global_current_task_meta_fn =
                    args.require_intrinsic(Self::ClearGlobalCurrentTaskMetaFn);
                let global_current_task_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentTaskMeta);

                output.push_str(&format!(
                    r#"
                      async function {clear_global_current_task_meta_fn}(args) {{
                          {debug_log_fn}('[{clear_global_current_task_meta_fn}()] args', args);
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          const {{ taskID, componentIdx }} = args;

                          const meta = {global_current_task_meta_obj}[componentIdx];
                          if (!meta) {{ throw new Error(`missing current task meta for component idx [${{componentIdx}}]`); }}

                          if (meta.taskID !== taskID) {{
                              throw new Error(`task ID [${{meta.taskID}}] != requested ID [${{taskID}}]`);
                          }}
                          if (meta.componentIdx !== componentIdx) {{
                              throw new Error(`component idx [${{meta.componentIdx}}] != requested idx [${{componentIdx}}]`);
                          }}

                          {global_current_task_meta_obj}[componentIdx] = null;
                      }}
                    "#,
                ));
            }

            // Under JSPI a wasm stack suspends inside a task's callback
            // slice; other tasks then set the per-component current-task
            // register. Restoring the captured entry when the awaited
            // import settles is the last JS to run before the suspended
            // stack resumes, so the resumed continuation's context.get /
            // context.set (and task-exit bookkeeping) address the task
            // that is actually executing.
            Self::SuspendingImportWrapperFn => {
                let suspending_import_wrapper_fn =
                    args.require_intrinsic(Self::SuspendingImportWrapperFn);
                let global_current_task_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentTaskMeta);
                let check_may_leave_fn = args.require_intrinsic(ComponentIntrinsic::CheckMayLeave);

                output.push_str(&format!(
                    r#"
                      function {suspending_import_wrapper_fn}(componentIdx, fn) {{
                          return async function (...args) {{
                              {check_may_leave_fn}(componentIdx);
                              const saved = {global_current_task_meta_obj}[componentIdx] ?? null;
                              try {{
                                  return await fn.apply(null, args);
                              }} finally {{
                                  {global_current_task_meta_obj}[componentIdx] = saved;
                              }}
                          }};
                      }}
                    "#,
                ));
            }

            // TODO(feat): customizable stream classes
            Intrinsic::PlatformReadableStreamClass => {
                let name = self.name();
                uwriteln!(
                    output,
                    r#"
                        if (!ReadableStream) {{
                            throw new Error('builtin stream class [ReadableStream] is not available');
                        }}
                        const {name} = ReadableStream;
                    "#
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render(initial: impl IntoIterator<Item = Intrinsic>) -> (Source, BTreeSet<Intrinsic>) {
        let mut intrinsics = initial.into_iter().collect();
        let opts = TranspileOpts::default();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .build(),
        );
        (source, intrinsics)
    }

    fn render_intrinsic_body(intrinsic: Intrinsic) -> Source {
        let mut source = Source::default();
        let mut intrinsics = BTreeSet::new();
        let opts = TranspileOpts::default();
        let args = RenderIntrinsicsArgs::builder()
            .intrinsics(&mut intrinsics)
            .transpile_opts(&opts)
            .build();
        intrinsic.render(&mut source, &args);
        source
    }

    #[test]
    fn renders_only_requested_and_discovered_intrinsics() {
        let (source, intrinsics) = render([Intrinsic::CoinFlip]);

        assert_eq!(intrinsics, BTreeSet::from([Intrinsic::CoinFlip]));
        assert!(source.contains("Math.random()"));
        assert!(!source.contains("_debugLog"));
        assert!(!source.contains("class RepTable"));
    }

    #[test]
    fn component_async_state_does_not_pull_in_create_stream_or_create_future() {
        let state = Intrinsic::Component(ComponentIntrinsic::ComponentAsyncStateClass);
        let create_stream = Intrinsic::AsyncStream(AsyncStreamIntrinsic::CreateStream);
        let get_stream_end = Intrinsic::AsyncStream(AsyncStreamIntrinsic::GetStreamEnd);
        let create_future = Intrinsic::AsyncFuture(AsyncFutureIntrinsic::CreateFuture);
        let get_future_end = Intrinsic::AsyncFuture(AsyncFutureIntrinsic::GetFutureEnd);
        let (source, intrinsics) = render([state]);

        assert!(!intrinsics.contains(&create_stream));
        assert!(!intrinsics.contains(&get_stream_end));
        assert!(!intrinsics.contains(&create_future));
        assert!(!intrinsics.contains(&get_future_end));
        assert!(!source.contains("function createStream(cstate, args)"));
        assert!(!source.contains("function createFuture(cstate, args)"));

        let (source, _) = render([create_stream]);
        assert!(source.contains("function createStream(cstate, args)"));
        assert!(!source.contains("function getStreamEnd(args)"));
        assert!(!source.contains("function createFuture(cstate, args)"));

        let (source, _) = render([create_future]);
        assert!(source.contains("function createFuture(cstate, args)"));
        assert!(!source.contains("function getFutureEnd(args)"));
        assert!(!source.contains("function createStream(cstate, args)"));

        let (_, intrinsics) = render([Intrinsic::Lift(LiftIntrinsic::LiftFlatStream)]);
        assert!(intrinsics.contains(&get_stream_end));
        assert!(!intrinsics.contains(&create_stream));

        let (_, intrinsics) = render([Intrinsic::Lift(LiftIntrinsic::LiftFlatFuture)]);
        assert!(intrinsics.contains(&get_future_end));
        assert!(!intrinsics.contains(&create_future));
    }

    #[test]
    fn invalid_resource_handles_use_canonical_traps() {
        let get = Intrinsic::Resource(ResourceIntrinsic::ResourceTableGet);
        let remove = Intrinsic::Resource(ResourceIntrinsic::ResourceTableRemove);
        let (source, _) = render([get, remove]);

        assert!(source.contains(
            "throw new WebAssemblyRuntimeError(`unknown handle index ${(handle << 1) + 1}`);"
        ));
    }

    #[test]
    fn stream_and_future_helpers_are_individual_intrinsics() {
        let helpers = [
            (
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::CreateStream),
                "createStream",
            ),
            (
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::GetStreamEnd),
                "getStreamEnd",
            ),
            (
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::AddStreamEndToTable),
                "addStreamEndToTable",
            ),
            (
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::DeleteStreamEnd),
                "deleteStreamEnd",
            ),
            (
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::RemoveStreamEndFromTable),
                "removeStreamEndFromTable",
            ),
            (
                Intrinsic::AsyncFuture(AsyncFutureIntrinsic::CreateFuture),
                "createFuture",
            ),
            (
                Intrinsic::AsyncFuture(AsyncFutureIntrinsic::GetFutureEnd),
                "getFutureEnd",
            ),
            (
                Intrinsic::AsyncFuture(AsyncFutureIntrinsic::AddFutureEndToTable),
                "addFutureEndToTable",
            ),
            (
                Intrinsic::AsyncFuture(AsyncFutureIntrinsic::RemoveFutureEndFromTable),
                "removeFutureEndFromTable",
            ),
        ];

        for &(intrinsic, name) in &helpers {
            let (source, intrinsics) = render([intrinsic]);
            assert!(intrinsics.contains(&intrinsic));

            for &(_, other_name) in &helpers {
                assert_eq!(
                    source.contains(&format!("function {other_name}(")),
                    name == other_name,
                    "rendering {name} unexpectedly changed whether {other_name} was emitted",
                );
            }
        }
    }

    #[test]
    fn discovers_transitive_dependencies_in_dependency_order() {
        let transfer = Intrinsic::Resource(ResourceIntrinsic::ResourceTransferBorrow);
        let table_flag = Intrinsic::Resource(ResourceIntrinsic::ResourceTableFlag);
        let table_get = Intrinsic::Resource(ResourceIntrinsic::ResourceTableGet);
        let table_remove = Intrinsic::Resource(ResourceIntrinsic::ResourceTableRemove);
        let (source, intrinsics) = render([transfer]);

        for dependency in [table_flag, table_get, table_remove] {
            assert!(intrinsics.contains(&dependency));
        }

        let flag_position = source.find("const T_FLAG").unwrap();
        let get_position = source.find("function rscTableGet").unwrap();
        let remove_position = source.find("function rscTableRemove").unwrap();
        let transfer_position = source.find("function resourceTransferBorrow").unwrap();
        assert!(flag_position < get_position);
        assert!(flag_position < remove_position);
        assert!(get_position < transfer_position);
        assert!(remove_position < transfer_position);
    }

    #[test]
    fn self_dependencies_are_cycle_safe() {
        let current_tasks = Intrinsic::AsyncTask(AsyncTaskIntrinsic::GlobalAsyncCurrentTaskMap);
        let (source, intrinsics) = render([current_tasks]);

        assert_eq!(intrinsics, BTreeSet::from([current_tasks]));
        assert_eq!(
            source.matches("const ASYNC_TASKS_BY_COMPONENT_IDX").count(),
            1
        );
    }

    #[test]
    fn sync_current_task_wrapper_restores_nested_task() {
        let (source, _) = render([Intrinsic::WithGlobalCurrentTaskMetaFn]);

        assert!(source.contains("const previous = CURRENT_TASK_META[componentIdx] ?? null;"));
        assert!(source.contains("CURRENT_TASK_META[componentIdx] = previous;"));
    }

    #[test]
    fn resource_destructor_call_creates_and_completes_a_sync_guest_task() {
        let source = render_intrinsic_body(Intrinsic::Resource(
            ResourceIntrinsic::ResourceDestructorCall,
        ));

        assert!(source.contains("if (_getGlobalCurrentTaskMeta(componentIdx))"));
        assert!(source.contains("return dtor(rep);"));
        assert!(source.contains("const [task] = createNewCurrentTask({"));
        assert!(source.contains("isAsync: false,"));
        assert!(source.contains("callingWasmExport: true,"));
        assert!(source.contains("task.enterSync();"));
        assert!(source.contains("return _withGlobalCurrentTaskMeta({"));
        assert!(source.contains("task.resolve([]);"));
        assert!(source.contains("task.exit();"));
        assert!(source.contains("task.setErrored(err);"));
        assert!(source.contains("task.reject(err);"));
        assert!(source.contains("task.exit({ skipExclusiveLockCheck: true });"));
    }

    #[test]
    fn task_return_fused_adapter_runs_in_the_caller_task() {
        let source = render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::TaskReturn));

        assert!(source.contains("const callerTask = task.getParentSubtask().getParentTask();"));
        assert!(source.contains("taskID: callerTask.id(),"));
        assert!(source.contains("componentIdx: callerTask.componentIdx(),"));
        assert!(source.contains(
            "fn: () => subtaskCallMetadata.returnFn.apply(null, [...params, subtaskCallMetadata.resultPtr]),"
        ));
    }

    #[test]
    fn deferred_fused_adapter_runs_in_the_caller_task() {
        let source =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass));

        assert!(source.contains("const callerTask = this.#parentSubtask.getParentTask();"));
        assert!(source.contains("taskID: callerTask.id(),"));
        assert!(source.contains("componentIdx: callerTask.componentIdx(),"));
        assert!(
            source.contains("fn: () => meta.returnFn.apply(null, [taskValue, meta.resultPtr]),")
        );
    }

    #[test]
    fn async_task_post_return_runs_in_the_completing_task() {
        let source =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass));

        assert!(source.contains("taskID: this.#id,"));
        assert!(source.contains("componentIdx: this.#componentIdx,"));
        assert!(source.contains("fn: () => this.#postReturnFn(taskValue),"));
    }

    #[test]
    fn cancelled_tasks_skip_return_lowering_and_post_return() {
        let source =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass));

        assert!(source.contains("const taskReturned = !this.isCancelled();"));
        assert!(source.contains("if (parentSubtaskPending && taskReturned) {"));
        assert!(source.contains("if (this.#postReturnFn && taskReturned) {"));
    }

    #[test]
    fn async_start_fused_adapter_runs_in_the_caller_task() {
        let source = render_intrinsic_body(Intrinsic::Host(HostIntrinsic::AsyncStartCall));

        assert!(source.contains("const callerTask = subtask.getParentTask();"));
        assert!(source.contains("taskID: callerTask.id(),"));
        assert!(source.contains("componentIdx: callerTask.componentIdx(),"));
        assert!(source.contains(
            "fn: () => subtaskCallMeta.returnFn.apply(null, [subtaskCallMeta.resultPtr]),"
        ));
        assert!(source.contains("preparedTask.setCalleeIsAsync((flags & 1) !== 0);"));
        assert!(source.contains("const enteredSynchronously = preparedTask.tryEnter();"));
        assert!(source.contains("fn: () => callee.apply(null, startRes),"));
        assert!(source.contains("const driveJspiCallee = async () => {"));
        assert!(source.contains("if (enteredSynchronously === true) {"));
        assert!(source.contains("startSubtask();"));
        assert!(source.contains("registerSubtaskProgress();"));
        assert!(source.contains("driveJspiCallee();"));
        assert!(source.contains("} else if (enteredSynchronously === null) {"));
        assert!(source.contains("const enterPromise = preparedTask.enter();"));
        assert!(source.contains("if (subtask.isReturned()) {"));
        assert!(source.contains("callerComponentState.handles.remove(subtask.waitableRep())"));
    }

    #[test]
    fn subtask_cancel_drives_one_cancellable_child_slice() {
        let cancel = render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::SubtaskCancel));
        assert!(cancel.contains("childState.suspendedTaskReady(childTask.id())"));
        assert!(cancel.contains("const progress = childTask.waitForProgress();"));
        assert!(cancel.contains("childState.resumeTaskByID(childTask.id())"));
        assert!(cancel.contains("await progress;"));

        let task = render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass));
        assert!(task.contains("#progressWaiters = [];"));
        assert!(task.contains("waitForProgress()"));
        assert_eq!(task.matches("this.notifyProgress();").count(), 1);
        let release = task
            .find("state.exclusiveRelease(this.#id);")
            .expect("task exit should release component entry");
        let progress = task
            .find("this.notifyProgress();")
            .expect("task exit should report progress");
        assert!(release < progress);

        let state = render_intrinsic_body(Intrinsic::Component(
            ComponentIntrinsic::ComponentAsyncStateClass,
        ));
        assert!(state.contains("task.notifyProgress();"));
        assert!(state.contains("suspendedTaskReady(taskID)"));
    }

    #[test]
    fn sync_start_fused_adapter_runs_in_the_caller_task() {
        let source = render_intrinsic_body(Intrinsic::Host(HostIntrinsic::SyncStartCall));

        assert!(source.contains("const callerTask = subtask.getParentTask();"));
        assert!(source.contains("taskID: callerTask.id(),"));
        assert!(source.contains("componentIdx: callerTask.componentIdx(),"));
        assert!(source.contains(
            "fn: () => subtaskCallMeta.returnFn.apply(null, [subtaskCallMeta.resultPtr]),"
        ));
        assert!(source.contains("preparedTask.registerOnResolveHandler(() => {"));
        assert!(source.contains("await taskReturnPromise;"));
        assert!(!source.contains("await _driverLoop({"));
    }

    #[test]
    fn symmetric_guest_calls_switch_task_may_block_state() {
        let enter = render_intrinsic_body(Intrinsic::AsyncTask(
            AsyncTaskIntrinsic::EnterSymmetricSyncGuestCall,
        ));
        assert!(!enter.contains("symmetric sync guest->guest call should not be async"));
        assert!(enter.contains("isAsync: false,"));
        assert!(enter.contains("isAsync: !!calleeIsAsync,"));
        assert!(enter.contains("previousTaskMayBlock: CURRENT_TASK_MAY_BLOCK.value,"));
        assert!(enter.contains("CURRENT_TASK_MAY_BLOCK.value = newTask.mayBlock() ? 1 : 0;"));

        let exit = render_intrinsic_body(Intrinsic::AsyncTask(
            AsyncTaskIntrinsic::ExitSymmetricSyncGuestCall,
        ));
        assert!(exit.contains("const { componentIdx, previousTaskMayBlock }"));
        assert!(exit.contains("CURRENT_TASK_MAY_BLOCK.value = previousTaskMayBlock;"));
    }

    #[test]
    fn resource_transfer_borrow_checks_source_handle() {
        let mut intrinsics = BTreeSet::from([Intrinsic::Resource(
            ResourceIntrinsic::ResourceTransferBorrow,
        )]);
        let opts = TranspileOpts::default();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .build(),
        );

        assert!(source.contains("function rscTableGet(table, handle)"));
        assert!(source.contains("function rscTableRemove(table, handle)"));
        assert!(source.contains("const { rep, own } = rscTableGet(fromTable, handle);"));
        assert!(source.contains("if (!own) rscTableRemove(fromTable, handle);"));
    }

    /// Future read/write trampoline code references the future end classes
    /// (`instanceof FutureReadableEnd`, `FutureEnd.CopyState`), so the classes
    /// must be emitted even when `FutureNew` is absent (see #1898).
    #[test]
    fn future_read_write_emit_future_end_classes() {
        for (op, end_class) in [
            (AsyncFutureIntrinsic::FutureRead, "class FutureReadableEnd"),
            (AsyncFutureIntrinsic::FutureWrite, "class FutureWritableEnd"),
        ] {
            let mut intrinsics = BTreeSet::from([Intrinsic::AsyncFuture(op)]);
            let opts = TranspileOpts::default();
            let source = render_intrinsics(
                RenderIntrinsicsArgs::builder()
                    .intrinsics(&mut intrinsics)
                    .transpile_opts(&opts)
                    .build(),
            );

            assert!(source.contains(end_class), "missing {end_class}");
            assert!(source.contains("class FutureEnd"), "missing FutureEnd");
        }
    }

    #[test]
    fn future_new_allocates_the_readable_end_first() {
        let source =
            render_intrinsic_body(Intrinsic::AsyncFuture(AsyncFutureIntrinsic::CreateFuture));
        let read = source.find("const readEnd = future.readEnd();").unwrap();
        let write = source.find("const writeEnd = future.writeEnd();").unwrap();

        assert!(read < write);
    }

    #[test]
    fn stream_new_allocates_the_readable_end_first() {
        let source =
            render_intrinsic_body(Intrinsic::AsyncStream(AsyncStreamIntrinsic::CreateStream));
        let read = source.find("const readEnd = stream.readEnd();").unwrap();
        let write = source.find("const writeEnd = stream.writeEnd();").unwrap();

        assert!(read < write);
    }

    #[test]
    fn future_operations_only_suspend_for_sync_canonical_calls() {
        for op in [
            AsyncFutureIntrinsic::FutureRead,
            AsyncFutureIntrinsic::FutureWrite,
        ] {
            let source = render_intrinsic_body(Intrinsic::AsyncFuture(op));

            assert!(source.contains(&format!("function {}(", op.name())));
            assert!(!source.contains(&format!("async function {}(", op.name())));
            assert!(source.contains("if (isAsync) {"));
            assert!(source.contains("return task.suspendUntil({"));
        }
    }

    #[test]
    fn stream_operations_only_suspend_for_sync_canonical_calls() {
        for op in [
            AsyncStreamIntrinsic::StreamRead,
            AsyncStreamIntrinsic::StreamWrite,
        ] {
            let source = render_intrinsic_body(Intrinsic::AsyncStream(op));

            assert!(source.contains(&format!("function {}(", op.name())));
            assert!(!source.contains(&format!("async function {}(", op.name())));
        }

        for end in [
            AsyncStreamIntrinsic::StreamReadableEndClass,
            AsyncStreamIntrinsic::StreamWritableEndClass,
        ] {
            let source = render_intrinsic_body(Intrinsic::AsyncStream(end));
            assert!(source.contains("copy(args) {"));
            assert!(!source.contains("async copy(args) {"));
            assert!(source.contains("if (isAsync) {"));
            assert!(source.contains("return task.suspendUntil({"));
        }
    }

    #[test]
    fn future_ends_track_own_and_peer_drop_state_separately() {
        let mut intrinsics = BTreeSet::from([Intrinsic::AsyncFuture(
            AsyncFutureIntrinsic::InternalFutureClass,
        )]);
        let opts = TranspileOpts::default();
        let source = render_intrinsics(
            RenderIntrinsicsArgs::builder()
                .intrinsics(&mut intrinsics)
                .transpile_opts(&opts)
                .build(),
        );

        assert!(source.contains("#dropped = false;"));
        assert!(source.contains("isDropped() { return this.#dropped; }"));
        assert!(source.contains("isPeerDropped() { return this.#isPeerDroppedFn(); }"));
        assert!(source.contains("isPeerDroppedFn: () => this.#writeEnd?.isDropped() ?? false,"));
        assert!(source.contains("isPeerDroppedFn: () => this.#readEnd.isDropped(),"));
        assert!(source.contains("if (this.isPeerDropped()) {"));
    }

    #[test]
    fn flat_flags_bigint_representation_is_opt_in() {
        fn render(flags_as_bigint: bool) -> Source {
            let mut intrinsics = BTreeSet::from([
                Intrinsic::Lift(LiftIntrinsic::LiftFlatFlags),
                Intrinsic::Lower(LowerIntrinsic::LowerFlatFlags),
            ]);
            let opts = TranspileOpts::builder()
                .name("test".into())
                .flags_as_bigint(flags_as_bigint)
                .build();
            render_intrinsics(
                RenderIntrinsicsArgs::builder()
                    .intrinsics(&mut intrinsics)
                    .transpile_opts(&opts)
                    .build(),
            )
        }

        let default_source = render(false);
        assert!(default_source.contains("val[name] = (bits & 1) === 1;"));
        assert!(default_source.contains("const flagObj = ctx.vals[0];"));
        assert!(!default_source.contains("val = BigInt(bits >>> 0);"));

        let bigint_source = render(true);
        assert!(bigint_source.contains("val = BigInt(bits >>> 0);"));
        assert!(bigint_source.contains("typeof bigintFlags !== 'bigint'"));
        assert!(!bigint_source.contains("const flagObj = ctx.vals[0];"));
    }
}

/// Profile for determinism to be used by async implementation
#[derive(Debug, Default, PartialEq, Eq)]
pub enum AsyncDeterminismProfile {
    /// Allow random ordering non-determinism
    #[default]
    Random,

    /// Require determinism
    #[allow(unused)]
    Deterministic,
}

impl std::fmt::Display for AsyncDeterminismProfile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                Self::Deterministic => "deterministic",
                Self::Random => "random",
            }
        )
    }
}

/// Arguments to `render_intrinsics`
#[derive(bon::Builder)]
#[non_exhaustive]
pub struct RenderIntrinsicsArgs<'a> {
    /// List of intrinsics being built for use
    pub(crate) intrinsics: &'a mut BTreeSet<Intrinsic>,
    /// Whether instantiation has occurred
    #[builder(default)]
    pub(crate) instantiation_occurred: bool,
    /// The kind of determinism to use
    #[builder(default)]
    pub(crate) determinism_profile: AsyncDeterminismProfile,
    /// Options provided when performing transpilation
    pub(crate) transpile_opts: &'a TranspileOpts,
    /// Intrinsic dependencies discovered while rendering one intrinsic
    #[builder(default)]
    discovered_intrinsics: Mutex<BTreeSet<Intrinsic>>,
}

impl RenderIntrinsicsArgs<'_> {
    /// Retrieve an intrinsic's name and register it as a dependency of the
    /// intrinsic currently being rendered.
    pub fn require_intrinsic(&self, intrinsic: impl Into<Intrinsic>) -> &'static str {
        let intrinsic = intrinsic.into();
        self.discovered_intrinsics
            .lock()
            .expect("intrinsic dependency collector lock should not be poisoned")
            .insert(intrinsic);
        intrinsic.name()
    }

    fn take_discovered_intrinsics(&self) -> BTreeSet<Intrinsic> {
        std::mem::take(
            &mut *self
                .discovered_intrinsics
                .lock()
                .expect("intrinsic dependency collector lock should not be poisoned"),
        )
    }
}

/// Emits the intrinsic `i` to this file and then returns the name of the
/// intrinsic.
pub fn render_intrinsics(mut args: RenderIntrinsicsArgs) -> Source {
    render_intrinsics_discovered(&mut args)
}

fn render_intrinsics_discovered(args: &mut RenderIntrinsicsArgs<'_>) -> Source {
    let mut pending = args.intrinsics.clone();
    let mut rendered = BTreeMap::new();
    let mut dependencies = BTreeMap::new();

    while let Some(intrinsic) = pending.pop_first() {
        if rendered.contains_key(&intrinsic) {
            continue;
        }

        debug_assert!(args.take_discovered_intrinsics().is_empty());
        let mut source = Source::default();
        intrinsic.render(&mut source, args);
        let discovered = args.take_discovered_intrinsics();
        for dependency in &discovered {
            if !rendered.contains_key(dependency) {
                pending.insert(*dependency);
            }
            args.intrinsics.insert(*dependency);
        }
        dependencies.insert(intrinsic, discovered);
        rendered.insert(intrinsic, source);
    }

    let mut output = Source::default();
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

    let mut visiting = BTreeSet::new();
    let mut emitted = BTreeSet::new();
    for intrinsic in args.intrinsics.iter().copied() {
        emit_intrinsic(
            intrinsic,
            &dependencies,
            &rendered,
            &mut visiting,
            &mut emitted,
            &mut output,
        );
    }
    output
}

fn emit_intrinsic(
    intrinsic: Intrinsic,
    dependencies: &BTreeMap<Intrinsic, BTreeSet<Intrinsic>>,
    rendered: &BTreeMap<Intrinsic, Source>,
    visiting: &mut BTreeSet<Intrinsic>,
    emitted: &mut BTreeSet<Intrinsic>,
    output: &mut Source,
) {
    if emitted.contains(&intrinsic) || !visiting.insert(intrinsic) {
        return;
    }

    if let Some(intrinsic_dependencies) = dependencies.get(&intrinsic) {
        for dependency in intrinsic_dependencies {
            emit_intrinsic(
                *dependency,
                dependencies,
                rendered,
                visiting,
                emitted,
                output,
            );
        }
    }

    visiting.remove(&intrinsic);
    if emitted.insert(intrinsic) {
        output.push_str(
            rendered
                .get(&intrinsic)
                .expect("intrinsic should have been rendered"),
        );
    }
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
                "WebAssemblyRuntimeError",
                "fetchCompile",
                "finalizationRegistryCreate",
                "getErrorPayload",
                "HANDLE_TABLES",
                "hasOwnProperty",
                "imports",
                "instantiateCore",
                "isLE",
                "scopeId",
                "symbolCabiDispose",
                "symbolCabiLower",
                "symbolDispose",
                "symbolAsyncIterator",
                "symbolIterator",
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
                "GlobalComponentMemories",
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
            Intrinsic::Lower(i) => i.name(),
            Intrinsic::AsyncStream(i) => i.name(),
            Intrinsic::AsyncFuture(i) => i.name(),
            Intrinsic::Component(i) => i.name(),
            Intrinsic::Host(i) => i.name(),

            Intrinsic::Base64Compile => "base64Compile",
            Intrinsic::ClampGuest => "clampGuest",
            Intrinsic::ComponentError => "ComponentError",
            Intrinsic::WebAssemblyRuntimeError => "WebAssemblyRuntimeError",
            Intrinsic::FetchCompile => "fetchCompile",
            Intrinsic::FinalizationRegistryCreate => "finalizationRegistryCreate",
            Intrinsic::GetErrorPayload => "getErrorPayload",
            Intrinsic::GetErrorPayloadString => "getErrorPayloadString",
            Intrinsic::HandleTables => "HANDLE_TABLES",
            Intrinsic::HasOwnProperty => "hasOwnProperty",
            Intrinsic::InstantiateCore => "instantiateCore",
            Intrinsic::IsLE => "isLE",
            Intrinsic::ScopeId => "SCOPE_ID",

            Intrinsic::SymbolCabiDispose => "symbolCabiDispose",
            Intrinsic::SymbolCabiLower => "symbolCabiLower",
            Intrinsic::SymbolDispose => "symbolDispose",
            Intrinsic::SymbolAsyncIterator => "symbolAsyncIterator",
            Intrinsic::SymbolIterator => "symbolIterator",
            Intrinsic::SymbolResourceHandle => "symbolRscHandle",
            Intrinsic::SymbolResourceRep => "symbolRscRep",

            Intrinsic::ThrowInvalidBool => "throwInvalidBool",
            Intrinsic::ThrowUninitialized => "throwUninitialized",

            // Debugging
            Intrinsic::DebugLog => "_debugLog",
            Intrinsic::PromiseWithResolversPonyfill => "promiseWithResolvers",

            // Types
            Intrinsic::ConstantI32Min => "I32_MIN",
            Intrinsic::ConstantI32Max => "I32_MAX",
            Intrinsic::TypeCheckValidI32 => "_typeCheckValidI32",
            Intrinsic::TypeCheckAsyncFn => "_typeCheckAsyncFn",
            Intrinsic::AsyncFunctionCtor => "ASYNC_FN_CTOR",

            // Streams
            Intrinsic::PlatformReadableStreamClass => "_PlatformReadableStream",

            // Async
            Intrinsic::GlobalAsyncDeterminism => "ASYNC_DETERMINISM",
            Intrinsic::CoinFlip => "_coinFlip",

            // Global current task tracking machinery
            Self::GlobalCurrentTaskMeta => "CURRENT_TASK_META",
            Self::GetGlobalCurrentTaskMetaFn => "_getGlobalCurrentTaskMeta",
            Self::SetGlobalCurrentTaskMetaFn => "_setGlobalCurrentTaskMeta",
            Self::WithGlobalCurrentTaskMetaFn => "_withGlobalCurrentTaskMeta",
            Self::WithGlobalCurrentTaskMetaFnAsync => "_withGlobalCurrentTaskMetaAsync",
            Self::ClearGlobalCurrentTaskMetaFn => "_clearCurrentTask",
            Self::SuspendingImportWrapperFn => "_suspendingImport",

            // Iteratively saved metadata
            Intrinsic::GlobalComponentMemoryMap => "GLOBAL_COMPONENT_MEMORY_MAP",
            Intrinsic::RegisterGlobalMemoryForComponent => "registerGlobalMemoryForComponent",
            Intrinsic::LookupMemoriesForComponent => "lookupMemoriesForComponent",

            // Data structures
            Intrinsic::RepTableClass => "RepTable",

            // Buffers for managed/synchronized writing to/from component memory
            Intrinsic::ManagedBufferClass => "ManagedBuffer",
            Intrinsic::BufferManagerClass => "BufferManager",
            Intrinsic::GlobalBufferManager => "BUFFER_MGR",

            // Helpers for working with async state
            Intrinsic::AsyncEventCodeEnum => "ASYNC_EVENT_CODE",
        }
    }
}
