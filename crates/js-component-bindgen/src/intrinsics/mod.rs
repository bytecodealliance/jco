//! Intrinsics used from JS

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write;
use std::sync::Mutex;

use wasmtime_environ::Trap;

use crate::source::Source;
use crate::{TranspileOpts, uwrite, uwriteln};

pub(crate) const CM_RUNTIME_API_VERSION: u32 = 2;
pub(crate) const CM_RUNTIME_PROVIDER_LOCAL_NAME: &str = "_jcoRuntimeProvider";
const CM_RUNTIME_LOCAL_NAME: &str = "_jcoRuntime";
const CM_RUNTIME_INTRINSICS_LOCAL_NAME: &str = "_jcoIntrinsics";

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
    /// Dispose of a host-provided value (e.g. a `Promise` or iterator) that a guest discarded
    DisposeHostValue,
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

    /// Canonical trap messages indexed by their FACT discriminant.
    FactTrapMessages,

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

    /// Per-component thread registers plus `current`, the thread executing core Wasm.
    /// FACT adapters use `current` because they have no owning component.
    GlobalCurrentThreadMeta,

    /// Gets the current global thread state
    GetGlobalCurrentThreadMetaFn,

    /// Gets the current global thread state
    SetGlobalCurrentThreadMetaFn,

    /// Execute a closure with a certain set current thread
    WithGlobalCurrentThreadMetaFn,

    /// Execute a closure with a certain set current task, which is async only
    /// if the closure returns a promise
    WithGlobalCurrentThreadMetaFnAsync,

    /// Run a generator function synchronously, until it yields a promise
    MaybeSyncGeneratorFn,

    /// Clear the global task meta
    ClearGlobalCurrentThreadMetaFn,

    /// Wrap the JS payload of a `WebAssembly.Suspending` import so the
    /// importing component's current-task register survives suspension
    SuspendingImportWrapperFn,

    /// Build an `(i32) -> i32` Wasm trampoline that calls a plain fast path
    /// before falling back to a JSPI-suspending slow path when it returns -2.
    ConditionalSuspending1I32ToI32Fn,

    /// Build an `(i32, i32) -> i32` Wasm trampoline that calls a plain fast
    /// path before falling back to a JSPI-suspending slow path.
    ConditionalSuspending2I32ToI32Fn,

    /// Build an `(i32, i32, i32) -> i32` Wasm trampoline that calls a plain
    /// fast path before falling back to a JSPI-suspending slow path when it
    /// returns -2.
    ConditionalSuspending3I32ToI32Fn,

    /// Build an `(i32, i32, i32) -> ()` Wasm trampoline that calls a plain fast
    /// path before falling back to a JSPI-suspending slow path.
    ConditionalSuspending3I32ToVoidFn,

    /// Compiled Wasm of the conditional-suspending trampolines, by trampoline name
    ConditionalSuspendingWasm,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum IntrinsicBinding {
    Inline {
        local_name: &'static str,
    },
    Runtime {
        local_name: &'static str,
        path: &'static str,
    },
}

impl IntrinsicBinding {
    fn local_name(self) -> &'static str {
        match self {
            Self::Inline { local_name } | Self::Runtime { local_name, .. } => local_name,
        }
    }
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

fn fact_trap_messages_js() -> String {
    let messages = (0..=u8::MAX)
        .filter_map(|code| {
            Trap::from_u8(code).map(|trap| format!("{code}: {:?}", trap.to_string()))
        })
        .collect::<Vec<_>>();
    format!("{{ {} }}", messages.join(", "))
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

            Intrinsic::FactTrapMessages => {
                uwriteln!(
                    output,
                    "const {name} = {messages};",
                    name = self.name(),
                    messages = fact_trap_messages_js(),
                );
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

            Intrinsic::DisposeHostValue => {
                let fn_name = self.name();
                let symbol_dispose = args.require_intrinsic(Intrinsic::SymbolDispose);
                uwriteln!(
                    output,
                    r#"
                    // Dispose of a host-provided value that a guest discarded, using `disposeFn`
                    // if provided, otherwise the value's `Symbol.asyncDispose` or `Symbol.dispose`.
                    //
                    // Disposal runs in a microtask, so host code never runs inside a canonical
                    // built-in (where it could re-enter the component), and errors are reported
                    // rather than surfaced to the guest.
                    function {fn_name}(value, disposeFn) {{
                        if (!disposeFn) {{
                            if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {{ return; }}
                            if (typeof Symbol.asyncDispose === 'symbol' && typeof value[Symbol.asyncDispose] === 'function') {{
                                disposeFn = value[Symbol.asyncDispose];
                            }} else if (typeof value[{symbol_dispose}] === 'function') {{
                                disposeFn = value[{symbol_dispose}];
                            }} else {{
                                return;
                            }}
                        }}
                        const reportErr = (err) => console.error('[jco] error while disposing discarded host value', err);
                        queueMicrotask(() => {{
                            try {{
                                const res = disposeFn.call(value);
                                if (res && typeof res.then === 'function') {{ res.then(undefined, reportErr); }}
                            }} catch (err) {{
                                reportErr(err);
                            }}
                        }});
                    }}
                    "#
                );
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
                let runtime_error_class =
                    args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
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
                        // An index space shared with the other handle kinds of a component
                        // instance (see `getHandleIndexSpace`); without one, this table keeps
                        // its own free list.
                        #space = null;

                        constructor(args) {{
                            this.target = args?.target;
                            this.#space = args?.space ?? null;
                        }}

                        data() {{ return this.#data; }}

                        insert(val) {{
                            if (this.#space !== null) {{
                                const rep = this.#space.alloc();
                                this.#data[rep << 1] = val;
                                this.#data[(rep << 1) + 1] = null;
                                this.#size += 1;
                                return rep;
                            }}
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
                            if (rep === 0) {{ throw new {runtime_error_class}('invalid resource rep during get, (cannot be 0)'); }}

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
                            if (this.#space !== null) {{
                                const baseIdx = rep << 1;
                                const val = this.#data[baseIdx];
                                if (val === undefined || val === {rep_table_class}.FREE) {{
                                    throw new {runtime_error_class}(`unknown handle index ${{rep}}`);
                                }}
                                this.#data[baseIdx] = {rep_table_class}.FREE;
                                this.#data[baseIdx + 1] = null;
                                this.#size -= 1;
                                this.#space.release(rep);
                                return val;
                            }}
                            if (this.#data.length === 2) {{ throw new Error('invalid'); }}

                            const baseIdx = rep << 1;
                            if (baseIdx >= this.#data.length) {{
                                throw new Error(`invalid rep [${{rep}}] during remove, out of range`);
                            }}
                            const val = this.#data[baseIdx];
                            if (val === {rep_table_class}.FREE) {{
                                throw new {runtime_error_class}(`double removal of rep [${{rep}}] (already freed)`);
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

            Self::GlobalCurrentThreadMeta => {
                let name = self.name();
                output.push_str(&format!("const {name} = {{}};\n"));
            }

            Self::GetGlobalCurrentThreadMetaFn => {
                let get_current_global_thread_meta_fn =
                    args.require_intrinsic(Self::GetGlobalCurrentThreadMetaFn);
                let global_current_thread_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentThreadMeta);

                uwriteln!(
                    output,
                    r#"
                      function {get_current_global_thread_meta_fn}(componentIdx) {{
                          const v = componentIdx === undefined || componentIdx === null
                              ? {global_current_thread_meta_obj}.current
                              : {global_current_thread_meta_obj}[componentIdx];
                          if (v === undefined || v === null) {{
                              return undefined;
                          }}
                          return {{ ...v }};
                      }}
                    "#,
                );
            }

            Self::SetGlobalCurrentThreadMetaFn => {
                let set_global_current_thread_meta_fn = self.name();
                let global_current_thread_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentThreadMeta);

                uwriteln!(
                    output,
                    r#"
                      function {set_global_current_thread_meta_fn}(args) {{
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          if (args.threadID === undefined) {{ throw new TypeError('missing thread ID'); }}
                          const {{ taskID, threadID, componentIdx }} = args;
                          return {global_current_thread_meta_obj}.current =
                              {global_current_thread_meta_obj}[componentIdx] = {{ threadID, taskID, componentIdx }};
                      }}
                    "#,
                );
            }

            Self::WithGlobalCurrentThreadMetaFn => {
                let debug_log_fn = args.require_intrinsic(Intrinsic::DebugLog);
                let with_global_current_thread_meta_fn =
                    args.require_intrinsic(Self::WithGlobalCurrentThreadMetaFn);
                let global_current_thread_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentThreadMeta);

                output.push_str(&format!(
                    r#"
                      function {with_global_current_thread_meta_fn}(args) {{
                          {debug_log_fn}('[{with_global_current_thread_meta_fn}()] args', args);
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.threadID === undefined) {{ throw new TypeError('missing thread ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          if (!args.fn) {{ throw new TypeError('missing fn'); }}
                          const {{ taskID, threadID, componentIdx, fn }} = args;
                          const previous = {global_current_thread_meta_obj}[componentIdx] ?? null;
                          const previousCurrent = {global_current_thread_meta_obj}.current ?? null;

                          try {{
                              {global_current_thread_meta_obj}.current =
                                  {global_current_thread_meta_obj}[componentIdx] = {{ threadID, taskID, componentIdx }};
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
                              // temporarily run under a different thread of the same component.
                              {global_current_thread_meta_obj}[componentIdx] = previous;
                              {global_current_thread_meta_obj}.current = previousCurrent;
                          }}
                      }}
                    "#,
                ));
            }

            // NOTE: this function wrapper/closure intrinsic essentially acts as a
            // defactor task queue, ensuring that the right "current thread" is set when
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
            // 1. [componentIdx 1, task 2, thread 1] entered -- it's async so this is an `await task.enter()`
            // 2. JS runtime switches away from that task
            // 3. [componentIdx 1, task 1, thread 1] already running, and is about to run it's callee or a callback
            //
            // At (3), we must be careful because the "current" thread is *not* [componentIdx 1, task 1, thread 1] which
            // is about to try to run it's callback.
            //
            // This is complicated because when two tasks run at the same time, we have to ensure that the component
            // is not exclusively locked by one task. This generally happens @ task.enter(), but an interleaving
            // of events in which this check happens, then *another* task attempts to exclusively lock could happen.
            //
            // In the future, this mechanism may be replaced with a simple event loop that necessarily executes
            // all pending work serially, with this intrinsic becoming simply queueing work onto that event loop.
            //
            // A closure that returns synchronously is treated like WithGlobalCurrentThreadMetaFn.
            // While the promise of one that returns a promise is pending, the task stays current.
            Self::WithGlobalCurrentThreadMetaFnAsync => {
                let debug_log_fn = args.require_intrinsic(Intrinsic::DebugLog);
                let with_global_current_thread_meta_async_fn =
                    args.require_intrinsic(Self::WithGlobalCurrentThreadMetaFnAsync);
                let global_current_thread_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentThreadMeta);

                output.push_str(&format!(
                    r#"
                      function {with_global_current_thread_meta_async_fn}(args) {{
                          {debug_log_fn}('[{with_global_current_thread_meta_async_fn}()] args', args);
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.threadID === undefined) {{ throw new TypeError('missing thread ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          if (!args.fn) {{ throw new TypeError('missing fn'); }}

                          const {{ taskID, threadID, componentIdx, fn }} = args;
                          const previous = {global_current_thread_meta_obj}[componentIdx] ?? null;
                          const previousCurrent = {global_current_thread_meta_obj}.current ?? null;

                          let result;
                          try {{
                              {global_current_thread_meta_obj}.current =
                                  {global_current_thread_meta_obj}[componentIdx] = {{ taskID, threadID, componentIdx }};
                              result = fn();
                          }} catch (err) {{
                              {debug_log_fn}("error while executing sync callee/callback", {{
                                  ...args,
                                  err,
                              }});
                              {global_current_thread_meta_obj}[componentIdx] = previous;
                              {global_current_thread_meta_obj}.current = previousCurrent;
                              throw err;
                          }}

                          if (result === null ||
                              (typeof result !== 'object' && typeof result !== 'function') ||
                              typeof result.then !== 'function') {{
                              {global_current_thread_meta_obj}[componentIdx] = previous;
                              {global_current_thread_meta_obj}.current = previousCurrent;
                              return result;
                          }}

                          return (async () => {{
                              try {{
                                  return await result;
                              }} catch (err) {{
                                  {debug_log_fn}("error while executing async callee/callback", {{
                                      ...args,
                                      err,
                                  }});
                                  throw err;
                              }} finally {{
                                  if ({global_current_thread_meta_obj}[componentIdx]?.threadID === threadID &&
                                      {global_current_thread_meta_obj}[componentIdx]?.taskID === taskID) {{
                                      {global_current_thread_meta_obj}[componentIdx] = null;
                                  }}
                                  if ({global_current_thread_meta_obj}.current?.threadID === threadID &&
                                      {global_current_thread_meta_obj}.current?.taskID === taskID) {{
                                      {global_current_thread_meta_obj}.current = null;
                                  }}
                              }}
                          }})();
                      }}
                    "#,
                ));
            }

            // Wrap a generator function, which yields where an async function would await,
            // so that it runs synchronously until it yields a promise. A host import that
            // answers synchronously then returns synchronously, which a task that cannot
            // block (e.g. a resource destructor) requires.
            Self::MaybeSyncGeneratorFn => {
                let maybe_sync_generator_fn = args.require_intrinsic(Self::MaybeSyncGeneratorFn);

                output.push_str(&format!(
                    r#"
                      function {maybe_sync_generator_fn}(genFn) {{
                          return function (...args) {{
                              const gen = genFn.apply(this, args);
                              const step = (method, value) => {{
                                  while (true) {{
                                      const {{ value: yielded, done }} = gen[method](value);
                                      if (done) {{ return yielded; }}
                                      if (yielded === null ||
                                          (typeof yielded !== 'object' && typeof yielded !== 'function') ||
                                          typeof yielded.then !== 'function') {{
                                          method = 'next';
                                          value = yielded;
                                          continue;
                                      }}
                                      return Promise.resolve(yielded).then(
                                          res => step('next', res),
                                          err => step('throw', err),
                                      );
                                  }}
                              }};
                              return step('next', undefined);
                          }};
                      }}
                    "#,
                ));
            }

            Self::ClearGlobalCurrentThreadMetaFn => {
                let debug_log_fn = args.require_intrinsic(Intrinsic::DebugLog);
                let clear_global_current_thread_meta_fn =
                    args.require_intrinsic(Self::ClearGlobalCurrentThreadMetaFn);
                let global_current_thread_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentThreadMeta);

                output.push_str(&format!(
                    r#"
                      async function {clear_global_current_thread_meta_fn}(args) {{
                          {debug_log_fn}('[{clear_global_current_thread_meta_fn}()] args', args);
                          if (!args) {{ throw new TypeError('args missing'); }}
                          if (args.taskID === undefined) {{ throw new TypeError('missing task ID'); }}
                          if (args.threadID === undefined) {{ throw new TypeError('missing thread ID'); }}
                          if (args.componentIdx === undefined) {{ throw new TypeError('missing component idx'); }}
                          const {{ taskID, threadID, componentIdx }} = args;

                          const meta = {global_current_thread_meta_obj}[componentIdx];
                          if (!meta) {{ throw new Error(`missing current thread meta for component idx [${{componentIdx}}]`); }}

                          if (meta.threadID !== threadID) {{
                              throw new Error(`thread ID [${{meta.threadID}}] != requested ID [${{threadID}}]`);
                          }}
                          if (meta.taskID !== taskID) {{
                              throw new Error(`task ID [${{meta.taskID}}] != requested ID [${{taskID}}]`);
                          }}
                          if (meta.componentIdx !== componentIdx) {{
                              throw new Error(`component idx [${{meta.componentIdx}}] != requested idx [${{componentIdx}}]`);
                          }}

                          {global_current_thread_meta_obj}[componentIdx] = null;
                          if ({global_current_thread_meta_obj}.current?.threadID === threadID &&
                              {global_current_thread_meta_obj}.current?.taskID === taskID) {{
                              {global_current_thread_meta_obj}.current = null;
                          }}
                      }}
                    "#,
                ));
            }

            // Reject a blocking core start synchronously, before the JS engine
            // can abandon an unobserved promise. A nonblocking task may still
            // call a suspending import when the helper completes synchronously,
            // so preserve its raw result and reject only a returned promise.
            // A host import (`callsHost`) handles a call without a current task,
            // such as a destructor run outside of any task, in the same way.
            //
            // Run blocking helpers entirely inside an async function. Moving
            // the helper invocation outside that function changes JSPI
            // continuation scheduling and can strand later stream operations.
            // Restoring the captured entry is the last JS to run before the
            // suspended stack resumes. EnterSyncCall instead leaves the newly
            // entered callee current (switchesTask), including after lock contention.
            Self::SuspendingImportWrapperFn => {
                let get_or_create_async_state_fn = args.require_intrinsic(Intrinsic::Component(
                    ComponentIntrinsic::GetOrCreateAsyncState,
                ));
                let record_trap_fn =
                    args.require_intrinsic(Intrinsic::Component(ComponentIntrinsic::RecordTrap));
                let suspending_import_wrapper_fn =
                    args.require_intrinsic(Self::SuspendingImportWrapperFn);
                let global_current_thread_meta_obj =
                    args.require_intrinsic(Self::GlobalCurrentThreadMeta);
                let check_may_leave_fn = args.require_intrinsic(ComponentIntrinsic::CheckMayLeave);
                let current_task_may_block =
                    args.require_intrinsic(p3::async_task::AsyncTaskIntrinsic::CurrentTaskMayBlock);
                let get_current_thread =
                    args.require_intrinsic(p3::async_task::AsyncTaskIntrinsic::GetCurrentThread);
                let runtime_error_class =
                    args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);

                output.push_str(&format!(
                    r#"
                      function {suspending_import_wrapper_fn}(componentIdx, fn, syncOnly = false, switchesTask = false, convertsRangeErrors = true, callsHost = false) {{
                          return function (...args) {{
                              {check_may_leave_fn}(componentIdx);
                              const saved = {global_current_thread_meta_obj}[componentIdx] ?? null;

                              const savedThread = saved
                                  ? {get_current_thread}(saved.componentIdx, saved.threadID, saved.taskID)
                                  : null;
                              const mayBlock = savedThread
                                  ? (savedThread?.task.mayBlock() ?? ({current_task_may_block}.value !== 0))
                                  : false;
                              if (!saved && !mayBlock && !callsHost) {{
                                  throw new {runtime_error_class}('cannot block a synchronous task before returning');
                              }}

                              if (syncOnly || !mayBlock) {{
                                  let result;
                                  try {{
                                      result = fn.apply(null, args);
                                  }} catch (err) {{
                                      {global_current_thread_meta_obj}[componentIdx] = saved;
                                      if (!switchesTask) {{ {global_current_thread_meta_obj}.current = saved; }}
                                      // A trap is recorded before it propagates: nothing else in
                                      // the store may run after it, not even a queued call.
                                      throw {record_trap_fn}(componentIdx, err, convertsRangeErrors);
                                  }}

                                  {global_current_thread_meta_obj}[componentIdx] = saved;
                                  if (!switchesTask) {{ {global_current_thread_meta_obj}.current = saved; }}

                                  if (result !== null &&
                                      (typeof result === 'object' || typeof result === 'function') &&
                                      typeof result.then === 'function') {{
                                      // The helper may already have returned a rejected promise.
                                      // Mark it handled before replacing it with the canonical
                                      // synchronous-task trap.
                                      Promise.resolve(result).catch(() => {{}});
                                      throw new {runtime_error_class}('cannot block a synchronous task before returning');
                                  }}
                                  return result;
                              }}

                              return (async () => {{
                                  try {{
                                      const result = await fn.apply(null, args);
                                      // The instance trapped while this stack was suspended: it
                                      // must not resume into guest code (Canonical ABI).
                                      {get_or_create_async_state_fn}(componentIdx).throwIfInterrupted();
                                      return result;
                                  }} catch (err) {{
                                      throw {record_trap_fn}(componentIdx, err, convertsRangeErrors);
                                  }} finally {{
                                      {global_current_thread_meta_obj}[componentIdx] = saved;
                                      if (!switchesTask) {{ {global_current_thread_meta_obj}.current = saved; }}
                                  }}
                              }})();
                          }};
                      }}
                    "#,
                ));
            }

            Self::ConditionalSuspending1I32ToI32Fn
            | Self::ConditionalSuspending2I32ToI32Fn
            | Self::ConditionalSuspending3I32ToI32Fn
            | Self::ConditionalSuspending3I32ToVoidFn => {
                let conditional_suspending_fn = args.require_intrinsic(*self);
                let wasm = args.require_intrinsic(Self::ConditionalSuspendingWasm);
                let register = self.register_conditional_suspending_js(args);

                output.push_str(&format!(
                    r#"
                      {register}

                      function {conditional_suspending_fn}(fast, slow) {{
                          return new WebAssembly.Instance(
                              {wasm}.{conditional_suspending_fn},
                              {{ '': {{ fast, slow: new WebAssembly.Suspending(slow) }} }},
                          ).exports.run;
                      }}
                    "#,
                ));
            }

            Self::ConditionalSuspendingWasm => {
                uwriteln!(output, "const {} = {{}};", self.name());
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
    fn fact_trap_messages_are_shared_and_emitted_on_demand() {
        let (source, intrinsics) = render([Intrinsic::FactTrapMessages]);

        assert_eq!(intrinsics, BTreeSet::from([Intrinsic::FactTrapMessages]));
        assert_eq!(source.matches("const FACT_TRAP_MESSAGES =").count(), 1);
        assert!(source.contains(&format!(
            "{}: {:?}",
            Trap::CannotEnterComponent as u8,
            "wasm trap: cannot enter component instance"
        )));
        assert!(source.contains(&format!(
            "{}: {:?}",
            Trap::CannotLeaveComponent as u8,
            "wasm trap: cannot leave component instance"
        )));

        let (source, intrinsics) = render([Intrinsic::WebAssemblyRuntimeError]);
        assert!(!intrinsics.contains(&Intrinsic::FactTrapMessages));
        assert!(!source.contains("FACT_TRAP_MESSAGES"));
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

        assert!(source.contains("function rscTableGet(table, handle)"));
        assert!(!source.contains("_jcoRuntimeProvider"));
        assert!(
            source.contains("throw new WebAssemblyRuntimeError(`unknown handle index ${handle}`);")
        );
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

        for dependency in [table_flag, table_get] {
            assert!(intrinsics.contains(&dependency));
        }
        assert!(!intrinsics.contains(&table_remove));

        let get_position = source.find("function rscTableGet(table, handle)").unwrap();
        let flag_position = source.find("const T_FLAG").unwrap();
        let transfer_position = source.find("function resourceTransferBorrow").unwrap();
        assert!(!source.contains("_jcoRuntimeProvider"));
        assert!(flag_position < get_position);
        assert!(flag_position < transfer_position);
        assert!(get_position < transfer_position);
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
        let (source, _) = render([Intrinsic::WithGlobalCurrentThreadMetaFn]);

        assert!(source.contains("const previous = CURRENT_TASK_META[componentIdx] ?? null;"));
        assert!(source.contains("CURRENT_TASK_META[componentIdx] = previous;"));
    }

    #[test]
    fn async_current_thread_wrapper_requires_explicit_thread_id() {
        let (source, _) = render([Intrinsic::WithGlobalCurrentThreadMetaFnAsync]);

        assert!(source.contains(
            "if (args.threadID === undefined) { throw new TypeError('missing thread ID'); }"
        ));
    }

    #[test]
    fn suspending_import_preserves_sync_results_and_rejects_disallowed_blocking() {
        let source = render_intrinsic_body(Intrinsic::SuspendingImportWrapperFn);

        assert!(source.contains("return function (...args) {"));
        assert!(source.contains("syncOnly = false"));
        assert!(
            source.contains(
                "? (savedThread?.task.mayBlock() ?? (CURRENT_TASK_MAY_BLOCK.value !== 0))"
            )
        );
        assert!(source.contains(": false;"));
        assert!(source.contains("if (syncOnly || !mayBlock) {"));

        assert!(!source.contains("return async function (...args) {"));
        assert!(source.contains("if (!saved && !mayBlock && !callsHost) {"));

        assert!(source.contains("result = fn.apply(null, args);"));
        assert!(source.contains("typeof result.then === 'function'"));
        assert!(source.contains("Promise.resolve(result).catch(() => {});"));
        assert!(source.contains("if (syncOnly || !mayBlock) {"));
        assert!(source.contains(
            "new WebAssemblyRuntimeError('cannot block a synchronous task before returning')"
        ));
        assert!(source.contains("return (async () => {"));
        assert!(source.contains("const result = await fn.apply(null, args);"));
        assert!(source.contains("CURRENT_TASK_META[componentIdx] = saved;"));
    }

    #[test]
    fn maybe_sync_generator_awaits_only_promises() {
        let source = render_intrinsic_body(Intrinsic::MaybeSyncGeneratorFn);

        assert!(source.contains("const gen = genFn.apply(this, args);"));
        assert!(source.contains("typeof yielded.then !== 'function'"));
        assert!(source.contains("return Promise.resolve(yielded).then("));
        assert!(source.contains("err => step('throw', err),"));
    }

    #[test]
    fn async_current_task_wrapper_restores_sync_results() {
        let source = render_intrinsic_body(Intrinsic::WithGlobalCurrentThreadMetaFnAsync);

        assert!(source.contains("result = fn();"));
        assert!(source.contains("CURRENT_TASK_META[componentIdx] = previous;"));
        assert!(source.contains("return await result;"));
        assert!(source.contains("CURRENT_TASK_META[componentIdx] = null;"));
    }

    #[test]
    fn manually_async_tasks_may_block() {
        let source =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass));

        assert!(source.contains("isManualAsync() { return this.#isManualAsync; }"));
        assert!(source.contains(
            "mayBlock() { return this.isAsync() || this.isManualAsync() || this.isResolvedState() || this.#funcTypeIsAsync }"
        ));
    }

    #[test]
    fn resource_destructor_call_creates_and_completes_a_sync_guest_task() {
        let source = render_intrinsic_body(Intrinsic::Resource(
            ResourceIntrinsic::ResourceDestructorCall,
        ));

        assert!(!source.contains("if (_getGlobalCurrentThreadMeta(componentIdx))"));
        assert!(source.contains("const result = dtor(rep);"));
        assert!(source.contains("const { task, threadID } = createNewCurrentImplicitThread({"));
        assert!(source.contains("isAsync: false,"));
        assert!(source.contains("callingWasmExport: true,"));
        assert!(source.contains("task.enterSync();"));
        assert!(source.contains("return _withGlobalCurrentThreadMeta({"));
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
        assert!(source.contains("threadID: subtaskCallMetadata.callerThreadID,"));
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

        let post_return = source
            .split("if (this.#postReturnFn && taskReturned)")
            .nth(1)
            .unwrap();
        assert!(post_return.contains("taskID: this.#id,"));
        assert!(post_return.contains("threadID: this.defaultThread().id(),"));
        assert!(post_return.contains("componentIdx: this.#componentIdx,"));
        assert!(post_return.contains("fn: () => this.#postReturnFn(taskValue),"));
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
        assert!(source.contains("threadID: subtaskCallMeta.callerThreadID,"));
        assert!(source.contains("componentIdx: callerTask.componentIdx(),"));
        assert!(source.contains(
            "fn: () => subtaskCallMeta.returnFn.apply(null, [subtaskCallMeta.resultPtr]),"
        ));
        assert!(source.contains("preparedTask.setCalleeIsAsync((flags & 1) !== 0);"));
        // Every callee attempts eager entry.  `tryEnter` preserves STARTING only for real
        // backpressure or lock contention, while otherwise exposing STARTED after the
        // callee has run to its first suspension point.
        assert!(source.contains("const enteredSynchronously = preparedTask.tryEnter();"));
        assert!(!source.contains("const mayStartSynchronously"));
        assert!(source.contains("fn: () => callee.apply(null, startRes),"));
        assert!(!source.contains("if (callbackResult !== undefined)"));
        assert!(source.contains("driveCallback(callbackResult)?.catch(err =>"));
        assert!(source.contains("const driveJspiCallee = async () => {"));
        assert!(source.contains("if (enteredSynchronously === true) {"));
        assert!(source.contains("startSubtask();"));
        assert!(source.contains("registerSubtaskProgress();"));
        assert!(source.contains("driveJspiCallee();"));
        let delayed_start = source
            .find("} else if (enteredSynchronously === null) {")
            .expect("async start intrinsic should contain the delayed-entry branch");
        let delayed_source = &source[delayed_start..];
        assert!(source.contains("const enterPromise = preparedTask.enter().then(started => {"));
        assert!(delayed_source.contains("taskID: preparedTask.id(),"));
        assert!(delayed_source.contains("componentIdx: preparedTask.componentIdx(),"));
        assert!(delayed_source.contains("fn: startSubtask,"));
        assert!(source.contains("if (subtask.isReturned()) {"));
        assert!(source.contains("callerComponentState.handles.remove(subtask.waitableRep())"));
    }

    #[test]
    fn subtask_cancel_drives_only_the_target_callback_slice() {
        let cancel = render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::SubtaskCancel));
        assert!(cancel.contains("childTask?.hasCallback()"));
        assert!(cancel.contains("childState.suspendedTaskCancellable(childTask.id())"));
        assert!(cancel.contains("childState.suspendedTaskReady(childTask.id())"));
        assert!(cancel.contains("childState.resumeTaskByID(childTask.id())"));
        assert!(cancel.contains("function subtaskCancel"));
        assert!(!cancel.contains("async function subtaskCancel"));
        assert!(cancel.contains(".then(finishCancel)"));
        assert!(cancel.contains("cancellationWillCompleteAsync ? 0xFFFFFFFE : 0xFFFFFFFF"));
        assert!(cancel.contains("if (!slowOnly) { return 0xFFFFFFFE; }"));
        assert!(cancel.contains("return progress.then(() =>"));
        assert!(!cancel.contains("childTask.cancel()"));
        assert!(!cancel.contains("resumeOneReadyTask()"));

        let task = render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass));
        assert!(task.contains("suspendUntilCallback(opts, onResume)"));
        assert!(task.contains("this.#callbackFn._jcoMaySuspend === false"));
        assert!(task.contains("if (this.isResolvedState() || this.isCancelled())"));
        assert!(task.contains("cancellationRequested() { return this.cancelRequested; }"));
        let release = task
            .find("state.exclusiveRelease(this.#id);")
            .expect("task exit should release component entry");
        let progress = task
            .find("this.notifyProgress();")
            .expect("task exit should report progress");
        assert!(release < progress);
        assert!(task.contains("parentTask.notifyProgress();"));

        let state = render_intrinsic_body(Intrinsic::Component(
            ComponentIntrinsic::ComponentAsyncStateClass,
        ));
        assert!(state.contains("const { task, ...opts } = args;"));
        assert!(state.contains("resume = () => onResume(!thread.isCancelled() && !thread.isRejected() && !this.isTrapped());"));
        assert!(state.contains("suspendedTaskCancellable(taskID)"));
        assert!(state.contains("thread.notifyProgress();"));
        assert!(state.contains("suspendedTaskReady(taskID)"));
        assert!(!state.contains("resumeOneReadyTask()"));
    }

    #[test]
    fn cancellation_cleanup_can_start_host_imports() {
        let lower = render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::LowerImport));
        assert!(lower.contains("subtask.cancellationRequested()"));
        assert!(lower.contains("task.taskState() === AsyncTask.State.CANCEL_PENDING"));
        assert!(!lower.contains("if (task.cancellationRequested())"));
    }

    #[test]
    fn only_callback_event_loop_waits_deliver_cancellation() {
        let waitable_set =
            render_intrinsic_body(Intrinsic::Waitable(WaitableIntrinsic::WaitableSetClass));
        assert!(waitable_set.contains("tryWait(opts)"));
        assert!(waitable_set.contains("waitUntil(opts)"));
        assert!(!waitable_set.contains("async waitUntil(opts)"));
        assert!(waitable_set.contains("if (isReady()) { return finishWait(true); }"));

        let wait = render_intrinsic_body(Intrinsic::Waitable(WaitableIntrinsic::WaitableSetWait));
        assert!(wait.contains("const wset = cstate.handles.get(waitableSetRep);"));
        assert!(!wait.contains("await cstate.handles.get(waitableSetRep);"));
        assert!(wait.contains("cancellable: false"));
        assert!(wait.contains("function waitableSetWait"));
        assert!(!wait.contains("async function waitableSetWait"));
        assert!(wait.contains("syncOnly ? wset.tryWait(waitOpts) : wset.waitUntil(waitOpts)"));
        assert!(wait.contains("return event.then(storeEvent);"));

        let conditional = render_intrinsic_body(Intrinsic::ConditionalSuspending2I32ToI32Fn);
        assert!(conditional.contains("new WebAssembly.Suspending(slow)"));
        assert!(conditional.contains("0x66, 0x61, 0x73, 0x74"));

        let conditional = render_intrinsic_body(Intrinsic::ConditionalSuspending3I32ToI32Fn);
        assert!(conditional.contains("new WebAssembly.Suspending(slow)"));
        assert!(conditional.contains("0x41, 0x7e"));

        let poll = render_intrinsic_body(Intrinsic::Waitable(WaitableIntrinsic::WaitableSetPoll));
        assert!(!poll.contains("deliverPendingCancel"));

        let yield_ = render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::ThreadYield));
        assert!(yield_.contains("if (!task.mayBlock()) {"));
        assert!(yield_.contains(".runTickLoop();"));
        assert!(yield_.contains("return thread.suspend({"));
        assert!(yield_.contains(".then(keepGoing => keepGoing ? 0 : 1)"));
        assert!(!yield_.contains("await "));

        let thread_new =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::ThreadNewIndirect));
        assert!(thread_new.contains("WebAssembly.promising(startFuncRef)"));
        assert!(thread_new.contains("promisingStartFuncRef(context)"));
    }

    #[test]
    fn thread_builtins_share_the_current_thread_prologue() {
        for intrinsic in [
            AsyncTaskIntrinsic::ThreadYield,
            AsyncTaskIntrinsic::ThreadSuspend,
            AsyncTaskIntrinsic::ThreadSuspendThenResume,
            AsyncTaskIntrinsic::ThreadYieldThenResume,
            AsyncTaskIntrinsic::ThreadSuspendThenPromote,
            AsyncTaskIntrinsic::ThreadYieldThenPromote,
            AsyncTaskIntrinsic::ThreadNewIndirect,
        ] {
            let source = render_intrinsic_body(Intrinsic::AsyncTask(intrinsic));
            assert!(
                source.contains("currentThreadOrThrow(componentIdx)"),
                "{intrinsic:?} does not use the shared prologue"
            );
            assert!(!source.contains("invalid/missing async thread meta"));
        }

        // Both switch-to-another-thread families reject a self switch the same way.
        for intrinsic in [
            AsyncTaskIntrinsic::ThreadSuspendThenResume,
            AsyncTaskIntrinsic::ThreadYieldThenPromote,
        ] {
            let source = render_intrinsic_body(Intrinsic::AsyncTask(intrinsic));
            assert!(source.contains("other === thread"), "{intrinsic:?}");
            assert!(!source.contains("i === thread.id()"), "{intrinsic:?}");
        }

        let (source, intrinsics) = render([Intrinsic::AsyncTask(
            AsyncTaskIntrinsic::CurrentThreadOrThrow,
        )]);
        assert!(intrinsics.contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentThread)));
        assert!(source.contains("getCurrentThread(meta.componentIdx, meta.threadID, meta.taskID)"));
    }

    #[test]
    fn current_thread_lookup_rejects_recycled_thread_indices() {
        let source =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentThread));
        assert!(source.contains("function getCurrentThread(componentIdx, threadID, taskID) {"));
        assert!(source.contains(
            "if (taskID !== undefined && thread.taskID() !== taskID) { return undefined; }"
        ));
        assert!(source.contains("if (componentIdx === -1) { return undefined; }"));

        // Every register-driven lookup passes the register's task along.
        for intrinsic in [
            AsyncTaskIntrinsic::ContextGet,
            AsyncTaskIntrinsic::ContextSet,
        ] {
            let source = render_intrinsic_body(Intrinsic::AsyncTask(intrinsic));
            assert_eq!(
                source
                    .matches("getCurrentThread(currentThreadMeta.componentIdx, currentThreadMeta.threadID, currentThreadMeta.taskID)")
                    .count(),
                2,
                "{intrinsic:?}"
            );
        }
        let wrapper = render_intrinsic_body(Intrinsic::SuspendingImportWrapperFn);
        assert!(
            wrapper.contains("getCurrentThread(saved.componentIdx, saved.threadID, saved.taskID)")
        );
    }

    #[test]
    fn thread_suspension_settles_completion_and_delivers_cancellation() {
        let thread =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncThreadClass));
        let suspend_start = thread.find("async suspend(opts) {").unwrap();
        let suspend_end = thread.find("start() {").unwrap();
        let suspend = &thread[suspend_start..suspend_end];
        assert!(suspend.contains("task.settleCompletion();"));
        assert!(
            suspend.contains("if (task.deliverPendingCancel({ cancellable })) { return false; }")
        );
        assert!(
            suspend.contains(
                "readyFn: () => (cancellable && task.cancellationPending()) || readyFn(),"
            )
        );
        assert!(suspend.contains(
            "if (keepGoing && task.deliverPendingCancel({ cancellable })) { return false; }"
        ));

        let task = render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass));
        assert!(task.contains(
            "cancellationPending() { return this.#state === AsyncTask.State.CANCEL_PENDING; }"
        ));
    }

    #[test]
    fn spawned_thread_traps_are_recorded_against_the_instance() {
        let (source, intrinsics) =
            render([Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncThreadClass)]);
        assert!(intrinsics.contains(&Intrinsic::Component(ComponentIntrinsic::RecordTrap)));
        let record_trap = Intrinsic::Component(ComponentIntrinsic::RecordTrap).name();
        let recorded = source
            .find(&format!("err = {record_trap}(this.#componentIdx, err);"))
            .expect("spawned thread errors are recorded as traps");
        let rejected = source
            .find("this.#task.reject(err);")
            .expect("spawned thread errors reject the owning task");
        assert!(
            recorded < rejected,
            "the trap is recorded before the task is rejected"
        );
    }

    #[test]
    fn host_tasks_do_not_materialise_component_async_state() {
        let task = render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass));
        assert!(task.contains("thread.setId(++AsyncTask._HOST_THREAD_ID);"));

        let remove_start = task.find("removeThread(thread) {").unwrap();
        let remove_end = task.find("defaultThread() {").unwrap();
        assert!(task[remove_start..remove_end].contains("if (this.#componentIdx !== -1) {"));

        let exit_start = task.find("exit(args) {").unwrap();
        let exit_end = task.find("needsExclusiveLock() {").unwrap();
        let exit = &task[exit_start..exit_end];
        assert!(exit.contains("const state = this.#componentIdx === -1"));
        assert!(exit.contains("if (state) { state.exclusiveRelease(this.#id); }"));

        let lookup =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentThread));
        assert!(lookup.contains("if (componentIdx === -1) { return undefined; }"));
    }

    #[test]
    fn suspended_threads_are_queued_in_the_map_alone() {
        let state = render_intrinsic_body(Intrinsic::Component(
            ComponentIntrinsic::ComponentAsyncStateClass,
        ));
        assert!(!state.contains("#suspendedThreadRefs"));
        assert!(state.contains("for (const [thread, meta] of this.#suspendedThreadsByRef) {"));
        assert!(state.contains("const idle = this.#suspendedThreadsByRef.size > 0;"));
    }

    #[test]
    fn thread_handle_builtins_trap_on_unknown_indices() {
        let resume_later =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::ThreadResumeLater));
        assert!(resume_later.contains(
            "throw new WebAssemblyRuntimeError(`unknown handle index ${threadHandle}`);"
        ));
        assert!(!resume_later.contains("throw new Error(`invalid/missing thread"));

        let new_indirect =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::ThreadNewIndirect));
        assert!(new_indirect.contains("if (tableIdx >= table.length) {"));
        assert!(new_indirect.contains(
            "throw new WebAssemblyRuntimeError('thread.new-indirect: table index out of bounds');"
        ));
    }

    #[test]
    fn thread_scheduler_distinguishes_suspended_and_ready_targets() {
        let state = render_intrinsic_body(Intrinsic::Component(
            ComponentIntrinsic::ComponentAsyncStateClass,
        ));
        assert!(state.contains("meta.suspended = false;"));
        assert!(
            state.contains("return this.#suspendedThreadsByRef.get(thread)?.suspended ?? false;")
        );
        assert!(state.contains("isThreadReady(thread)"));

        let promote = render_intrinsic_body(Intrinsic::AsyncTask(
            AsyncTaskIntrinsic::ThreadYieldThenPromote,
        ));
        assert!(promote.contains("cstate.isThreadReady(other)"));
        assert!(promote.contains("cstate.resumeThread(other);"));
    }

    #[test]
    fn async_scheduler_detects_store_wide_deadlocks() {
        let state = render_intrinsic_body(Intrinsic::Component(
            ComponentIntrinsic::ComponentAsyncStateClass,
        ));
        assert!(state.contains("_checkForDeadlock();"));
        assert!(state.contains("suspendedTaskMetas()"));
        assert!(state.contains("hasPendingSchedulerWork()"));

        let check =
            render_intrinsic_body(Intrinsic::Component(ComponentIntrinsic::CheckForDeadlock));
        assert!(check.contains("for (const state of ASYNC_STATE.values())"));
        assert!(check.contains("STORE_ASYNC_STATE.pendingHostOperations > 0"));
        assert!(check.contains("const root = task.getRootTask();"));
        assert!(check.contains(
            "new WebAssemblyRuntimeError('wasm trap: deadlock detected: event loop cannot make further progress')"
        ));
        assert!(check.contains("for (const root of unresolvedRoots)"));
        assert!(check.contains("root.reject(err);"));
        assert!(check.contains("task.reject(err);"));
    }

    #[test]
    fn detected_deadlocks_carry_the_state_that_produced_them() {
        let check =
            render_intrinsic_body(Intrinsic::Component(ComponentIntrinsic::CheckForDeadlock));

        // The message is what the Canonical ABI asks for and is asserted on elsewhere, so
        // the state that produced the deadlock rides beside it rather than inside it.
        assert!(check.contains("err.deadlockDetail = {"));
        assert!(check.contains("pendingHostOperations: STORE_ASYNC_STATE.pendingHostOperations,"));
        assert!(check.contains("taskID: task.id(),"));
        assert!(check.contains("componentIdx: task.componentIdx(),"));
        assert!(check.contains("state: task.taskState(),"));
        assert!(check.contains("rootTaskID: task.getRootTask().id(),"));
        assert!(check.contains("unresolvedRootTaskIDs:"));
    }

    #[test]
    fn deferred_stream_cancel_is_tracked_as_host_work() {
        // A guest cancelling a read on a host-lowered stream is suspended until the
        // deferred cancel completion runs. Counting that deferral like a host operation
        // keeps an already-scheduled deadlock check from reporting the wait.
        for intrinsic in [
            AsyncStreamIntrinsic::StreamReadableEndClass,
            AsyncStreamIntrinsic::StreamWritableEndClass,
        ] {
            let end = render_intrinsic_body(Intrinsic::AsyncStream(intrinsic));
            assert!(end.contains("_trackHostOperation(() => new Promise((resolve) => {"));
            assert!(end.contains("try { completeCancel(); } finally { resolve(); }"));
            assert!(!end.contains("setTimeout(completeCancel, 0);"));
        }
    }

    #[test]
    fn injected_stream_writes_reset_the_write_end_before_writing() {
        // Back-to-back guest reads can outrun the lazy consumption of the previous
        // injected write's completion event; the next write must not start while
        // that stale event still marks the write end as copying.
        let inject = render_intrinsic_body(Intrinsic::AsyncStream(
            AsyncStreamIntrinsic::GenStreamHostInjectFn,
        ));
        let write_values = inject
            .find("const writeValues = async (writeValues, dropAfterCopy = false) => {")
            .expect("writeValues helper");
        let write_values_body = &inject[write_values..];
        let reset = write_values_body
            .find("resetWriteEndToIdleFn();")
            .expect("reset before injected write");
        let write = write_values_body
            .find("hostWriteEnd.writeMany(writeValues, { dropAfterCopy });")
            .expect("injected write");
        assert!(reset < write);

        let cancel = inject
            .find("readEnd.setHostCancelFn?.(() => {")
            .expect("host cancel fn");
        let cancel_body = &inject[cancel..];
        let reset = cancel_body
            .find("resetWriteEndToIdleFn();")
            .expect("reset before cancel write");
        let write = cancel_body
            .find("hostWriteEnd.writeMany(cancelValues);")
            .expect("cancel write");
        assert!(reset < write);
    }

    #[test]
    fn host_async_operations_suppress_deadlock_detection() {
        let tracker =
            render_intrinsic_body(Intrinsic::Component(ComponentIntrinsic::TrackHostOperation));
        assert!(tracker.contains("STORE_ASYNC_STATE.pendingHostOperations++;"));
        assert!(tracker.contains("Promise.resolve(result).finally(() =>"));
        assert!(tracker.contains("STORE_ASYNC_STATE.pendingHostOperations--;"));
        assert!(tracker.contains("_checkForDeadlock();"));

        let future = render_intrinsic_body(Intrinsic::AsyncFuture(
            AsyncFutureIntrinsic::GenFutureHostInjectFn,
        ));
        assert!(future.contains("await _trackHostOperation(() => promise);"));

        let stream = render_intrinsic_body(Intrinsic::AsyncStream(
            AsyncStreamIntrinsic::PendingValueQueueClass,
        ));
        assert!(stream.contains("await _trackHostOperation(() => this.#readFn());"));
    }

    #[test]
    fn native_core_traps_are_canonicalized_before_poisoning() {
        let normalizer =
            render_intrinsic_body(Intrinsic::Component(ComponentIntrinsic::NormalizeCoreTrap));
        let state = render_intrinsic_body(Intrinsic::Component(
            ComponentIntrinsic::ComponentAsyncStateClass,
        ));

        assert!(
            normalizer.contains(
                r#"['unreachable', "wasm trap: wasm `unreachable` instruction executed"]"#
            )
        );
        assert!(normalizer.contains("['divide by zero', \"wasm trap: integer divide by zero\"]"));
        assert!(state.contains("err = _normalizeCoreTrap(err);"));
    }

    #[test]
    fn traps_lock_down_only_the_current_component_instance() {
        let state = render_intrinsic_body(Intrinsic::Component(
            ComponentIntrinsic::ComponentAsyncStateClass,
        ));

        assert!(state.contains("#trapped = false;"));
        assert!(state.contains("this.#trapped = true;"));
        assert!(state.contains(
            r#"throw new WebAssemblyRuntimeError("wasm trap: cannot enter component instance");"#
        ));
        assert!(!state.contains("if (STORE_TRAP.error !== null) { throw STORE_TRAP.error; }"));
    }

    #[test]
    fn sync_start_fused_adapter_runs_in_the_caller_task() {
        let source = render_intrinsic_body(Intrinsic::Host(HostIntrinsic::SyncStartCall));

        assert!(source.contains("const callerTask = subtask.getParentTask();"));
        assert!(source.contains("taskID: callerTask.id(),"));
        assert!(source.contains("threadID: subtaskCallMeta.callerThreadID,"));
        assert!(source.contains("componentIdx: callerTask.componentIdx(),"));
        assert!(source.contains(
            "fn: () => subtaskCallMeta.returnFn.apply(null, [subtaskCallMeta.resultPtr]),"
        ));
        assert!(source.contains("preparedTask.registerOnResolveHandler(() => {"));
        assert!(source.contains("const calleeLifecyclePromise = (async () => {"));
        assert!(source.contains("await _driverLoop({"));
        assert!(source.contains("await Promise.race(["));
        assert!(source.contains("calleeLifecyclePromise.then(() => taskReturnPromise),"));
        assert!(source.contains("calleeComponentState.markTrapped(err);"));
        assert!(source.contains("preparedTask.exit({ skipExclusiveLockCheck: true });"));
    }

    #[test]
    fn sync_prepare_call_rejects_blocking_from_core_start() {
        let source = render_intrinsic_body(Intrinsic::Host(HostIntrinsic::PrepareCall));

        assert!(source.contains(
            "const currentCallerThreadMeta = _getGlobalCurrentThreadMeta(callerComponentIdx);"
        ));
        assert!(source.contains("const currentCallerTaskMeta = currentCallerThreadMeta &&"));
        assert!(!source.contains("missing current caller thread metadata during prepare call"));
        assert!(source.contains("const callerThreadID = currentCallerThreadMeta.threadID;"));
        assert!(source.contains("callerThreadID,"));
        assert!(source.contains("if (!isAsync && CURRENT_TASK_MAY_BLOCK.value === 0) {"));
        assert!(source.contains(
            "new WebAssemblyRuntimeError('cannot block a synchronous task before returning')"
        ));
        assert!(source.contains(
            "throw new Error('invalid/missing current task for caller during prepare call');"
        ));
    }

    #[test]
    fn symmetric_guest_calls_switch_task_may_block_state() {
        let enter = render_intrinsic_body(Intrinsic::AsyncTask(
            AsyncTaskIntrinsic::EnterSymmetricSyncGuestCall,
        ));
        assert!(!enter.contains("symmetric sync guest->guest call should not be async"));
        assert!(enter.contains("isAsync: false,"));
        assert!(enter.contains("isAsync: !!calleeIsAsync,"));
        assert!(enter.contains("isManualAsync: callerTask.isManualAsync(),"));
        assert!(enter.contains("syncOnly && calleeIsAsync && cstate.isExclusivelyLocked()"));
        assert!(enter.contains("callingWasmExport: !!calleeIsAsync,"));
        assert!(enter.contains("return 0;"));
        assert!(enter.contains("return 1;"));
        assert!(enter.contains("const callerThreadID = callerThreadMeta.threadID;"));
        assert!(enter.contains("callerThreadID,"));
        assert!(enter.contains("previousTaskMayBlock: CURRENT_TASK_MAY_BLOCK.value,"));
        assert!(enter.contains("CURRENT_TASK_MAY_BLOCK.value = newTask.mayBlock() ? 1 : 0;"));

        let exit = render_intrinsic_body(Intrinsic::AsyncTask(
            AsyncTaskIntrinsic::ExitSymmetricSyncGuestCall,
        ));
        assert!(
            exit.contains("const { componentIdx, threadID, callerThreadID, previousTaskMayBlock }")
        );
        assert!(exit.contains("CURRENT_TASK_MAY_BLOCK.value = previousTaskMayBlock;"));
        assert!(exit.contains("threadID: callerThreadID,"));
    }

    #[test]
    fn resource_transfer_borrow_lends_without_consuming_source() {
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
        assert!(!source.contains("_jcoRuntimeProvider"));
        assert!(!source.contains("function rscTableRemove(table, handle)"));
        assert!(source.contains("const { rep, own } = rscTableGet(fromTable, handle);"));
        assert!(!source.contains("if (!own) rscTableRemove(fromTable, handle);"));
        assert!(source.contains("fromTable[handle << 1]++;"));
        assert!(source.contains("borrowTask.addResourceLender(fromTable, handle);"));
        assert!(source.contains("borrowTask?.resourceScopeId() ?? SCOPE_ID"));
        assert!(source.contains("borrowTask.addBorrowedHandle();"));
    }

    #[test]
    fn resource_drop_updates_the_borrowing_task_scope() {
        let source =
            render_intrinsic_body(Intrinsic::Resource(ResourceIntrinsic::ResourceTableRemove));

        assert!(
            source
                .contains("const borrowTask = own ? undefined : RESOURCE_SCOPE_TASKS.get(scope);")
        );
        assert!(source.contains("borrowTask?.removeBorrowedHandle();"));
        assert!(source.contains(
            "throw new WebAssemblyRuntimeError('cannot remove owned resource while borrowed');"
        ));
    }

    #[test]
    fn tasks_validate_and_release_their_resource_scope() {
        let source =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass));

        assert!(source.contains("this.#resourceScopeId = ++RESOURCE_SCOPE_ID;"));
        assert!(source.contains("RESOURCE_SCOPE_TASKS.set(this.#resourceScopeId, this);"));
        assert!(source.contains("addBorrowedHandle()"));
        assert!(source.contains("removeBorrowedHandle()"));
        assert!(source.contains("addResourceLender(table, handle)"));
        assert!(source.contains(
            "throw new WebAssemblyRuntimeError('borrow handles still remain at the end of the call');"
        ));
        assert!(source.contains("table[idx] = lendCount - 1;"));
        assert!(source.contains("RESOURCE_SCOPE_TASKS.delete(this.#resourceScopeId);"));
    }

    #[test]
    fn task_metadata_lives_until_remaining_threads_exit() {
        let task = render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass));
        assert!(task.contains("if (this.#exited && this.#threads.length === 0)"));
        assert!(task.contains("this.removeThread(this.defaultThread());"));
        assert!(task.contains("threadID: this.defaultThread().id(),"));

        let clear =
            render_intrinsic_body(Intrinsic::AsyncTask(AsyncTaskIntrinsic::ClearCurrentThread));
        assert!(clear.contains("taskID, opts = {}"));
        assert!(clear.contains("if (!opts.preserveTask)"));

        let clear_meta = render_intrinsic_body(Intrinsic::ClearGlobalCurrentThreadMetaFn);
        assert!(clear_meta.contains("if (args.threadID === undefined)"));
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
    fn future_writer_preserves_component_identity_when_blocked() {
        let writer = render_intrinsic_body(Intrinsic::AsyncFuture(
            AsyncFutureIntrinsic::FutureWritableEndClass,
        ));
        let pending_meta = writer
            .split_once("this.setPendingBufferMeta({")
            .and_then(|(_, rest)| rest.split_once("});"))
            .map(|(args, _)| args)
            .expect("writer should save a blocked operation");
        assert!(pending_meta.contains("componentIdx,"));
    }

    #[test]
    fn future_ends_use_canonical_intra_component_copy_trap() {
        let error = "throw new WebAssemblyRuntimeError('cannot read from and write to intra-component future');";

        for end in [
            AsyncFutureIntrinsic::FutureReadableEndClass,
            AsyncFutureIntrinsic::FutureWritableEndClass,
        ] {
            let source = render_intrinsic_body(Intrinsic::AsyncFuture(end));
            assert!(source.contains(error));
            assert!(source.contains("componentIdx === meta.componentIdx"));
        }
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
            assert!(source.contains("syncFastOnly"));
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
            assert!(source.contains("if (deferSyncFinish) { await Promise.resolve(); }"));
        }
    }

    #[test]
    fn stream_drop_rejects_busy_ends_before_table_removal() {
        for (intrinsic, error) in [
            (
                AsyncStreamIntrinsic::StreamDropReadable,
                "cannot remove busy stream",
            ),
            (
                AsyncStreamIntrinsic::StreamDropWritable,
                "cannot drop busy stream",
            ),
        ] {
            let source = render_intrinsic_body(Intrinsic::AsyncStream(intrinsic));
            let busy_check = source
                .find("if (streamEnd.isCopying()) {")
                .expect("stream drop should reject an active copy");
            let removal = source
                .find("const removedStreamEnd = deleteStreamEnd(")
                .expect("stream drop should remove a validated idle end");

            assert!(source.contains(&format!("throw new WebAssemblyRuntimeError('{error}');")));
            assert!(busy_check < removal, "busy validation must precede removal");
            assert!(!source.contains("streamEnd.isCopying() || streamEnd.hasPendingEvent()"));
            assert!(source.contains("if (removedStreamEnd !== streamEnd) {"));
        }
    }

    #[test]
    fn future_and_stream_terminal_states_use_canonical_traps() {
        for (intrinsic, message) in [
            (
                Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureWrite),
                "cannot write to future after previous write succeeded or readable end dropped",
            ),
            (
                Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureRead),
                "cannot read from future after previous read succeeded",
            ),
            (
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamWrite),
                "cannot write to stream after being notified that the readable end dropped",
            ),
            (
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamRead),
                "cannot read from stream after being notified that the writable end dropped",
            ),
        ] {
            let source = render_intrinsic_body(intrinsic);
            assert!(
                source.contains("if (futureEnd.isDoneState()) {")
                    || source.contains("if (streamEnd.isDoneState()) {")
            );
            assert!(source.contains(message));
            assert!(source.contains("throw new WebAssemblyRuntimeError(message);"));
        }

        for (intrinsic, get, remove, message) in [
            (
                Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureTransfer),
                "const futureEnd = getFutureEnd(",
                "const removedFutureEnd = removeFutureEndFromTable(",
                "cannot lift future after previous read succeeded",
            ),
            (
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamTransfer),
                "const streamEnd = getStreamEnd(",
                "const removedStreamEnd = removeStreamEndFromTable(",
                "cannot lift stream after being notified that the writable end dropped",
            ),
        ] {
            let source = render_intrinsic_body(intrinsic);
            let get = source.find(get).expect("terminal validation lookup");
            let remove = source.find(remove).expect("validated endpoint removal");
            assert!(get < remove);
            assert!(source.contains(message));
        }

        for (intrinsic, message) in [
            (
                Intrinsic::AsyncFuture(AsyncFutureIntrinsic::HostFutureClass),
                "cannot lift future after previous read succeeded",
            ),
            (
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::HostStreamClass),
                "cannot lift stream after being notified that the writable end dropped",
            ),
            (
                Intrinsic::Lift(LiftIntrinsic::LiftFlatFuture),
                "cannot lift future after previous read succeeded",
            ),
            (
                Intrinsic::Lift(LiftIntrinsic::LiftFlatStream),
                "cannot lift stream after being notified that the writable end dropped",
            ),
        ] {
            let source = render_intrinsic_body(intrinsic);
            assert!(source.contains("End.isDoneState()) {"));
            assert!(source.contains(message));
        }
    }

    #[test]
    fn future_and_stream_waitable_membership_traps_before_transfer() {
        for (intrinsic, check, remove, message) in [
            (
                Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureTransfer),
                "if (futureEnd.isInSet()) {",
                "const removedFutureEnd = removeFutureEndFromTable(",
                "cannot lift future while it's in a waitable set",
            ),
            (
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamTransfer),
                "if (streamEnd.isInSet()) {",
                "const removedStreamEnd = removeStreamEndFromTable(",
                "cannot lift stream while it's in a waitable set",
            ),
        ] {
            let source = render_intrinsic_body(intrinsic);
            let check = source.find(check).expect("waitable membership check");
            let remove = source.find(remove).expect("endpoint table removal");

            assert!(check < remove, "membership validation must precede removal");
            assert!(source.contains(&format!(
                "throw new WebAssemblyRuntimeError(\"{message}\");"
            )));
        }

        for (intrinsic, message) in [
            (
                Intrinsic::AsyncFuture(AsyncFutureIntrinsic::HostFutureClass),
                "cannot lift future while it's in a waitable set",
            ),
            (
                Intrinsic::AsyncStream(AsyncStreamIntrinsic::HostStreamClass),
                "cannot lift stream while it's in a waitable set",
            ),
            (
                Intrinsic::Lift(LiftIntrinsic::LiftFlatFuture),
                "cannot lift future while it's in a waitable set",
            ),
            (
                Intrinsic::Lift(LiftIntrinsic::LiftFlatStream),
                "cannot lift stream while it's in a waitable set",
            ),
        ] {
            let source = render_intrinsic_body(intrinsic);
            assert!(source.contains(&format!("\"{message}\"")));
            assert!(!source.contains("in waitable sets cannot be lifted"));
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
        intrinsic
            .binding(self.transpile_opts.cm_runtime_es_module.is_some())
            .local_name()
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
        if matches!(
            intrinsic.binding(args.transpile_opts.cm_runtime_es_module.is_some()),
            IntrinsicBinding::Inline { .. }
        ) {
            intrinsic.render(&mut source, args);
        }
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
    if uses_external_runtime(
        args.intrinsics,
        args.transpile_opts.cm_runtime_es_module.is_some(),
    ) {
        uwriteln!(
            output,
            r#"
                if (typeof {CM_RUNTIME_PROVIDER_LOCAL_NAME}?.create !== 'function') {{
                    throw new TypeError('Jco Component Model runtime provider must define create(options)');
                }}
                if ({CM_RUNTIME_PROVIDER_LOCAL_NAME}.apiVersion !== {CM_RUNTIME_API_VERSION}) {{
                    throw new Error(`incompatible Jco JavaScript Component Model runtime API: requested {CM_RUNTIME_API_VERSION}, supported ${{{CM_RUNTIME_PROVIDER_LOCAL_NAME}.apiVersion}}`);
                }}
                const {CM_RUNTIME_LOCAL_NAME} = {CM_RUNTIME_PROVIDER_LOCAL_NAME}.create({{
                    requestedApiVersion: {CM_RUNTIME_API_VERSION},
                    strict: {strict},
                    flagsAsBigInt: {flags_as_bigint},
                    nodejsCompat: {nodejs_compat},
                    asyncDeterminism: '{determinism}',
                    platform: {{ WebAssembly }},
                }});
                if ({CM_RUNTIME_LOCAL_NAME}?.apiVersion !== {CM_RUNTIME_API_VERSION}) {{
                    throw new Error(`incompatible Jco JavaScript Component Model runtime API instance: requested {CM_RUNTIME_API_VERSION}, received ${{{CM_RUNTIME_LOCAL_NAME}?.apiVersion}}`);
                }}
                const {CM_RUNTIME_INTRINSICS_LOCAL_NAME} = {CM_RUNTIME_LOCAL_NAME}.intrinsics;
            "#,
            strict = args.transpile_opts.strict,
            flags_as_bigint = args.transpile_opts.flags_as_bigint,
            nodejs_compat = !args.transpile_opts.nodejs_compat_disabled,
            determinism = args.determinism_profile,
        );

        for intrinsic in args.intrinsics.iter() {
            let IntrinsicBinding::Runtime { local_name, path } =
                intrinsic.binding(args.transpile_opts.cm_runtime_es_module.is_some())
            else {
                continue;
            };
            let (receiver_path, method) = path
                .rsplit_once('.')
                .expect("runtime intrinsic paths must name a method on a receiver");
            output.push_str(&format!(
                r#"
                    const {local_name} = (() => {{
                        const receiver = {CM_RUNTIME_INTRINSICS_LOCAL_NAME}?.{receiver_path};
                        const intrinsic = receiver?.{method};
                        if (typeof intrinsic !== 'function') {{
                            throw new TypeError('Jco Component Model runtime intrinsic {path} must be a function');
                        }}
                        return intrinsic.bind(receiver);
                    }})();
                "#
            ));
        }
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

const CONDITIONAL_SUSPENDING_1_I32_TO_I32: &[u8] = &[
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x06, 0x01, 0x60, 0x01, 0x7f, 0x01, 0x7f,
    0x02, 0x11, 0x02, 0x00, 0x04, 0x66, 0x61, 0x73, 0x74, 0x00, 0x00, 0x00, 0x04, 0x73, 0x6c, 0x6f,
    0x77, 0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x02,
    0x0a, 0x19, 0x01, 0x17, 0x01, 0x01, 0x7f, 0x20, 0x00, 0x10, 0x00, 0x22, 0x01, 0x41, 0x7e, 0x47,
    0x04, 0x7f, 0x20, 0x01, 0x05, 0x20, 0x00, 0x10, 0x01, 0x0b, 0x0b,
];

const CONDITIONAL_SUSPENDING_2_I32_TO_I32: &[u8] = &[
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01,
    0x7f, 0x02, 0x11, 0x02, 0x00, 0x04, 0x66, 0x61, 0x73, 0x74, 0x00, 0x00, 0x00, 0x04, 0x73, 0x6c,
    0x6f, 0x77, 0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00,
    0x02, 0x0a, 0x1d, 0x01, 0x1b, 0x01, 0x01, 0x7f, 0x20, 0x00, 0x20, 0x01, 0x10, 0x00, 0x22, 0x02,
    0x41, 0x7f, 0x47, 0x04, 0x7f, 0x20, 0x02, 0x05, 0x20, 0x00, 0x20, 0x01, 0x10, 0x01, 0x0b, 0x0b,
];

const CONDITIONAL_SUSPENDING_3_I32_TO_I32: &[u8] = &[
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x01, 0x60, 0x03, 0x7f, 0x7f, 0x7f,
    0x01, 0x7f, 0x02, 0x11, 0x02, 0x00, 0x04, 0x66, 0x61, 0x73, 0x74, 0x00, 0x00, 0x00, 0x04, 0x73,
    0x6c, 0x6f, 0x77, 0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e,
    0x00, 0x02, 0x0a, 0x21, 0x01, 0x1f, 0x01, 0x01, 0x7f, 0x20, 0x00, 0x20, 0x01, 0x20, 0x02, 0x10,
    0x00, 0x22, 0x03, 0x41, 0x7e, 0x47, 0x04, 0x7f, 0x20, 0x03, 0x05, 0x20, 0x00, 0x20, 0x01, 0x20,
    0x02, 0x10, 0x01, 0x0b, 0x0b,
];

const CONDITIONAL_SUSPENDING_3_I32_TO_VOID: &[u8] = &[
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x0e, 0x02, 0x60, 0x03, 0x7f, 0x7f, 0x7f,
    0x01, 0x7f, 0x60, 0x03, 0x7f, 0x7f, 0x7f, 0x00, 0x02, 0x11, 0x02, 0x00, 0x04, 0x66, 0x61, 0x73,
    0x74, 0x00, 0x00, 0x00, 0x04, 0x73, 0x6c, 0x6f, 0x77, 0x00, 0x00, 0x03, 0x02, 0x01, 0x01, 0x07,
    0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x02, 0x0a, 0x19, 0x01, 0x17, 0x00, 0x20, 0x00, 0x20,
    0x01, 0x20, 0x02, 0x10, 0x00, 0x45, 0x04, 0x40, 0x20, 0x00, 0x20, 0x01, 0x20, 0x02, 0x10, 0x01,
    0x1a, 0x0b, 0x0b,
];

impl Intrinsic {
    pub(crate) fn binding(&self, external_runtime: bool) -> IntrinsicBinding {
        match self {
            Self::Resource(ResourceIntrinsic::ResourceTableGet) if external_runtime => {
                IntrinsicBinding::Runtime {
                    local_name: self.name(),
                    path: "resource.tableGet",
                }
            }
            _ => IntrinsicBinding::Inline {
                local_name: self.name(),
            },
        }
    }

    pub(crate) fn is_runtime_provided(&self, external_runtime: bool) -> bool {
        matches!(
            self.binding(external_runtime),
            IntrinsicBinding::Runtime { .. }
        )
    }

    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        // Every intrinsic is bound in the generated module's scope, so each
        // name is reserved against the local names of exports and imports (an
        // export named `stream-read` must not become a local `streamRead` that
        // shadows the intrinsic the trampolines call).
        JsHelperIntrinsic::get_global_names()
            .into_iter()
            .chain(ConversionIntrinsic::get_global_names())
            .chain(WebIdlIntrinsic::get_global_names())
            .chain(StringIntrinsic::get_global_names())
            .chain(ResourceIntrinsic::get_global_names())
            .chain(LiftIntrinsic::get_global_names())
            .chain(LowerIntrinsic::get_global_names())
            .chain(ComponentIntrinsic::get_global_names())
            .chain(AsyncFutureIntrinsic::get_global_names())
            .chain(AsyncStreamIntrinsic::get_global_names())
            .chain(AsyncTaskIntrinsic::get_global_names())
            .chain(ErrCtxIntrinsic::get_global_names())
            .chain(p3::host::HostIntrinsic::get_global_names())
            .chain(p3::waitable::WaitableIntrinsic::get_global_names())
            .chain(vec![
                // Intrinsic list exactly as below
                "base64Compile",
                "clampGuest",
                "ComponentError",
                "CONDITIONAL_SUSPENDING_WASM",
                "WebAssemblyRuntimeError",
                "FACT_TRAP_MESSAGES",
                "fetchCompile",
                "finalizationRegistryCreate",
                "getErrorPayload",
                "HANDLE_TABLES",
                "hasOwnProperty",
                "imports",
                "instantiateCore",
                "isLE",
                CM_RUNTIME_PROVIDER_LOCAL_NAME,
                CM_RUNTIME_LOCAL_NAME,
                CM_RUNTIME_INTRINSICS_LOCAL_NAME,
                "scopeId",
                "symbolCabiDispose",
                "symbolCabiLower",
                "symbolDispose",
                "symbolAsyncIterator",
                "symbolIterator",
                "symbolRscHandle",
                "symbolRscRep",
                "T_FLAG",
                "T_OWN",
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
                "Promise",
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
            Intrinsic::FactTrapMessages => "FACT_TRAP_MESSAGES",
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
            Intrinsic::DisposeHostValue => "_disposeHostValue",
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
            Self::GlobalCurrentThreadMeta => "CURRENT_TASK_META",
            Self::GetGlobalCurrentThreadMetaFn => "_getGlobalCurrentThreadMeta",
            Self::SetGlobalCurrentThreadMetaFn => "_setGlobalCurrentThreadMeta",
            Self::WithGlobalCurrentThreadMetaFn => "_withGlobalCurrentThreadMeta",
            Self::WithGlobalCurrentThreadMetaFnAsync => "_withGlobalCurrentThreadMetaAsync",
            Self::MaybeSyncGeneratorFn => "_maybeSyncGenerator",
            Self::ClearGlobalCurrentThreadMetaFn => "_clearCurrentTask",
            Self::SuspendingImportWrapperFn => "_suspendingImport",
            Self::ConditionalSuspending1I32ToI32Fn => "_conditionalSuspending1I32ToI32",
            Self::ConditionalSuspending2I32ToI32Fn => "_conditionalSuspending2I32ToI32",
            Self::ConditionalSuspending3I32ToI32Fn => "_conditionalSuspending3I32ToI32",
            Self::ConditionalSuspending3I32ToVoidFn => "_conditionalSuspending3I32ToVoid",
            Self::ConditionalSuspendingWasm => "CONDITIONAL_SUSPENDING_WASM",

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

    /// File name suffix and Wasm of a conditional-suspending trampoline
    pub(crate) fn conditional_suspending_wasm(&self) -> Option<(&'static str, &'static [u8])> {
        match self {
            Self::ConditionalSuspending1I32ToI32Fn => Some((
                "conditional-suspending-1-i32-to-i32",
                CONDITIONAL_SUSPENDING_1_I32_TO_I32,
            )),
            Self::ConditionalSuspending2I32ToI32Fn => Some((
                "conditional-suspending-2-i32-to-i32",
                CONDITIONAL_SUSPENDING_2_I32_TO_I32,
            )),
            Self::ConditionalSuspending3I32ToI32Fn => Some((
                "conditional-suspending-3-i32-to-i32",
                CONDITIONAL_SUSPENDING_3_I32_TO_I32,
            )),
            Self::ConditionalSuspending3I32ToVoidFn => Some((
                "conditional-suspending-3-i32-to-void",
                CONDITIONAL_SUSPENDING_3_I32_TO_VOID,
            )),
            _ => None,
        }
    }

    /// JS expression compiling the trampoline Wasm at runtime
    pub(crate) fn compile_conditional_suspending_js(&self) -> String {
        let (_, wasm) = self
            .conditional_suspending_wasm()
            .expect("only conditional-suspending intrinsics have Wasm");
        let bytes = wasm
            .iter()
            .map(|b| format!("0x{b:02x}"))
            .collect::<Vec<_>>()
            .join(", ");
        format!("new WebAssembly.Module(new Uint8Array([{bytes}]))")
    }

    /// JS registering the trampoline Wasm, unless it is emitted as a file
    fn register_conditional_suspending_js(&self, args: &RenderIntrinsicsArgs) -> String {
        if args.transpile_opts.loads_conditional_suspending_wasm() {
            return String::new();
        }
        format!(
            "{}.{} = {};",
            Self::ConditionalSuspendingWasm.name(),
            self.name(),
            self.compile_conditional_suspending_js()
        )
    }
}

pub(crate) fn uses_external_runtime(
    intrinsics: &BTreeSet<Intrinsic>,
    external_runtime: bool,
) -> bool {
    intrinsics
        .iter()
        .any(|intrinsic| intrinsic.is_runtime_provided(external_runtime))
}
