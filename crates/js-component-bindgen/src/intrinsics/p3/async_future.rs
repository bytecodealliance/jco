//! Intrinsics that represent helpers that enable Future integration

use std::fmt::Write;

use crate::intrinsics::component::ComponentIntrinsic;
use crate::intrinsics::{Intrinsic, RenderIntrinsicsArgs};
use crate::source::Source;
use crate::uwriteln;

use super::async_task::AsyncTaskIntrinsic;

/// This enum contains intrinsics that enable Futures
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum AsyncFutureIntrinsic {
    /// Global that stores futures
    ///
    /// ```ts
    /// type i32 = number;
    /// type FutureEnd = FutureWritableEndClass | FutureReadableEndClass;
    /// type GlobalFutureMap<T> = Map<i32, FutureEnd>;
    /// ```
    GlobalFutureMap,

    /// Symbol that is used to delineate futures that are nested
    NestedFutureSymbol,

    /// A lazy, one-layer awaitable used for lifted WIT futures.
    FutureValueClass,

    /// Map of future tables to component indices
    GlobalFutureTableMap,

    /// Create an internal future
    CreateFuture,

    /// Retrieve a future end from its component or future table
    GetFutureEnd,

    /// Add a future end to a future table and its component's waitable table
    AddFutureEndToTable,

    /// Remove a future end from a future table and its component's waitable table
    RemoveFutureEndFromTable,

    /// The definition of the `FutureWritableEnd` JS class
    ///
    /// This class serves as a shared implementation used by writable and readable ends
    FutureEndClass,

    /// The definition of the `HostFuture` JS class
    ///
    /// This class serves as an implementation for top level host-managed futures,
    /// internal to the bindgen generated logic.
    ///
    /// External code is no expected to work in terms of `HostFuture`, but rather deal with `Future`s
    ///
    HostFutureClass,

    /// An internal future class that coordinates boht writable and readable ends
    InternalFutureClass,

    /// The definition of the `FutureWritableEnd` JS class
    FutureWritableEndClass,

    /// The definition of the `FutureReadableEnd` JS class
    FutureReadableEndClass,

    /// Create a new future
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturenew
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >= 0
    /// type u64 = bigint; // >= 0
    /// function futureNew(typeRep: u32): u64;
    /// ```
    FutureNew,

    /// Create a new future during a lift (`Instruction::FutureLift`).
    ///
    /// This is distinct from plain future creation, because we are provided more information,
    /// particularly the relevant types to teh future and lift/lower fns for the future.
    ///
    /// ```ts
    /// type Ctx = {
    ///     componentIdx: number,
    ///     futureTableIdx: number,
    ///     elemMeta: object,
    /// }
    /// function futureNewFromLift(ctx: Ctx);
    /// ```
    ///
    FutureNewFromLift,

    /// Read from a future
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-futurefuturereadwrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u32 = number; // >=0
    /// type i64 = bigint;
    /// type StringEncoding = 'utf8' | 'utf16' | 'compact-utf16'; // see wasmtime_environ::StringEncoding
    ///
    /// function futureRead(
    ///     componentIdx: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     futureRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    FutureRead,

    /// Write to a future
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturereadwrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u32 = number; // >=0
    /// type i64 = bigint;
    /// type StringEncoding = 'utf8' | 'utf16' | 'compact-utf16'; // see wasmtime_environ::StringEncoding
    ///
    /// function futureWrite(
    ///     componentIdx: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     futureRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    FutureWrite,

    /// Cancel a read to a future
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturecancel-readread
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    /// type u64 = bigint; // >=0
    ///
    /// function futureCancelRead(futureRep: u32, isAsync: boolean, readerRep: u32): u64;
    /// ```
    FutureCancelRead,

    /// Cancel a write to a future
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturecancel-writewrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    /// type u64 = bigint; // >= 0
    ///
    /// function futureCancelWrite(futureRep: u32, isAsync: boolean, writerRep: u32): u64;
    /// ```
    FutureCancelWrite,

    /// Drop a the readable end of a Future
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturedrop-readablewritable
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    ///
    /// function futureDropReadable(futureRep: u32, readerRep: u32): bool;
    /// ```
    FutureDropReadable,

    /// Drop a the writable end of a Future
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturedrop-readablewritable
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    ///
    /// function futureDropWritable(futureRep: u32, writerRep: u32): bool;
    /// ```
    FutureDropWritable,

    /// Instruction emitted by FACT modules that enables the transfer of a future
    ///
    /// See [`Trampoline::FutureTransfer`]
    FutureTransfer,

    /// Function that generates a host injection function for external futures
    ///
    /// This is usually used when lowering external `Promise<T>`s into components, creating
    /// readable ends as necessary.
    ///
    /// The generated host injection function is generally called right when a component
    /// attempts to read (in doing so, "injecting" a write before the component read).
    GenFutureHostInjectFn,

    /// Function to check whether a JS object can be used as a stream
    IsFutureLowerableObject,
}

impl AsyncFutureIntrinsic {
    /// Retrieve global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            Self::FutureCancelRead.name(),
            Self::FutureCancelWrite.name(),
            Self::FutureDropReadable.name(),
            Self::FutureDropWritable.name(),
            Self::FutureEndClass.name(),
            Self::FutureNew.name(),
            Self::FutureNewFromLift.name(),
            Self::FutureRead.name(),
            Self::FutureReadableEndClass.name(),
            Self::FutureTransfer.name(),
            Self::FutureWritableEndClass.name(),
            Self::FutureWrite.name(),
            Self::FutureValueClass.name(),
            Self::CreateFuture.name(),
            Self::GetFutureEnd.name(),
            Self::AddFutureEndToTable.name(),
            Self::RemoveFutureEndFromTable.name(),
            Self::GlobalFutureMap.name(),
            Self::GlobalFutureTableMap.name(),
            Self::InternalFutureClass.name(),
            Self::GenFutureHostInjectFn.name(),
            Self::IsFutureLowerableObject.name(),
            Self::NestedFutureSymbol.name(),
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::FutureCancelRead => "futureCancelRead",
            Self::FutureCancelWrite => "futureCancelWrite",
            Self::FutureDropReadable => "futureDropReadable",
            Self::FutureDropWritable => "futureDropWritable",
            Self::FutureEndClass => "FutureEnd",
            Self::FutureNew => "futureNew",
            Self::FutureNewFromLift => "futureNewFromLift",
            Self::FutureRead => "futureRead",
            Self::FutureReadableEndClass => "FutureReadableEnd",
            Self::FutureTransfer => "futureTransfer",
            Self::FutureWritableEndClass => "FutureWritableEnd",
            Self::FutureWrite => "futureWrite",
            Self::GlobalFutureMap => "FUTURES",
            Self::NestedFutureSymbol => "NESTED_FUTURE_SYMBOL",
            Self::FutureValueClass => "FutureValue",
            Self::GlobalFutureTableMap => "FUTURE_TABLES",
            Self::CreateFuture => "createFuture",
            Self::GetFutureEnd => "getFutureEnd",
            Self::AddFutureEndToTable => "addFutureEndToTable",
            Self::RemoveFutureEndFromTable => "removeFutureEndFromTable",
            Self::HostFutureClass => "HostFuture",
            Self::InternalFutureClass => "InternalFuture",
            Self::GenFutureHostInjectFn => "_genFutureHostInjectFn",
            Self::IsFutureLowerableObject => "_isFutureLowerableObject",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source, render_args: &RenderIntrinsicsArgs<'_>) {
        match self {
            Self::GlobalFutureMap => {
                let global_future_map = render_args.require_intrinsic(Self::GlobalFutureMap);
                let rep_table_class = render_args.require_intrinsic(Intrinsic::RepTableClass);
                output.push_str(&format!(
                    r#"
                    const {global_future_map} = new {rep_table_class}({{ target: 'global future map' }});
                    "#
                ));
            }

            Self::NestedFutureSymbol => {
                let nested_future_symbol = self.name();
                output.push_str(&format!(
                    r#"
                    const {nested_future_symbol} = Symbol.for('nested-future');
                    "#
                ));
            }

            Self::FutureValueClass => {
                let future_value_class = self.name();
                output.push_str(&format!(
                    r#"
                    class {future_value_class} {{
                        #start;
                        #settled;
                        #hideThen = 0;
                        #thenFn;

                        constructor(start) {{
                            if (typeof start !== 'function') {{
                                throw new TypeError('future start operation must be a function');
                            }}
                            this.#start = start;
                            this.#thenFn = this.#then.bind(this);
                        }}

                        get then() {{
                            return this.#hideThen === 0 ? this.#thenFn : undefined;
                        }}

                        #read() {{
                            if (!this.#settled) {{
                                // The start operation resolves to a non-thenable box so a
                                // future-valued payload cannot be assimilated by this Promise.
                                this.#settled = Promise.resolve().then(this.#start);
                            }}
                            return this.#settled;
                        }}

                        resolveAsValue(resolve) {{
                            this.#hideThen++;
                            try {{
                                resolve(this);
                            }} finally {{
                                this.#hideThen--;
                            }}
                        }}

                        #deliver(resolve, value) {{
                            if (value instanceof {future_value_class}) {{
                                // Promise resolution reads `then` synchronously. Hide it only
                                // for that lookup so resolving this layer yields the inner
                                // FutureValue instead of recursively awaiting it.
                                value.resolveAsValue(resolve);
                                return;
                            }}
                            resolve(value);
                        }}

                        #then(resolve, reject) {{
                            return this.#read().then(
                                box => this.#deliver(resolve, box.value),
                                reject,
                            );
                        }}
                    }}
                    "#
                ));
            }

            Self::GlobalFutureTableMap => {
                let global_future_table_map =
                    render_args.require_intrinsic(Self::GlobalFutureTableMap);
                output.push_str(&format!(
                    r#"
                    const {global_future_table_map} = {{}};
                    "#
                ));
            }

            Self::CreateFuture => {
                let create_future_fn = self.name();
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let internal_future_class =
                    render_args.require_intrinsic(Self::InternalFutureClass);
                let global_future_map = render_args.require_intrinsic(Self::GlobalFutureMap);
                let global_future_table_map =
                    render_args.require_intrinsic(Self::GlobalFutureTableMap);

                output.push_str(&format!(
                    r#"
                    function {create_future_fn}(cstate, args) {{
                        {debug_log_fn}('[{create_future_fn}()] args', args);
                        const {{ tableIdx, elemMeta, hostInjectFn }} = args;
                        if (tableIdx === undefined) {{ throw new Error("missing table idx while adding future"); }}
                        if (elemMeta === undefined) {{ throw new Error("missing element metadata while adding future"); }}

                        const {{ table: futureTable, componentIdx }} = {global_future_table_map}[tableIdx];
                        if (!futureTable) {{
                            throw new Error(`missing global future table lookup for table [${{tableIdx}}] while creating future`);
                        }}
                        if (componentIdx !== cstate.componentIdx()) {{
                            throw new Error('component idx mismatch while creating future');
                        }}

                        const readWaitable = cstate.createWaitable();
                        const writeWaitable = cstate.createWaitable();

                        const future = new {internal_future_class}({{
                            tableIdx,
                            componentIdx: cstate.componentIdx(),
                            elemMeta,
                            readWaitable,
                            writeWaitable,
                            hostInjectFn,
                        }});
                        future.setGlobalFutureMapRep({global_future_map}.insert(future));

                        const readEnd = future.readEnd();
                        readEnd.setWaitableIdx(cstate.handles.insert(readEnd));
                        readEnd.setHandle(futureTable.insert(readEnd));
                        if (readEnd.futureTableIdx() !== tableIdx) {{ throw new Error("unexpectedly mismatched future table"); }}

                        const readEndWaitableIdx = readEnd.waitableIdx();
                        const readEndHandle = readEnd.handle();
                        readWaitable.setTarget(`waitable for read end (waitable [${{readEndWaitableIdx}}])`);
                        readEnd.setTarget(`future read end (waitable [${{readEndWaitableIdx}}])`);

                        const writeEnd = future.writeEnd();
                        writeEnd.setWaitableIdx(cstate.handles.insert(writeEnd));
                        writeEnd.setHandle(futureTable.insert(writeEnd));
                        if (writeEnd.futureTableIdx() !== tableIdx) {{ throw new Error("unexpectedly mismatched future table"); }}

                        const writeEndWaitableIdx = writeEnd.waitableIdx();
                        const writeEndHandle = writeEnd.handle();
                        writeWaitable.setTarget(`waitable for future write end (waitable [${{writeEndWaitableIdx}}])`);
                        writeEnd.setTarget(`future write end (waitable [${{writeEndWaitableIdx}}])`);

                        return {{
                            writeEnd,
                            writeEndWaitableIdx,
                            writeEndHandle,
                            readEndWaitableIdx,
                            readEndHandle,
                            readEnd,
                        }};
                    }}

                    "#,
                ));
            }

            Self::GetFutureEnd => {
                let get_future_end_fn = self.name();
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let global_future_table_map =
                    render_args.require_intrinsic(Self::GlobalFutureTableMap);
                let get_or_create_async_state_fn = render_args.require_intrinsic(
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
                );

                output.push_str(&format!(
                    r#"
                    function {get_future_end_fn}(args) {{
                        {debug_log_fn}('[{get_future_end_fn}()] args', args);
                        const {{ tableIdx, futureEndHandle, futureEndWaitableIdx }} = args;
                        if (tableIdx === undefined) {{
                            throw new Error('missing table idx while getting future end');
                        }}

                        const {{ table, componentIdx }} = {global_future_table_map}[tableIdx];
                        const cstate = {get_or_create_async_state_fn}(componentIdx);

                        let futureEnd;
                        if (futureEndWaitableIdx !== undefined) {{
                            futureEnd = cstate.handles.get(futureEndWaitableIdx);
                        }} else if (futureEndHandle !== undefined) {{
                            if (!table) {{ throw new Error(`missing/invalid table [${{tableIdx}}] while getting future end`); }}
                            futureEnd = table.get(futureEndHandle);
                        }} else {{
                            throw new TypeError("must specify either waitable idx or handle to retrieve future");
                        }}

                        if (!futureEnd) {{
                            throw new Error(`missing future end (tableIdx [${{tableIdx}}], handle [${{futureEndHandle}}], waitableIdx [${{futureEndWaitableIdx}}])`);
                        }}
                        if (tableIdx && futureEnd.futureTableIdx() !== tableIdx) {{
                            throw new Error(`future end table idx [${{futureEnd.futureTableIdx()}}] does not match [${{tableIdx}}]`);
                        }}

                        return futureEnd;
                    }}

                    "#,
                ));
            }

            Self::AddFutureEndToTable => {
                let add_future_end_to_table_fn = self.name();
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let global_future_table_map =
                    render_args.require_intrinsic(Self::GlobalFutureTableMap);
                let get_or_create_async_state_fn = render_args.require_intrinsic(
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
                );

                output.push_str(&format!(
                    r#"
                    function {add_future_end_to_table_fn}(args) {{
                        {debug_log_fn}('[{add_future_end_to_table_fn}()] args', args);
                        const {{ tableIdx, futureEnd }} = args;
                        if (typeof futureEnd === 'number') {{ throw new Error("INSERTING BAD FUTUREEND"); }}

                        let {{ table, componentIdx }} = {global_future_table_map}[tableIdx];
                        if (componentIdx === undefined || !table) {{
                            throw new Error(`invalid global future table state for table [${{tableIdx}}]`);
                        }}

                        const handle = table.insert(futureEnd);
                        futureEnd.setHandle(handle);
                        futureEnd.setFutureTableIdx(tableIdx);

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        const waitableIdx = cstate.handles.insert(futureEnd);
                        futureEnd.setWaitableIdx(waitableIdx);

                        {debug_log_fn}('[{add_future_end_to_table_fn}()] added future end', {{
                            tableIdx,
                            table,
                            handle,
                            futureEnd,
                            destComponentIdx: componentIdx,
                        }});

                        return {{ handle, waitableIdx }};
                    }}

                    "#,
                ));
            }

            Self::RemoveFutureEndFromTable => {
                let remove_future_end_from_table_fn = self.name();
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let global_future_table_map =
                    render_args.require_intrinsic(Self::GlobalFutureTableMap);
                let get_or_create_async_state_fn = render_args.require_intrinsic(
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
                );

                output.push_str(&format!(
                    r#"
                    function {remove_future_end_from_table_fn}(args) {{
                        {debug_log_fn}('[{remove_future_end_from_table_fn}()] args', args);
                        const {{ tableIdx, futureWaitableIdx }} = args;
                        if (tableIdx === undefined) {{ throw new Error("missing table idx while removing future end"); }}
                        if (futureWaitableIdx === undefined) {{
                            throw new Error("missing future end waitable idx while removing future end");
                        }}

                        const {{ table, componentIdx }} = {global_future_table_map}[tableIdx];
                        if (!table) {{ throw new Error(`missing/invalid table [${{tableIdx}}] while removing future end`); }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);

                        const futureEnd = cstate.handles.get(futureWaitableIdx);
                        if (!futureEnd) {{
                            throw new Error(`missing future end (handle [${{futureWaitableIdx}}], table [${{tableIdx}}])`);
                        }}
                        const handle = futureEnd.handle();

                        let removed = cstate.handles.remove(futureWaitableIdx);
                        if (!removed) {{
                            throw new Error(`failed to remove futureEnd from handles (waitable idx [${{futureWaitableIdx}}]), component [${{componentIdx}}])`);
                        }}

                        removed = table.remove(handle);
                        if (!removed) {{
                            throw new Error(`failed to remove futureEnd from table (handle [${{handle}}]), table [${{tableIdx}}], component [${{componentIdx}}])`);
                        }}

                        return futureEnd;
                    }}
                    "#,
                ));
            }

            // The host future class is used exclusively *inside* the host implementation,
            // to represent future that have been lifted (or originated) external to a given
            // component.
            //
            // For example, after a component-internal future is lifted from a component (normally
            // by way of returning it from a function), that future will have been made into a host
            // future, and *may* give actual end users access via the `createUserFuture()` function.
            //
            // At present since futures can only give away the read-end, this usually means that the
            // host future will be used to often give away the *read* end.
            //
            Self::HostFutureClass => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let host_future_class_name = self.name();
                let get_future_end_fn = render_args.require_intrinsic(Self::GetFutureEnd);
                let get_or_create_async_state_fn = render_args.require_intrinsic(
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
                );
                let runtime_error_class =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);

                output.push_str(&format!(
                    r#"
                    class {host_future_class_name} {{
                        #componentIdx;
                        #futureEndWaitableIdx;
                        #futureTableIdx;

                        #payloadLiftFn;
                        #payloadLowerFn;

                        #userFuture;

                        #rep = null;

                        constructor(args) {{
                            {debug_log_fn}('[{host_future_class_name}#constructor()] args', args);
                            if (args.componentIdx === undefined) {{ throw new TypeError("missing component idx"); }}
                            this.#componentIdx = args.componentIdx;

                            if (!args.payloadLiftFn) {{ throw new TypeError("missing payload lift fn"); }}
                            this.#payloadLiftFn = args.payloadLiftFn;

                            if (!args.payloadLowerFn) {{ throw new TypeError("missing payload lower fn"); }}
                            this.#payloadLowerFn = args.payloadLowerFn;

                            if (args.futureEndWaitableIdx === undefined) {{ throw new Error("missing future idx"); }}
                            if (args.futureTableIdx === undefined) {{ throw new Error("missing future table idx"); }}
                            this.#futureEndWaitableIdx = args.futureEndWaitableIdx;
                            this.#futureTableIdx = args.futureTableIdx;
                        }}

                        setRep(rep) {{ this.#rep = rep; }}
                        getFutureEndWaitableIdx() {{ return this.#futureEndWaitableIdx; }}

                        createUserFuture() {{
                           if (this.#userFuture) {{ return this.#userFuture; }}
                           if (this.#rep === null) {{ throw new Error("unexpectedly missing rep for host future"); }}

                           const cstate = {get_or_create_async_state_fn}(this.#componentIdx);
                           if (!cstate) {{ throw new Error(`missing async state for component [${{this.#componentIdx}}]`); }}

                           const futureEnd = {get_future_end_fn}({{
                               tableIdx: this.#futureTableIdx,
                               futureEndWaitableIdx: this.#futureEndWaitableIdx
                           }});
                           if (!futureEnd) {{
                               throw new Error(`missing future [${{this.#futureEndWaitableIdx}}] (table [${{this.#futureTableIdx}}], component [${{this.#componentIdx}}]`);
                           }}
                           if (futureEnd.isInSet()) {{ throw new {runtime_error_class}('futures in waitable sets cannot be lifted'); }}

                            return futureEnd.promise();
                        }}
                    }}
                    "#
                ));
            }

            Self::FutureEndClass => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let future_end_class = render_args.require_intrinsic(Self::FutureEndClass);

                uwriteln!(
                    output,
                    r#"
                    class {future_end_class} {{
                        static CopyResult = {{
                            COMPLETED: 0,
                            DROPPED: 1,
                            CANCELLED: 2,
                        }};

                        static CopyState = {{
                            IDLE: 1,
                            SYNC_COPYING: 2,
                            ASYNC_COPYING: 3,
                            CANCELLING_COPY: 4,
                            DONE: 5,
                        }};

                        #pendingBufferMeta;
                        #waitable;
                        #copyState = {future_end_class}.CopyState.IDLE;

                        #dropped = false;
                        #isPeerDroppedFn;

                        constructor(args) {{
                            {debug_log_fn}('[{future_end_class}#constructor()] args', args);

                            if (!args.pendingBufferMeta) {{ throw new Error("missing pending buffer"); }}
                            this.#pendingBufferMeta = args.pendingBufferMeta;

                            if (!args.waitable) {{ throw new Error("missing pending buffer"); }}
                            this.#waitable = args.waitable;

                            if (args.isPeerDroppedFn !== undefined && typeof args.isPeerDroppedFn !== 'function') {{
                                throw new TypeError('isPeerDroppedFn must be a function');
                            }}
                            this.#isPeerDroppedFn = args.isPeerDroppedFn ?? (() => false);
                        }}

                        getWaitable() {{ return this.#waitable; }}
                        setWaitable(w) {{ this.#waitable = w; }}

                        setCopyState(state) {{ this.#copyState = state; }}
                        getCopyState() {{ return this.#copyState; }}

                        isDoneState() {{ return this.getCopyState() === {future_end_class}.CopyState.DONE; }}
                        isCancelledState() {{ return this.getCopyState() === {future_end_class}.CopyState.CANCELLED; }}
                        isIdleState() {{ return this.getCopyState() === {future_end_class}.CopyState.IDLE; }}

                        isCopying() {{
                            switch (this.#copyState) {{
                                case {future_end_class}.CopyState.IDLE:
                                case {future_end_class}.CopyState.DONE:
                                    return false;
                                    break;
                                case {future_end_class}.CopyState.SYNC_COPYING:
                                case {future_end_class}.CopyState.ASYNC_COPYING:
                                case {future_end_class}.CopyState.CANCELLING_COPY:
                                    return true;
                                    break;
                                default:
                                    throw new Error('invalid/unknown copying state');
                            }}
                        }}

                        setPendingBufferMeta(args) {{
                            const {{ componentIdx, buffer, onCopyDoneFn }} = args;
                            this.#pendingBufferMeta.componentIdx = componentIdx;
                            this.#pendingBufferMeta.buffer = buffer;
                            this.#pendingBufferMeta.onCopyDoneFn = onCopyDoneFn;
                        }}

                        resetPendingBufferMeta() {{
                            this.setPendingBufferMeta({{ componentIdx: null, buffer: null, onCopyDoneFn: null }});
                        }}

                        getPendingBufferMeta() {{ return this.#pendingBufferMeta; }}

                        resetAndNotifyPending(result) {{
                            const f = this.#pendingBufferMeta.onCopyDoneFn;
                            this.resetPendingBufferMeta();
                            if (f) {{ f(result); }}
                        }}

                        setPendingEvent(fn) {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            {debug_log_fn}('[{future_end_class}#setPendingEvent()]', {{
                                waitable: this.#waitable,
                                waitableinSet: this.#waitable.isInSet(),
                                componentIdx: this.#waitable.componentIdx(),
                            }});
                            this.#waitable.setPendingEvent(fn);
                        }}

                        hasPendingEvent() {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            return this.#waitable.hasPendingEvent();
                        }}

                        isInSet() {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            return this.#waitable.isInSet();
                        }}

                        getPendingEvent() {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            {debug_log_fn}('[{future_end_class}#getPendingEvent()]', {{
                                waitable: this.#waitable,
                                waitableinSet: this.#waitable.isInSet(),
                                componentIdx: this.#waitable.componentIdx(),
                            }});
                            const event = this.#waitable.getPendingEvent();
                            return event;
                        }}

                        isDropped() {{ return this.#dropped; }}
                        isPeerDropped() {{ return this.#isPeerDroppedFn(); }}

                        drop() {{
                            if (this.isDropped()) {{ throw new Error('future already dropped'); }}

                            if (this.#pendingBufferMeta.buffer) {{
                                if (!this.#pendingBufferMeta.buffer.isWritable()) {{
                                    throw new Error('non-writable pending buffer during drop (reader blocked)');
                                }}
                                this.resetAndNotifyPending({future_end_class}.CopyResult.DROPPED);
                            }}

                            this.#dropped = true;
                        }}

                    }}
                "#
                );
            }

            Self::FutureReadableEndClass | Self::FutureWritableEndClass => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let (class_name, _future_var_name, _js_future_var_type) = match self {
                    Self::FutureReadableEndClass => (self.name(), "promise", "Promise"),
                    Self::FutureWritableEndClass => (self.name(), "resolve", "Function"),
                    _ => unreachable!(),
                };
                let future_end_class = render_args.require_intrinsic(Self::FutureEndClass);
                let future_value_class =
                    render_args.require_intrinsic(AsyncFutureIntrinsic::FutureValueClass);
                let global_buffer_mgr =
                    render_args.require_intrinsic(Intrinsic::GlobalBufferManager);
                let async_event_code_enum =
                    render_args.require_intrinsic(Intrinsic::AsyncEventCodeEnum);
                let get_or_create_async_state_fn = render_args.require_intrinsic(
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
                );

                // Generate the inner read/write logic necessary for eitther kind of write end
                // this will be called internally (usually during guest reads), via places like
                // `Instruction::FutureRead`/`Instruction::FutureWrite`
                let (_inner_rw_fn_name, inner_rw_fn) = match self {
                    Self::FutureReadableEndClass => (
                        "_read",
                        format!(
                            r#"
                          _read(args) {{
                              const {{ buffer, onCopyDoneFn, componentIdx }} = args;
                              if (!buffer) {{ throw new Error('missing buffer for future read'); }}

                              if (this.isDropped()) {{ throw new Error('cannot read from dropped future'); }}
                              if (buffer.remaining() !== 1) {{
                                  throw new Error(`invalid remaining values in buffer (expecetd one, received [${{buffer.remaining()}}]`);
                              }}

                              const meta = this.getPendingBufferMeta();
                              if (!meta) {{ throw new Error("missing pending buffer metadata"); }}
                              if (!meta.buffer) {{
                                  this.setPendingBufferMeta({{
                                      buffer,
                                      componentIdx,
                                      onCopyDoneFn,
                                  }});
                                  return;
                              }}

                              if (componentIdx === meta.componentIdx && componentIdx !== -1 && !(this.#elemMeta.isNone || this.#elemMeta.isNumeric)) {{
                                  throw new Error('same-component future reads not allowed for non-numeric types');
                              }}

                              buffer.write(meta.buffer.read(1));
                              this.resetAndNotifyPending({future_end_class}.CopyResult.COMPLETED);
                              onCopyDoneFn({future_end_class}.CopyResult.COMPLETED);
                          }}
                        "#,
                        ),
                    ),

                    Self::FutureWritableEndClass => (
                        "_write",
                        format!(
                            r#"
                          _write(args) {{
                              const {{ buffer, onCopyDoneFn, componentIdx }} = args;
                              if (!buffer) {{ throw new Error('missing buffer for future write'); }}

                              if (buffer.remaining() !== 1) {{
                                  throw new Error("invalid remaining capacity for pending buffer");
                              }}

                              if (this.isDropped()) {{
                                  throw new Error('cannot write to dropped future');
                              }}

                              if (this.isPeerDropped()) {{
                                  onCopyDoneFn({future_end_class}.CopyResult.DROPPED);
                                  return;
                              }}

                              const meta = this.getPendingBufferMeta();
                              if (!meta) {{ throw new Error("missing pending buffer metadata"); }}
                              if (!meta.buffer) {{
                                  this.setPendingBufferMeta({{
                                      buffer,
                                      componentIdx,
                                      onCopyDoneFn,
                                  }});
                                  return;
                              }}

                              if (componentIdx === meta.componentIdx && componentIdx !== -1 && !(this.#elemMeta.isNone || this.#elemMeta.isNumeric)) {{
                                  throw new Error('same-component future writes not allowed for non-numeric types');
                              }}

                              meta.buffer.write(buffer.read(1));
                              this.resetAndNotifyPending({future_end_class}.CopyResult.COMPLETED);
                              onCopyDoneFn({future_end_class}.CopyResult.COMPLETED);
                          }}
                        "#
                        ),
                    ),
                    _ => unreachable!(),
                };

                // Read/Write function that is called when a component (guest) is performing the read/write
                let (_guest_rw_fn_name, guest_rw_fn) = match self {
                    Self::FutureReadableEndClass => (
                        "guestRead",
                        format!(
                            r#"
                              // TODO: rename, guestRead also handles host reads (when data is present)...
                              guestRead(args) {{
                                  {debug_log_fn}('[{class_name}#guestRead()] args', args);
                                  const {{
                                      componentIdx,
                                      stringEncoding,
                                      memory,
                                      realloc,
                                      ptr,
                                      data,
                                  }} = args;

                                  if (this.#elemMeta.stringEncoding === undefined && stringEncoding) {{
                                      this.#elemMeta.stringEncoding = stringEncoding;
                                  }}

                                  if (args.getReallocFn && this.#elemMeta.getReallocFn === undefined) {{
                                     this.#elemMeta.getReallocFn = args.getReallocFn;
                                  }}

                                  const elemMeta = this.#elemMeta;

                                  if (this.#elemMeta.isBorrowed) {{
                                      throw new Error('cannot call future.read on a borrow');
                                  }}

                                  let buffer = args.buffer;
                                  if (!buffer) {{
                                      const createBufferRes = {global_buffer_mgr}.createBuffer({{
                                          componentIdx,
                                          memory,
                                          realloc,
                                          start: ptr,
                                          data,
                                          count: 1,
                                          isReadable: this.isWritable(),
                                          isWritable: this.isReadable(),
                                          elemMeta: this.#elemMeta,
                                      }});
                                      buffer = createBufferRes.buffer;
                                  }}

                                  const futureEvent = (res) => {{
                                      if (buffer.remaining() === 0) {{
                                          if (res !== {future_end_class}.CopyResult.COMPLETED) {{
                                              throw new Error('invalid buffer state, expected zero remaining post-completion');
                                          }}
                                      }} else {{
                                          if (res === {future_end_class}.CopyResult.COMPLETED) {{
                                              throw new Error('invalid buffer state, expected 1 remaining post-completion');
                                          }}
                                      }}
                                      if (res === {future_end_class}.CopyResult.DROPPED || res === {future_end_class}.CopyResult.COMPLETED) {{
                                          this.setCopyState({future_end_class}.CopyState.DONE);
                                      }} else {{
                                          this.setCopyState({future_end_class}.CopyState.IDLE);
                                      }}
                                      return {{ code: {async_event_code_enum}.FUTURE_READ, payload0: this.waitableIdx(), payload1: res }};
                                  }};

                                  const isReadableEnd = this.isReadable();
                                  const onCopyDoneFn = (res) => {{
                                      if (res === {future_end_class}.CopyResult.DROPPED && isReadableEnd) {{
                                          throw new Error('cannot read from a dropped future');
                                      }}
                                      this.setPendingEvent(() => futureEvent(res));
                                  }};


                                  // Before performing this read, if we're dealing with a host-controlled
                                  // future, start injecting the write. The injection may depend on sibling
                                  // guest work running, so cleanup is attached without awaiting here; the
                                  // canonical read must be able to return BLOCKED first.
                                  let injectedWritePromise;
                                  if (this.#hostInjectFn) {{
                                      injectedWritePromise = this.#hostInjectFn({{ count: 1 }});
                                  }}

                                  this._read({{
                                      buffer,
                                      onCopyDoneFn,
                                      componentIdx,
                                  }});

                                  if (injectedWritePromise) {{
                                      injectedWritePromise.then(
                                          cleanupFn => cleanupFn(),
                                          err => this.setPendingEvent(() => {{ throw err; }}),
                                      );
                                  }}

                                  return {{ buffer }};
                              }}
                            "#
                        ),
                    ),
                    Self::FutureWritableEndClass => (
                        "guestWrite",
                        format!(
                            r#"
                              guestWrite(args) {{
                                  {debug_log_fn}('[{class_name}#guestWrite()] args', args);
                                  const {{
                                      componentIdx,
                                      stringEncoding,
                                      getReallocFn,
                                      isAsync,
                                      memory,
                                      realloc,
                                      ptr,
                                      data,
                                  }} = args;

                                  if (this.#elemMeta.stringEncoding === undefined && stringEncoding) {{
                                      this.#elemMeta.stringEncoding = stringEncoding;
                                  }}

                                  if (args.getReallocFn && this.#elemMeta.getReallocFn === undefined) {{
                                      this.#elemMeta.getReallocFn = getReallocFn;
                                  }}

                                  const elemMeta = this.#elemMeta;

                                  if (this.#elemMeta.isBorrowed) {{
                                      throw new Error('cannot call future.read on a borrow');
                                  }}

                                  let buffer = args.buffer;
                                  if (!buffer) {{
                                      const createBufferRes = {global_buffer_mgr}.createBuffer({{
                                          componentIdx,
                                          memory,
                                          realloc,
                                          start: ptr,
                                          data,
                                          count: 1,
                                          isReadable: this.isWritable(),
                                          isWritable: this.isReadable(),
                                          elemMeta: this.#elemMeta,
                                      }});
                                      buffer = createBufferRes.buffer;
                                  }}

                                  const futureEvent = (res) => {{
                                      if (buffer.remaining() === 0) {{
                                          if (res !== {future_end_class}.CopyResult.COMPLETED) {{
                                              throw new Error('invalid buffer state, expected zero remaining post-completion');
                                          }}
                                      }} else {{
                                          if (res === {future_end_class}.CopyResult.COMPLETED) {{
                                              throw new Error('invalid buffer state, expected 1 remaining post-completion');
                                          }}
                                      }}
                                      if (res === {future_end_class}.CopyResult.DROPPED || res === {future_end_class}.CopyResult.COMPLETED) {{
                                          this.setCopyState({future_end_class}.CopyState.DONE);
                                      }} else {{
                                          this.setCopyState({future_end_class}.CopyState.IDLE);
                                      }}
                                      return {{ code: {async_event_code_enum}.FUTURE_WRITE, payload0: this.waitableIdx(), payload1: res }};
                                  }};

                                  const onCopyDoneFn = (res) => {{
                                      this.setPendingEvent(() => futureEvent(res));
                                  }};

                                  this._write({{
                                      buffer,
                                      onCopyDoneFn,
                                      componentIdx,
                                  }});

                                  return {{ buffer }};
                              }}
                            "#
                        ),
                    ),
                    _ => unreachable!(),
                };

                // Read/Write function that is called when the host is performing the read/write
                let (_host_rw_fn_name, host_rw_fn) = match self {
                    Self::FutureReadableEndClass => (
                        "hostRead",
                        format!(
                            r#"
                              async hostRead(args) {{
                                  const {{ stringEncoding }} = args;

                                  const {{ buffer }} = await this.guestRead({{
                                      stringEncoding,
                                      isAsync: true,
                                      data: [],
                                      componentIdx: -1,
                                  }});

                                  if (!this.hasPendingEvent()) {{
                                      this.setCopyState({future_end_class}.CopyState.ASYNC_COPYING);

                                       // Wait for the write to complete
                                       await new Promise((resolve) => {{
                                           let waitInterval = setInterval(() => {{
                                               if (!this.hasPendingEvent()) {{ return; }}
                                               clearInterval(waitInterval);
                                               resolve();
                                           }});
                                       }});

                                       if (!this.hasPendingEvent()) {{
                                           throw new Error("missing pending event after blocked future read");
                                       }}
                                  }}

                                  const {{ code, payload0: index, payload1: payload }} = this.getPendingEvent();
                                  if (code !== {async_event_code_enum}.FUTURE_READ) {{
                                      throw new Error(`mismatched event code [${{code}}] for host future read`);
                                  }}
                                  if (index !== this.waitableIdx()) {{ throw new Error('mismatched future end index'); }}

                                  const vs = buffer.read(1);
                                  if (vs.length !== 1) {{ throw new Error('multiple results from future'); }}

                                  // The copy event is published from inside the guest's current
                                  // callback slice.
                                  //
                                  // Here we avoid exposing the lifted value to host code
                                  // until that slice has returned and released the instance lock, because
                                  // the consumer could immediately make a synchronous call on the lifted value
                                  // (e.g. if it's a resource)
                                  const componentIdx = this.getWaitable().componentIdx();
                                  if (componentIdx !== -1) {{
                                      await {get_or_create_async_state_fn}(componentIdx).waitForExclusiveRelease();
                                  }}

                                  return {{ value: vs[0] }};
                              }}
                            "#
                        ),
                    ),
                    Self::FutureWritableEndClass => (
                        "hostWrite",
                        format!(
                            r#"
                              async hostWrite(args) {{
                                  const {{ stringEncoding, value, getReallocFn }} = args;

                                  const {{ buffer }} = await this.guestWrite({{
                                      stringEncoding,
                                      getReallocFn,
                                      // TODO: support sync host writes
                                      isAsync: true,
                                      data: [value],
                                      componentIdx: -1,
                                      componentIdx: -1,
                                  }});

                                  if (!this.hasPendingEvent()) {{
                                      this.setCopyState({future_end_class}.CopyState.ASYNC_COPYING);

                                       // Wait for the write to complete
                                       await new Promise((resolve) => {{
                                           let waitInterval = setInterval(() => {{
                                               if (!this.hasPendingEvent()) {{ return; }}
                                               clearInterval(waitInterval);
                                               resolve();
                                           }});
                                       }});

                                       if (!this.hasPendingEvent()) {{
                                           throw new Error("missing pending event after blocked future write");
                                       }}
                                  }}

                                  const {{ code, payload0: index, payload1: payload }} = this.getPendingEvent();
                                  if (code !== {async_event_code_enum}.FUTURE_WRITE) {{
                                      throw new Error(`mismatched event code [${{code}}] for host future write`);
                                  }}
                                  if (index !== this.waitableIdx()) {{ throw new Error('mismatched future end index'); }}
                              }}
                            "#
                        ),
                    ),
                    _ => unreachable!(),
                };

                let type_getters = match self {
                    Self::FutureWritableEndClass => "
                         isReadable() { return false; }
                         isWritable() { return true; }
                    "
                    .to_string(),
                    Self::FutureReadableEndClass => "
                         isReadable() { return true; }
                         isWritable() { return false; }
                    "
                    .to_string(),
                    _ => unreachable!(),
                };

                let drop_check = match self {
                    Self::FutureReadableEndClass => "".into(),
                    Self::FutureWritableEndClass => {
                        let runtime_error_class =
                            render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                        format!(
                            r#"
                              if (this.isWritable() && !this.isDoneState()) {{
                                  throw new {runtime_error_class}('cannot drop future write end without first writing a value');
                              }}
                            "#
                        )
                    }
                    _ => unreachable!(),
                };

                uwriteln!(
                    output,
                    r#"
                    class {class_name} extends {future_end_class} {{
                        #globalFutureMapRep;
                        #futureTableIdx;
                        #isHostOwned;
                        #hostInjectFn;
                        #elemMeta;
                        #handle;
                        #promise;

                        target;

                        constructor(args) {{
                            {debug_log_fn}('[{class_name}#constructor()] args', args);
                            super(args);

                            if (!args.elemMeta) {{ throw new Error('missing/invalid element meta'); }}
                            this.#elemMeta = args.elemMeta;

                            if (args.tableIdx === undefined) {{ throw new Error('missing index for future table idx'); }}
                            this.#futureTableIdx = args.tableIdx;

                            this.#hostInjectFn = args.hostInjectFn;
                            this.#isHostOwned = args.hostOwned;
                        }}

                        {type_getters}

                        setTarget(tgt) {{ this.target = tgt; }}

                        getElemMeta() {{ return {{...this.#elemMeta}}; }}
                        futureTableIdx() {{ return this.#futureTableIdx; }}
                        setFutureTableIdx(idx) {{ this.#futureTableIdx = idx; }}

                        globalFutureMapRep() {{ return this.#globalFutureMapRep; }}
                        setGlobalFutureMapRep(rep) {{ this.#globalFutureMapRep = rep; }}

                        waitableIdx() {{ return this.getWaitable().idx(); }}
                        setWaitableIdx(idx) {{
                            const w = this.getWaitable();
                            w.setIdx(idx);
                            w.setTarget(`waitable for {class_name} (waitable [${{idx}}])`);
                        }}

                        handle() {{ return this.#handle; }}
                        setHandle(h) {{ this.#handle = h; }}

                        setHostInjectFn(f) {{
                            if (this.#hostInjectFn) {{ throw new Error('host injection fn is already set'); }}
                            this.#hostInjectFn = f;
                        }}

                        promise() {{
                            if (this.#promise) {{ return this.#promise; }}
                            // NOTE: we return a "thenable" here to ensure that simply lifting the future does
                            // not trigger a host read.

                            this.#promise = new {future_value_class}(
                                () => this.hostRead({{ stringEncoding: 'utf8' }})
                            );
                            return this.#promise;
                        }}

                        cancel() {{
                            {debug_log_fn}('[{future_end_class}#cancel()]');
                            this.resetAndNotifyPending({future_end_class}.CopyResult.CANCELLED);
                        }}

                        {inner_rw_fn}
                        {guest_rw_fn}
                        {host_rw_fn}

                        drop() {{
                            {drop_check}
                            super.drop();
                        }}
                    }}
                "#
                );
            }

            Self::InternalFutureClass => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let internal_future_class =
                    render_args.require_intrinsic(Self::InternalFutureClass);
                let write_end_class = render_args.require_intrinsic(Self::FutureWritableEndClass);
                let read_end_class = render_args.require_intrinsic(Self::FutureReadableEndClass);

                uwriteln!(
                    output,
                    r#"
                    class {internal_future_class} {{
                        #globalFutureMapRep;
                        #pendingBufferMeta = {{}}; // Shared between read and write ends
                        #elemMeta;

                        #readEnd;
                        #writeEnd;

                        constructor(args) {{
                            {debug_log_fn}('[{internal_future_class}#constructor()] args', args);
                            if (!args.elemMeta) {{ throw new Error('missing/invalid future element metadata'); }}
                            if (args.tableIdx === undefined) {{ throw new Error('missing/invalid future table idx'); }}
                            if (!args.readWaitable) {{ throw new Error('missing/invalid read waitable'); }}
                            if (!args.writeWaitable) {{ throw new Error('missing/invalid write waitable'); }}
                            const {{
                                tableIdx,
                                elemMeta,
                                readWaitable,
                                writeWaitable,
                            }} = args;

                            this.#elemMeta = args.elemMeta;

                            this.#readEnd = new {read_end_class}({{
                                tableIdx,
                                elemMeta: this.#elemMeta,
                                pendingBufferMeta: this.#pendingBufferMeta,
                                target: "future read end (@ init)",
                                waitable: readWaitable,
                                // Only in-component read-ends need the host inject fn if provided,
                                // as that function will *inject* a write when the future is checked
                                // from inside the guest.
                                hostInjectFn: args.hostInjectFn,
                                isPeerDroppedFn: () => this.#writeEnd?.isDropped() ?? false,
                            }});

                            this.#writeEnd = new {write_end_class}({{
                                tableIdx,
                                elemMeta: this.#elemMeta,
                                pendingBufferMeta: this.#pendingBufferMeta,
                                target: "future write end (@ init)",
                                waitable: writeWaitable,
                                hostOwned: true,
                                isPeerDroppedFn: () => this.#readEnd.isDropped(),
                            }});
                        }}

                        elemMeta() {{ return this.#elemMeta; }}
                        readEnd() {{ return this.#readEnd; }}
                        writeEnd() {{ return this.#writeEnd; }}

                        globalFutureMapRep() {{ return this.#globalFutureMapRep; }}
                        setGlobalFutureMapRep(rep) {{
                            this.#globalFutureMapRep = rep;
                            this.#readEnd.setGlobalFutureMapRep(rep);
                            this.#writeEnd.setGlobalFutureMapRep(rep);
                        }}
                    }}
                "#
                );
            }

            Self::FutureNew => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let future_new_fn = render_args.require_intrinsic(Self::FutureNew);
                let create_future_fn = render_args.require_intrinsic(Self::CreateFuture);
                let current_task_get_fn = render_args
                    .require_intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask));
                let get_or_create_async_state_fn = render_args.require_intrinsic(
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
                );

                uwriteln!(
                    output,
                    r#"
                    function {future_new_fn}(ctx) {{
                        {debug_log_fn}('[{future_new_fn}()] args', {{ ctx }});
                        const {{ componentIdx, futureTableIdx, elemMeta }} = ctx;

                        const taskMeta = {current_task_get_fn}(componentIdx);
                        if (!taskMeta) {{ throw new Error('invalid/missing async task meta'); }}
                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const {{ readEnd, writeEnd }} = {create_future_fn}(cstate, {{
                            tableIdx: futureTableIdx,
                            elemMeta,
                        }});

                        let writeEndWaitableIdx = writeEnd.waitableIdx();
                        let readEndWaitableIdx = readEnd.waitableIdx();

                        return BigInt(writeEndWaitableIdx) << 32n | BigInt(readEndWaitableIdx);
                    }}
                "#
                );
            }

            Self::FutureNewFromLift => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let future_new_from_lift_fn = self.name();
                let global_future_map = render_args.require_intrinsic(Intrinsic::AsyncFuture(
                    AsyncFutureIntrinsic::GlobalFutureMap,
                ));
                let host_future_class = render_args.require_intrinsic(Intrinsic::AsyncFuture(
                    AsyncFutureIntrinsic::HostFutureClass,
                ));

                output.push_str(&format!(
                    r#"
                    function {future_new_from_lift_fn}(ctx) {{
                        {debug_log_fn}('[{future_new_from_lift_fn}()] args', {{ ctx }});
                        const {{
                            componentIdx,
                            futureEndWaitableIdx,
                            futureTableIdx,
                            payloadLiftFn,
                            payloadTypeSize32,
                            payloadLowerFn,
                        }} = ctx;

                        const future = new {host_future_class}({{
                            componentIdx,
                            futureEndWaitableIdx,
                            futureTableIdx,
                            payloadLiftFn: payloadLiftFn,
                            payloadLowerFn: payloadLowerFn,
                        }});

                        const rep = {global_future_map}.insert(future);
                        future.setRep(rep);

                        return future.createUserFuture();
                    }}
                "#
                ));
            }

            Self::FutureWrite | Self::FutureRead => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let get_future_end_fn = render_args.require_intrinsic(Self::GetFutureEnd);
                let get_or_create_async_state_fn = render_args.require_intrinsic(
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
                );
                let current_task_get_fn = render_args
                    .require_intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask));
                let event_code_enum = render_args.require_intrinsic(Intrinsic::AsyncEventCodeEnum);
                let async_blocked_const = render_args.require_intrinsic(Intrinsic::AsyncTask(
                    AsyncTaskIntrinsic::AsyncBlockedConstant,
                ));

                let future_op_fn = self.name();
                let (guest_op_fn, future_end_class) = match self {
                    Self::FutureWrite => (
                        "guestWrite",
                        render_args.require_intrinsic(Self::FutureWritableEndClass),
                    ),
                    Self::FutureRead => (
                        "guestRead",
                        render_args.require_intrinsic(Self::FutureReadableEndClass),
                    ),
                    _ => unreachable!(),
                };
                let future_end_base_class = render_args.require_intrinsic(Self::FutureEndClass);

                let event_code = match self {
                    Self::FutureWrite => format!("{event_code_enum}.FUTURE_WRITE"),
                    Self::FutureRead => format!("{event_code_enum}.FUTURE_READ"),
                    _ => unreachable!(),
                };

                uwriteln!(
                    output,
                    r#"
                    function {future_op_fn}(
                        ctx,
                        futureEndWaitableIdx,
                        ptr,
                    ) {{
                        {debug_log_fn}('[{future_op_fn}()] args', {{
                            ctx,
                            futureEndWaitableIdx,
                            ptr,
                        }});
                        const {{
                            componentIdx,
                            futureTableIdx,
                            memoryIdx,
                            getMemoryFn,
                            reallocIdx,
                            getReallocFn,
                            stringEncoding,
                            isAsync,
                        }} = ctx;

                        const taskMeta = {current_task_get_fn}(componentIdx);
                        if (!taskMeta) {{ throw new Error('missing task metadata during future operation'); }}

                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('missing task in metadata during future operation'); }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        if (!task.mayBlock() && !isAsync) {{
                            throw new Error('only tasks that may block may call future.{future_op_fn}');
                        }}

                        const futureEnd = {get_future_end_fn}({{ tableIdx: futureTableIdx, futureEndWaitableIdx }});
                        if (!futureEnd) {{
                            throw new Error(`missing future with waitable idx [${{futureEndWaitableIdx}}] (component [${{componentIdx}}])`);
                        }}
                        if (!(futureEnd instanceof {future_end_class})) {{
                            throw new Error('invalid future end, expected [{future_end_class}]');
                        }}
                        if (!futureEnd.isIdleState()) {{
                            throw new Error('future state must be idle before {future_op_fn}');
                        }}

                        futureEnd.{guest_op_fn}({{
                            componentIdx,
                            stringEncoding,
                            memory: getMemoryFn?.(),
                            realloc: getReallocFn?.(),
                            getReallocFn,
                            ptr,
                        }});

                        if (!futureEnd.hasPendingEvent()) {{
                            if (isAsync) {{
                                futureEnd.setCopyState({future_end_base_class}.CopyState.ASYNC_COPYING);
                                return {async_blocked_const};
                            }} else {{
                                futureEnd.setCopyState({future_end_base_class}.CopyState.SYNC_COPYING);
                                return task.suspendUntil({{
                                    readyFn: () => futureEnd.hasPendingEvent(),
                                }}).then(() => {{
                                    const {{ code, payload0: index, payload1: payload }} = futureEnd.getPendingEvent();
                                    if (code !== {event_code}) {{
                                        throw new Error(`mismatched event code [${{code}}] (expected {event_code})`);
                                    }}
                                    if (index !== futureEnd.waitableIdx()) {{ throw new Error('mismatched future end index'); }}
                                    return payload;
                                }});
                            }}
                        }}

                        const {{ code, payload0: index, payload1: payload }} = futureEnd.getPendingEvent();
                        if (code !== {event_code}) {{
                             throw new Error(`mismatched event code [${{code}}] (expected {event_code})`);
                         }}
                        if (index !== futureEnd.waitableIdx()) {{ throw new Error('mismatched future end index'); }}

                        return payload;
                    }}
                "#
                );
            }

            Self::FutureCancelRead | Self::FutureCancelWrite => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let get_future_end_fn = render_args.require_intrinsic(Self::GetFutureEnd);
                let remove_future_end_from_table_fn =
                    render_args.require_intrinsic(Self::RemoveFutureEndFromTable);
                let is_cancel_write = matches!(self, Self::FutureCancelWrite);
                let future_end_class = if is_cancel_write {
                    render_args.require_intrinsic(Self::FutureWritableEndClass)
                } else {
                    render_args.require_intrinsic(Self::FutureReadableEndClass)
                };
                let future_cancel_fn = self.name();
                let get_or_create_async_state_fn = render_args.require_intrinsic(
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
                );
                let async_blocked_const = render_args.require_intrinsic(Intrinsic::AsyncTask(
                    AsyncTaskIntrinsic::AsyncBlockedConstant,
                ));
                let async_event_code_enum =
                    render_args.require_intrinsic(Intrinsic::AsyncEventCodeEnum);

                output.push_str(&format!(r#"
                    async function {future_cancel_fn}(
                        ctx,
                        futureEndIdx,
                    ) {{
                        {debug_log_fn}('[{future_cancel_fn}()] args', {{
                            ctx,
                            futureEndWaitableIdx,
                        }});
                        const {{ componentIdx, futureTableIdx, isAsync }} = ctx;

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        let futureEnd = {get_future_end_fn}({{ tableIdx: futureTableIdx, futureEndWaitableIdx }});
                        if (!futureEnd) {{ throw new Error(`missing future end with idx [${{futureEndWaitableIdx}}]`); }}
                        if (!(futureEnd instanceof {future_end_class})) {{
                            throw new Error('invalid future end, expected value of type [{future_end_class}]');
                        }}

                        futureEnd = {remove_future_end_from_table_fn}({{
                            tableIdx: futureTableIdx,
                            futureWaitableIdx: futureEndWaitableIdx,
                        }});
                        if (!futureEnd) {{ throw new Error(`missing future with idx [${{futureEndWaitableIdx}}]`); }}

                        if (!futureEnd.isCopying()) {{ throw new Error('future end is not copying, cannot cancel'); }}

                        if (!futureEnd.hasPendingEvent()) {{
                          // TODO: cancel the shared thing (waitable?)
                          if (!futureEnd.hasPendingEvent()) {{
                            if (!isAsync) {{
                              // TODO: repalce with what task.blockOn used to do
                              // await task.blockOn({{ promise: futureEnd.waitable, isAsync: false }});
                              throw new Error('not implemented');
                            }} else {{
                              return {async_blocked_const};
                            }}
                          }}
                        }}

                        const {{ code, payload0: index, payload1: payload }} = futureEnd.getPendingEvent();
                        if (futureEnd.isCopying()) {{ throw new Error('future end is still in copying state'); }}
                        if (code !== {async_event_code_enum}) {{ throw new Error('unexpected event code [' + code + '], expected [' + {async_event_code_enum} + ']'); }}
                        if (index !== futureEndIdx) {{ throw new Error('index does not match future end'); }}

                        return payload;
                    }}
                "#));
            }

            Self::FutureDropReadable | Self::FutureDropWritable => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let future_drop_fn = self.name();
                let remove_future_end_from_table_fn =
                    render_args.require_intrinsic(Self::RemoveFutureEndFromTable);
                let is_writable = matches!(self, Self::FutureDropWritable);
                let future_end_class = if is_writable {
                    render_args.require_intrinsic(Self::FutureWritableEndClass)
                } else {
                    render_args.require_intrinsic(Self::FutureReadableEndClass)
                };
                let get_or_create_async_state_fn = render_args.require_intrinsic(
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
                );
                output.push_str(&format!(r#"
                    function {future_drop_fn}(ctx, futureEndWaitableIdx) {{
                        {debug_log_fn}('[{future_drop_fn}()] args', {{ ctx }});
                        const {{ componentIdx, futureTableIdx }} = ctx;

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const futureEnd = {remove_future_end_from_table_fn}({{
                            tableIdx: futureTableIdx,
                            futureWaitableIdx: futureEndWaitableIdx
                        }});
                        if (!(futureEnd instanceof {future_end_class})) {{
                            throw new Error('invalid future end, expected [{future_end_class}]');
                        }}

                        futureEnd.drop();
                    }}
                "#));
            }

            Self::FutureTransfer => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let future_transfer_fn = self.name();
                let remove_future_end_from_table_fn =
                    render_args.require_intrinsic(Self::RemoveFutureEndFromTable);
                let add_future_end_to_table_fn =
                    render_args.require_intrinsic(Self::AddFutureEndToTable);
                let get_or_create_async_state_fn = render_args.require_intrinsic(
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState),
                );
                let global_future_table_map =
                    render_args.require_intrinsic(Self::GlobalFutureTableMap);

                output.push_str(&format!(
                    r#"
                    function {future_transfer_fn}(
                        srcFutureWaitableIdx,
                        srcTableIdx,
                        destTableIdx,
                    ) {{
                        {debug_log_fn}('[{future_transfer_fn}()] args', {{
                            srcFutureWaitableIdx,
                            srcTableIdx,
                            destTableIdx,
                        }});

                        const futureMeta = {global_future_table_map}[srcTableIdx];
                        if (!futureMeta) {{ throw new Error('missing future meta during transfer'); }}
                        const componentIdx = futureMeta.componentIdx;

                        // NOTE: no current-task lookup here: per the Canonical ABI the
                        // transfer is a pure table operation between the source and
                        // destination components' waitable tables, and the
                        // return-position transfer of a fused *sync* call runs after
                        // the callee task's teardown (same as stream.transfer).

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate) {{ throw new Error(`missing async state for component [${{componentIdx}}]`); }}

                        const futureEnd = {remove_future_end_from_table_fn}({{ tableIdx: srcTableIdx, futureWaitableIdx: srcFutureWaitableIdx }});
                        if (!futureEnd.isReadable()) {{
                            throw new Error("writable future ends cannot be moved");
                        }}
                        if (futureEnd.isDoneState()) {{
                            throw new Error('future read ends cannot be moved once the value has been delivered');
                        }}

                        const {{ handle, waitableIdx }} = {add_future_end_to_table_fn}({{ tableIdx: destTableIdx, futureEnd }});
                        futureEnd.setTarget(`future read end (waitable [${{waitableIdx}}])`);

                        {debug_log_fn}('[{future_transfer_fn}()] successfully transferred', {{
                            dest: {{
                                futureEndHandle: handle,
                                futureEndWaitableIdx: waitableIdx,
                                tableIdx: destTableIdx,
                            }},
                            src: {{
                                futureEndWaitableIdx: srcFutureWaitableIdx,
                                tableIdx: srcTableIdx,
                            }},
                            componentIdx,
                        }});

                        return waitableIdx;
                    }}
                    "#
                ));
            }

            Self::GenFutureHostInjectFn => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let gen_host_inject_fn = self.name();
                let nested_future_symbol = render_args.require_intrinsic(Self::NestedFutureSymbol);
                let get_error_payload = render_args.require_intrinsic(Intrinsic::GetErrorPayload);
                let track_host_operation =
                    render_args.require_intrinsic(ComponentIntrinsic::TrackHostOperation);

                uwriteln!(
                    output,
                    r#"
                      function {gen_host_inject_fn}(genArgs) {{
                          const {{ promise, hostWriteEnd, stringEncoding, getReallocFn }} = genArgs;
                          if (promise instanceof Promise) {{
                              promise.catch(() => {{}});
                          }}
                          let done;

                          return async function generateFutureHostInject(args) {{
                              let {{ count }} = args;
                              if (count !== 1) {{ throw new Error('invalid count'); }}

                              // Futures should only be completed once
                              if (done) {{
                                  return () => {{ throw new Error('cannot inject write: future already completed'); }}
                              }}

                              // The host *must* write something to this channel before closing it
                              if (hostWriteEnd.isDoneState()) {{
                                  return () => {{ throw new Error('cannot inject write: host must write to future before closing'); }}
                              }}

                              let value;
                              try {{
                                  value = await {track_host_operation}(() => promise);
                              }} catch (err) {{
                                  const elemMeta = hostWriteEnd.getElemMeta();
                                  if (!elemMeta.payloadTypeName?.startsWith('Result(')) {{
                                      {debug_log_fn}("failed to inject host write", err);
                                      throw new Error("cannot inject write: promise failed");
                                  }}
                                  value = {{ tag: 'err', val: {get_error_payload}(err) }};
                              }}

                              try {{
                                  // If we've read a nested promise from the outside,
                                  // we must convert the value that we get back into a future,
                                  // because we are not at the lowest level yet.
                                  if (value && typeof value === 'object' && value[{nested_future_symbol}]) {{
                                      value = Promise.resolve(value);
                                  }}

                                  await hostWriteEnd.hostWrite({{ stringEncoding, value, getReallocFn }});
                              }} catch (err) {{
                                  {debug_log_fn}("failed to inject host write", err);
                                  throw new Error("cannot inject write: promise failed");
                              }}

                              hostWriteEnd.getPendingEvent();
                              hostWriteEnd.drop();

                              return () => {{
                                  // After the write is finished, we consume the event that was generated
                                  // by the just-in-time write (and the subsequent read), if one was generated
                                  if (hostWriteEnd.hasPendingEvent()) {{ hostWriteEnd.getPendingEvent(); }}
                              }};
                          }};
                      }}
                    "#
                );
            }

            Self::IsFutureLowerableObject => {
                let is_future_lowerable_object = self.name();
                output.push_str(&format!(
                    r#"
                      function {is_future_lowerable_object}(obj) {{
                          if (typeof obj !== 'object') {{ return false; }}
                          return obj instanceof Promise
                               || 'then' in obj && typeof obj.then === 'function';
                      }}
                    "#
                ));
            }
        }
    }
}
