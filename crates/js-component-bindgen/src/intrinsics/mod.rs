//! Intrinsics used from JS

use std::collections::{BTreeSet, HashSet};
use std::fmt::Write;

use crate::source::Source;
use crate::{uwrite, uwriteln};

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

    /// Class that wraps `Promise`s and other things that can be awaited so that we can
    /// keep track of whether resolutions have happened
    AwaitableClass,

    /// Event codes used for async, as a JS enum
    AsyncEventCodeEnum,

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

    /// Async lower functions that are saved by component instance
    GlobalComponentAsyncLowersClass,

    /// Param lowering functions saved by a component instance, interface and function
    ///
    /// This lookup is keyed by a combination of the component instance, interface
    /// and generated JS function name where the lowering should be performed.
    GlobalAsyncParamLowersClass,

    /// Tracking of component memories
    GlobalComponentMemoriesClass,
}

impl Intrinsic {
    pub fn render(&self, output: &mut Source, args: &RenderIntrinsicsArgs) {
        match self {
            Intrinsic::JsHelper(i) => i.render(output),
            Intrinsic::Conversion(i) => i.render(output),
            Intrinsic::String(i) => i.render(output),
            Intrinsic::ErrCtx(i) => i.render(output),
            Intrinsic::Resource(i) => i.render(output),
            Intrinsic::AsyncTask(i) => i.render(output),
            Intrinsic::Waitable(i) => i.render(output, args),
            Intrinsic::Lift(i) => i.render(output),
            Intrinsic::Lower(i) => i.render(output),
            Intrinsic::AsyncStream(i) => i.render(output),
            Intrinsic::AsyncFuture(i) => i.render(output),
            Intrinsic::Component(i) => i.render(output),
            Intrinsic::Host(i) => i.render(output),

            Intrinsic::GlobalAsyncDeterminism => {
                output.push_str(&format!(
                    "const {var_name} = '{determinism}';\n",
                    var_name = self.name(),
                    determinism = args.determinism,
                ));
            }

            Intrinsic::CoinFlip => {
                output.push_str(&format!(
                    "const {var_name} = () => {{ return Math.random() > 0.5; }};\n",
                    var_name = self.name(),
                ));
            }

            Intrinsic::AwaitableClass => {
                output.push_str(&format!(
                    "
                    class {class_name} {{
                        static _ID = 0n;

                        #id;
                        #promise;
                        #resolved = false;

                        constructor(promise) {{
                            if (!promise) {{
                                throw new TypeError('Awaitable must have an interior promise');
                            }}

                            if (!('then' in promise) || typeof promise.then !== 'function') {{
                                throw new Error('missing/invalid promise');
                            }}
                            promise.then(() => this.#resolved  = true);
                            this.#promise = promise;
                            this.#id = ++{class_name}._ID;
                        }}

                        id() {{ return this.#id; }}

                        resolved() {{ return this.#resolved; }}

                        then() {{ return this.#promise.then(...arguments); }}
                    }}
                ",
                    class_name = self.name(),
                ));
            }

            Intrinsic::ConstantI32Min => output.push_str(&format!(
                "const {const_name} = -2_147_483_648;\n",
                const_name = self.name()
            )),
            Intrinsic::ConstantI32Max => output.push_str(&format!(
                "const {const_name} = 2_147_483_647;\n",
                const_name = self.name()
            )),
            Intrinsic::TypeCheckValidI32 => {
                let i32_const_min = Intrinsic::ConstantI32Min.name();
                let i32_const_max = Intrinsic::ConstantI32Max.name();
                output.push_str(&format!("const {fn_name} = (n) => typeof n === 'number' && n >= {i32_const_min} && n <= {i32_const_max};\n", fn_name = self.name()))
            }

            Intrinsic::AsyncFunctionCtor => {
                let async_fn_type = Intrinsic::AsyncFunctionCtor.name();
                uwriteln!(
                    output,
                    "const {async_fn_type} = (async () => {{}}).constructor;"
                );
            }

            Intrinsic::TypeCheckAsyncFn => {
                let async_fn_check = Intrinsic::TypeCheckAsyncFn.name();
                let async_fn_ctor = Intrinsic::AsyncFunctionCtor.name();
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

            Intrinsic::WebIdl(w) => w.render(output),

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
                let name = Intrinsic::AsyncEventCodeEnum.name();
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

            Intrinsic::IsBorrowedType => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let is_borrowed_type_fn = Intrinsic::IsBorrowedType.name();
                let defined_resource_tables = Intrinsic::DefinedResourceTables.name();
                output.push_str(&format!("
                    function {is_borrowed_type_fn}(componentIdx, typeIdx) {{
                        {debug_log_fn}('[{is_borrowed_type_fn}()] args', {{ componentIdx, typeIdx }});
                        const table = {defined_resource_tables}[componentIdx];
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
                    r#"
                    class {managed_buffer_class} {{
                        static MAX_LENGTH = 2**28 - 1;
                        #componentIdx;
                        #memory;

                        #elemMeta = null;

                        #start;
                        #ptr;
                        #capacity;
                        #processed = 0;

                        #data; // initial data (only filled out for host-owned)

                        target;

                        constructor(args) {{
                            if (args.capacity >= {managed_buffer_class}.MAX_LENGTH) {{
                                 throw new Error(`buffer size [${{args.capacity}}] greater than max length`);
                            }}
                            if (args.componentIdx === undefined) {{ throw new TypeError('missing/invalid component idx'); }}
                            if (args.capacity === undefined) {{ throw new TypeError('missing/invalid capacity'); }}
                            if (args.elemMeta === undefined || typeof args.elemMeta.align32 !== 'number') {{
                                throw new TypeError('missing/invalid element metadata');
                            }}

                            if (!args.memory && args.start === undefined && args.data === undefined) {{
                                throw new TypeError('either memory and start ptr or data must be provided for managed buffers');
                            }}

                            if (args.memory && args.start == undefined) {{
                                throw new TypeError('missing/invalid start ptr, depsite memory being present');
                            }}

                            if (args.start && args.start % args.elemMeta.align32 !== 0) {{
                                throw new Error(`invalid alignment: type with 32bit alignment [${{this.#elemMeta.align32}}] at starting pointer [${{start}}]`);
                            }}

                            this.#componentIdx = args.componentIdx;
                            this.#memory = args.memory;
                            this.#start = args.start;
                            this.#ptr = this.#start;
                            this.#capacity = args.capacity;
                            this.#elemMeta = args.elemMeta;
                            this.#data = args.data;
                            this.target = args.target;
                        }}

                        setTarget(tgt) {{ this.target = tgt; }}

                        capacity() {{ return this.#capacity; }}
                        remaining() {{ return this.#capacity - this.#processed; }}
                        processed() {{ return this.#processed; }}

                        componentIdx() {{ return this.#componentIdx; }}

                        getElemMeta() {{ return this.#elemMeta; }}

                        isHostOwned() {{ return !this.#memory; }}

                        read(count) {{
                            {debug_log_fn}('[{managed_buffer_class}#read()] args', {{ count }});
                            if (count === undefined) {{ throw new TypeError("missing/undefined count"); }}

                            const cap = this.capacity();
                            if (count > cap) {{
                                throw new Error(`cannot read [${{count}}] elements from buffer with capacity [${{cap}}]`);
                            }}

                            let values = [];
                            if (this.#elemMeta.typeIdx === null) {{
                                values = [...new Array(count)].map(() => null);
                            }} else {{
                                if (this.isHostOwned()) {{
                                    const remainingItems = this.#data.slice(count);
                                    values.push(...this.#data.slice(0, count));
                                    this.#data = remainingItems;
                                }} else {{
                                    let currentCount = count;
                                    let startPtr = this.#ptr;
                                    let liftCtx = {{ storagePtr: startPtr, memory: this.#memory }};
                                    if (currentCount < 0) {{ throw new Error('unexpectedly invalid count'); }}
                                    while (currentCount > 0) {{
                                        const [ value, _ctx ] = this.#elemMeta.liftFn(liftCtx)
                                        values.push(value);
                                        currentCount -= 1;
                                    }}
                                    this.#ptr = liftCtx.storagePtr;
                                }}
                            }}

                            this.#processed += count;
                            return values;
                        }}

                        write(values) {{
                            {debug_log_fn}('[{managed_buffer_class}#write()] args', {{ values }});

                            if (!Array.isArray(values)) {{ throw new TypeError('values input to write() must be an array'); }}
                            let rc = this.remaining();
                            if (values.length > rc) {{
                                throw new Error(`cannot write [${{values.length}}] elements to managed buffer with remaining capacity [${{rc}}]`);
                            }}

                            if (this.#elemMeta.typeIdx === null) {{
                                if (!values.every(v => v === null)) {{
                                    throw new Error('non-null values in write() to unit managed buffer');
                                }}
                            }} else {{
                                if (this.isHostOwned()) {{
                                    this.#data.push(...values);
                                }} else {{
                                    let startPtr = this.#ptr;
                                    for (const v of values) {{
                                        startPtr += this.#elemMeta.lowerFn({{
                                            memory: this.#memory,
                                            storagePtr: startPtr,
                                            vals: [v],
                                        }});
                                    }}
                                    this.#ptr = startPtr;
                                }}
                            }}

                            this.#processed += values.length;
                        }}

                    }}
                "#
                ));
            }

            Intrinsic::BufferManagerClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let buffer_manager_class = Intrinsic::BufferManagerClass.name();
                let managed_buffer_class = Intrinsic::ManagedBufferClass.name();
                output.push_str(&format!(r#"
                    class {buffer_manager_class} {{
                        #buffers = new Map();
                        #bufferIDs = new Map();

                        // NOTE: componentIdx === null indicates the host
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
                            if (args.elemMeta === undefined) {{ throw new TypeError('missing/invalid element metadata for use with managed buffer'); }}

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
                let global_buffer_manager = Intrinsic::GlobalBufferManager.name();
                let buffer_manager_class = Intrinsic::BufferManagerClass.name();
                output.push_str(&format!(
                    "const {global_buffer_manager} = new {buffer_manager_class}();"
                ));
            }

            Intrinsic::RepTableClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!(r#"
                    class {rep_table_class} {{
                        #data = [0, null];
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
                                return (this.#data.length >> 1) - 1;
                            }}
                            this.#data[0] = this.#data[freeIdx << 1];
                            const placementIdx = freeIdx << 1;
                            this.#data[placementIdx] = val;
                            this.#data[placementIdx + 1] = null;
                            return freeIdx;
                        }}

                        get(rep) {{
                            {debug_log_fn}('[{rep_table_class}#get()] args', {{ rep, target: this.target }});
                            const baseIdx = rep << 1;
                            const val = this.#data[baseIdx];
                            return val;
                        }}

                        contains(rep) {{
                            {debug_log_fn}('[{rep_table_class}#contains()] args', {{ rep, target: this.target }});
                            const baseIdx = rep << 1;
                            return !!this.#data[baseIdx];
                        }}

                        remove(rep) {{
                            {debug_log_fn}('[{rep_table_class}#remove()] args', {{ rep, target: this.target }});
                            if (this.#data.length === 2) {{ throw new Error('invalid'); }}

                            const baseIdx = rep << 1;
                            const val = this.#data[baseIdx];
                            if (val === 0) {{ throw new Error('invalid resource rep (cannot be 0)'); }}

                            this.#data[baseIdx] = this.#data[0];
                            this.#data[0] = rep;

                            return val;
                        }}

                        clear() {{
                            {debug_log_fn}('[{rep_table_class}#clear()] args', {{ rep, target: this.target }});
                            this.#data = [0, null];
                        }}
                    }}
                "#));
            }

            Intrinsic::GlobalAsyncParamLowersClass => {
                let global_async_param_lowers_class = self.name();
                output.push_str(&format!(
                    r#"
                    class {global_async_param_lowers_class} {{
                        static map = new Map();

                        static generateKey(args) {{
                            const {{ componentIdx, iface, fnName }} = args;
                            if (componentIdx === undefined) {{ throw new TypeError("missing component idx"); }}
                            if (iface === undefined) {{ throw new TypeError("missing iface name"); }}
                            if (fnName === undefined) {{ throw new TypeError("missing function name"); }}
                            return `${{componentIdx}}-${{iface}}-${{fnName}}`;
                        }}

                        static define(args) {{
                            const {{ componentIdx, iface, fnName, fn }} = args;
                            if (!fn) {{ throw new TypeError('missing function'); }}
                            const key = {global_async_param_lowers_class}.generateKey(args);
                            {global_async_param_lowers_class}.map.set(key, fn);
                        }}

                        static lookup(args) {{
                            const {{ componentIdx, iface, fnName }} = args;
                            const key = {global_async_param_lowers_class}.generateKey(args);
                            return {global_async_param_lowers_class}.map.get(key);
                        }}
                    }}
                    "#
                ));
            }

            Intrinsic::GlobalComponentAsyncLowersClass => {
                let global_component_lowers_class =
                    Intrinsic::GlobalComponentAsyncLowersClass.name();
                output.push_str(&format!(
                    r#"
                    class {global_component_lowers_class} {{
                        static map = new Map();

                        constructor() {{ throw new Error('{global_component_lowers_class} should not be constructed'); }}

                        static define(args) {{
                            const {{ componentIdx, qualifiedImportFn, fn }} = args;
                            let inner = {global_component_lowers_class}.map.get(componentIdx);
                            if (!inner) {{
                                inner = new Map();
                                {global_component_lowers_class}.map.set(componentIdx, inner);
                            }}

                            inner.set(qualifiedImportFn, fn);
                        }}

                        static lookup(componentIdx, qualifiedImportFn) {{
                            let inner = {global_component_lowers_class}.map.get(componentIdx);
                            if (!inner) {{
                                inner = new Map();
                                {global_component_lowers_class}.map.set(componentIdx, inner);
                            }}

                            const found = inner.get(qualifiedImportFn);
                            if (found) {{ return found; }}

                            // In some cases, async lowers are *not* host provided, and
                            // but contain/will call an async function in the host.
                            //
                            // One such case is `stream.write`/`stream.read` trampolines which are
                            // actually re-exported through a patch up container *before*
                            // they call the relevant async host trampoline.
                            //
                            // So the path of execution from a component export would be:
                            //
                            // async guest export --> stream.write import (host wired) -> guest export (patch component) -> async host trampoline
                            //
                            // On top of all this, the trampoline that is eventually called is async,
                            // so we must await the patched guest export call.
                            //
                            if (qualifiedImportFn.includes("[stream-write-") || qualifiedImportFn.includes("[stream-read-")) {{
                                return async (...args) => {{
                                    const [originalFn, ...params] = args;
                                    return await originalFn(...params);
                                }};
                            }}

                            // All other cases can call the registered function directly
                            return (...args) => {{
                                const [originalFn, ...params] = args;
                                return originalFn(...params);
                            }};
                        }}
                    }}
                "#
                ));
            }

            Intrinsic::GlobalComponentMemoriesClass => {
                let global_component_memories_class =
                    Intrinsic::GlobalComponentMemoriesClass.name();
                output.push_str(&format!(
                    r#"
                    class {global_component_memories_class} {{
                        static map = new Map();

                        constructor() {{ throw new Error('{global_component_memories_class} should not be constructed'); }}

                        static save(args) {{
                            const {{ idx, componentIdx, memory }} = args;
                            let inner = {global_component_memories_class}.map.get(componentIdx);
                            if (!inner) {{
                                inner = [];
                                {global_component_memories_class}.map.set(componentIdx, inner);
                            }}
                            inner.push({{ memory, idx }});
                        }}

                        static getMemoriesForComponentIdx(componentIdx) {{
                            const metas = {global_component_memories_class}.map.get(componentIdx);
                            return metas.map(meta => meta.memory);
                        }}

                        static getMemory(componentIdx, idx) {{
                            const metas = {global_component_memories_class}.map.get(componentIdx);
                            return metas.find(meta => meta.idx === idx)?.memory;
                        }}
                    }}
                "#
                ));
            }
        }
    }
}

/// Profile for determinism to be used by async implementation
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) enum AsyncDeterminismProfile {
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
pub struct RenderIntrinsicsArgs<'a> {
    /// List of intrinsics being built for use
    pub(crate) intrinsics: &'a mut BTreeSet<Intrinsic>,
    /// Whether to use NodeJS compat
    pub(crate) no_nodejs_compat: bool,
    /// Whether instantiation has occurred
    pub(crate) instantiation: bool,
    /// The kind of determinism to use
    pub(crate) determinism: AsyncDeterminismProfile,
}

/// Intrinsics that should be rendered as early as possible
const EARLY_INTRINSICS: [Intrinsic; 21] = [
    Intrinsic::DebugLog,
    Intrinsic::GlobalAsyncDeterminism,
    Intrinsic::GlobalComponentAsyncLowersClass,
    Intrinsic::GlobalAsyncParamLowersClass,
    Intrinsic::GlobalComponentMemoriesClass,
    Intrinsic::RepTableClass,
    Intrinsic::CoinFlip,
    Intrinsic::ScopeId,
    Intrinsic::ConstantI32Min,
    Intrinsic::ConstantI32Max,
    Intrinsic::TypeCheckValidI32,
    Intrinsic::TypeCheckAsyncFn,
    Intrinsic::AsyncFunctionCtor,
    Intrinsic::AsyncTask(AsyncTaskIntrinsic::CurrentTaskMayBlock),
    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GlobalAsyncCurrentTaskIds),
    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GlobalAsyncCurrentComponentIdxs),
    Intrinsic::AsyncTask(AsyncTaskIntrinsic::UnpackCallbackResult),
    Intrinsic::PromiseWithResolversPonyfill,
    Intrinsic::Host(HostIntrinsic::PrepareCall),
    Intrinsic::Host(HostIntrinsic::AsyncStartCall),
    Intrinsic::Host(HostIntrinsic::SyncStartCall),
];

/// Emits the intrinsic `i` to this file and then returns the name of the
/// intrinsic.
pub fn render_intrinsics(args: RenderIntrinsicsArgs) -> Source {
    let mut output = Source::default();
    let mut rendered_intrinsics = HashSet::new();

    // Render some early intrinsics
    for intrinsic in EARLY_INTRINSICS {
        intrinsic.render(&mut output, &args);
        rendered_intrinsics.insert(intrinsic.name());
    }

    // Add intrinsics to the list we must render
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

    if args
        .intrinsics
        .contains(&Intrinsic::String(StringIntrinsic::Utf8Encode))
    {
        args.intrinsics
            .extend([&Intrinsic::String(StringIntrinsic::GlobalTextEncoderUtf8)]);
    }

    // Attempting to perform a debug message hoist will require string encoding to memory
    if args.intrinsics.contains(&Intrinsic::ErrCtx(
        ErrCtxIntrinsic::ErrorContextDebugMessage,
    )) {
        args.intrinsics.extend([
            &Intrinsic::String(StringIntrinsic::Utf8Encode),
            &Intrinsic::String(StringIntrinsic::Utf16Encode),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::GetLocalTable),
        ]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::ErrCtx(ErrCtxIntrinsic::ErrorContextNew))
    {
        args.intrinsics.extend([
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::ComponentGlobalTable),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::GlobalRefCountAdd),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::ReserveGlobalRep),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::CreateLocalHandle),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::GetLocalTable),
        ]);
    }

    if args.intrinsics.contains(&Intrinsic::ErrCtx(
        ErrCtxIntrinsic::ErrorContextDebugMessage,
    )) {
        args.intrinsics.extend([
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::GlobalRefCountAdd),
            &Intrinsic::ErrCtx(ErrCtxIntrinsic::ErrorContextDrop),
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
        .contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::DriverLoop))
    {
        args.intrinsics.extend([
            &Intrinsic::TypeCheckValidI32,
            &Intrinsic::Conversion(ConversionIntrinsic::ToInt32),
            &Intrinsic::Component(ComponentIntrinsic::ComponentStateSetAllError),
        ]);
    }

    if args.intrinsics.contains(&Intrinsic::Component(
        ComponentIntrinsic::GetOrCreateAsyncState,
    )) {
        args.intrinsics.extend([&Intrinsic::RepTableClass]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass))
    {
        args.intrinsics.extend([
            &Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
            &Intrinsic::Component(ComponentIntrinsic::GlobalAsyncStateMap),
            &Intrinsic::RepTableClass,
            &Intrinsic::AwaitableClass,
            &Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncSubtaskClass),
            &Intrinsic::Waitable(WaitableIntrinsic::WaitableClass),
        ]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Waitable(WaitableIntrinsic::WaitableSetNew))
    {
        args.intrinsics
            .extend([&Intrinsic::Waitable(WaitableIntrinsic::WaitableSetClass)]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Waitable(WaitableIntrinsic::WaitableSetPoll))
    {
        args.intrinsics
            .extend([&Intrinsic::Host(HostIntrinsic::StoreEventInComponentMemory)]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Waitable(WaitableIntrinsic::WaitableSetDrop))
    {
        args.intrinsics
            .extend([&Intrinsic::Waitable(WaitableIntrinsic::RemoveWaitableSet)]);
    }

    if args.intrinsics.contains(&Intrinsic::Component(
        ComponentIntrinsic::GetOrCreateAsyncState,
    )) {
        args.intrinsics.extend([
            &Intrinsic::Component(ComponentIntrinsic::ComponentAsyncStateClass),
            &Intrinsic::Component(ComponentIntrinsic::GlobalAsyncStateMap),
        ]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatResult))
        | args
            .intrinsics
            .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatOption))
        | args
            .intrinsics
            .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatOption))
    {
        args.intrinsics
            .extend([&Intrinsic::Lift(LiftIntrinsic::LiftFlatVariant)]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatVariant))
    {
        args.intrinsics.extend([
            &Intrinsic::Lift(LiftIntrinsic::LiftFlatU8),
            &Intrinsic::Lift(LiftIntrinsic::LiftFlatU16),
            &Intrinsic::Lift(LiftIntrinsic::LiftFlatU32),
        ]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Lower(LowerIntrinsic::LowerFlatVariant))
    {
        args.intrinsics.extend([
            &Intrinsic::Lower(LowerIntrinsic::LowerFlatU8),
            &Intrinsic::Lower(LowerIntrinsic::LowerFlatU16),
            &Intrinsic::Lower(LowerIntrinsic::LowerFlatU32),
        ]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatStringUtf8))
    {
        args.intrinsics
            .insert(Intrinsic::String(StringIntrinsic::GlobalTextDecoderUtf8));
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Lower(LowerIntrinsic::LowerFlatStringUtf8))
    {
        args.intrinsics
            .insert(Intrinsic::String(StringIntrinsic::GlobalTextEncoderUtf8));
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatStringUtf16))
    {
        args.intrinsics
            .insert(Intrinsic::String(StringIntrinsic::Utf16Decoder));
    }

    if args
        .intrinsics
        .contains(&Intrinsic::Lift(LiftIntrinsic::LiftFlatStream))
    {
        args.intrinsics.insert(Intrinsic::AsyncStream(
            AsyncStreamIntrinsic::ExternalStreamClass,
        ));
    }

    if args.intrinsics.contains(&Intrinsic::AsyncTask(
        AsyncTaskIntrinsic::CreateNewCurrentTask,
    )) || args
        .intrinsics
        .contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask))
        || args
            .intrinsics
            .contains(&Intrinsic::AsyncTask(AsyncTaskIntrinsic::EndCurrentTask))
    {
        args.intrinsics.extend([
            &Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncTaskClass),
            &Intrinsic::AsyncTask(AsyncTaskIntrinsic::GlobalAsyncCurrentTaskMap),
        ]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamNew))
    {
        args.intrinsics.extend([
            &Intrinsic::AsyncStream(AsyncStreamIntrinsic::GlobalStreamMap),
            &Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamWritableEndClass),
            &Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamReadableEndClass),
        ]);
    }

    if args.intrinsics.contains(&Intrinsic::AsyncStream(
        AsyncStreamIntrinsic::StreamWritableEndClass,
    )) || args.intrinsics.contains(&Intrinsic::AsyncStream(
        AsyncStreamIntrinsic::StreamReadableEndClass,
    )) {
        args.intrinsics.extend([
            &Intrinsic::AsyncStream(AsyncStreamIntrinsic::InternalStreamClass),
            &Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamEndClass),
        ]);
    }

    if args.intrinsics.contains(&Intrinsic::AsyncStream(
        AsyncStreamIntrinsic::StreamNewFromLift,
    )) {
        args.intrinsics.extend([
            &Intrinsic::AsyncStream(AsyncStreamIntrinsic::GlobalStreamMap),
            &Intrinsic::AsyncStream(AsyncStreamIntrinsic::HostStreamClass),
            &Intrinsic::AsyncStream(AsyncStreamIntrinsic::ExternalStreamClass),
        ]);
    }

    if args
        .intrinsics
        .contains(&Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamWrite))
    {
        args.intrinsics.extend([
            &Intrinsic::GlobalBufferManager,
            &Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncBlockedConstant),
        ]);
    }

    if args.intrinsics.contains(&Intrinsic::GlobalBufferManager) {
        args.intrinsics.extend([&Intrinsic::BufferManagerClass]);
    }

    if args.intrinsics.contains(&Intrinsic::BufferManagerClass) {
        args.intrinsics.extend([&Intrinsic::ManagedBufferClass]);
    }

    for current_intrinsic in args.intrinsics.iter() {
        // Skip already rendered intrinsics (i.e. the early intrinsics)
        if rendered_intrinsics.contains(current_intrinsic.name()) {
            continue;
        }

        current_intrinsic.render(&mut output, &args);
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
                "GlobalComponentMemories",
                "GlobalComponentAsyncLowers",
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
            Intrinsic::DefinedResourceTables => "definedResourceTables",
            Intrinsic::FetchCompile => "fetchCompile",
            Intrinsic::FinalizationRegistryCreate => "finalizationRegistryCreate",
            Intrinsic::GetErrorPayload => "getErrorPayload",
            Intrinsic::GetErrorPayloadString => "getErrorPayloadString",
            Intrinsic::HandleTables => "handleTables",
            Intrinsic::HasOwnProperty => "hasOwnProperty",
            Intrinsic::InstantiateCore => "instantiateCore",
            Intrinsic::IsLE => "isLE",
            Intrinsic::ScopeId => "SCOPE_ID",
            Intrinsic::SymbolCabiDispose => "symbolCabiDispose",
            Intrinsic::SymbolCabiLower => "symbolCabiLower",
            Intrinsic::SymbolDispose => "symbolDispose",
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
            Intrinsic::IsBorrowedType => "_isBorrowedType",
            Intrinsic::TypeCheckAsyncFn => "_typeCheckAsyncFn",
            Intrinsic::AsyncFunctionCtor => "ASYNC_FN_CTOR",

            // Async
            Intrinsic::GlobalAsyncDeterminism => "ASYNC_DETERMINISM",
            Intrinsic::AwaitableClass => "Awaitable",
            Intrinsic::CoinFlip => "_coinFlip",
            Intrinsic::GlobalComponentAsyncLowersClass => "GlobalComponentAsyncLowers",
            Intrinsic::GlobalAsyncParamLowersClass => "GlobalAsyncParamLowers",
            Intrinsic::GlobalComponentMemoriesClass => "GlobalComponentMemories",

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
