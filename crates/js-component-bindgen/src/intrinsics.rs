use std::collections::BTreeSet;
use std::fmt::Write;

use crate::source::Source;
use crate::uwrite;

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

    /// Enable debug logging
    DebugLog,

    /// Convert a i32 to a char with the i32 representing a UTF16 point
    I32ToCharUtf16,

    /// Convert a i32 to a char with the i32 representing a UTF8 point
    I32ToCharUtf8,

    /// # Resource table slab implementation
    ///
    /// Resource table slab implementation on top of a fixed "SMI" array in JS engines,
    /// a fixed contiguous array of u32s, for performance. We don't use a typed array because
    /// we need resizability without reserving a large buffer.
    ///
    /// The flag bit for all data values is 1 << 30. We avoid the use of the highest bit
    /// entirely to not trigger SMI deoptimization.
    ///
    /// Each entry consists of a pair of u32s, either a free list entry, or a data entry.
    ///
    /// ## Free List Entries:
    ///
    ///  |    index (x, u30)   |       ~unused~      |
    ///  |------ 32 bits ------|------ 32 bits ------|
    ///  | 01xxxxxxxxxxxxxxxxx | ################### |
    ///
    /// Free list entries use only the first value in the pair, with the high bit always set
    /// to indicate that the pair is part of the free list. The first pair of entries at
    /// indices 0 and 1 is the free list head, with the initial values of 1 << 30 and 0
    /// respectively. Removing the 1 << 30 flag gives 0, which indicates the end of the free
    /// list.
    ///
    /// ## Data Entries:
    ///
    ///  |    scope (x, u30)   | own(o), rep(x, u30) |
    ///  |------ 32 bits ------|------ 32 bits ------|
    ///  | 00xxxxxxxxxxxxxxxxx | 0oxxxxxxxxxxxxxxxxx |
    ///
    /// Data entry pairs consist of a first u30 scope entry and a second rep entry. The field
    /// is only called the scope for interface shape consistency, but is actually used for the
    /// ref count for own handles and the scope id for borrow handles. The high bit is never
    /// set for this first entry to distinguish the pair from the free list. The second item
    /// in the pair is the rep for  the resource, with the high bit in this entry indicating
    /// if it is an own handle.
    ///
    /// The free list numbering and the handle numbering are the same, indexing by pair, so to
    /// get from a handle or free list numbering to an index, we multiply by two.
    ///
    /// For example, to access a handle n, we read the pair of values n * 2 and n * 2 + 1 in
    /// the array to get the context and rep respectively. If the high bit is set on the
    /// context, we throw for an invalid handle. The rep value is masked out from the
    /// ownership high bit, also throwing for an invalid zero rep.
    ///
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

    /////////////////////
    // Data structures //
    /////////////////////
    /// Global that stores the current task for a given invocation.
    ///
    /// This global variable is populated *only* when we are performing a call
    /// that was triggered by an async lifted export.
    ///
    /// You can consider the type of the global variable to be:
    ///
    /// ```ts
    /// type Task = {
    ///     componentIdx: number,
    ///     storage: [number]
    ///     alwaysTaskReturn: boolean,
    ///     returnCalls: number,
    ///     requested: boolean,
    ///     borrowedHandles: Record<number, boolean>,
    ///     cancelled: boolean,
    /// }
    ///
    /// type GlobalAsyncCurrentTaskMap = Map<number, Task>;
    /// ```
    GlobalAsyncCurrentTaskMap,

    /// Function that retrieves the current global async current task
    GetCurrentTask,

    /// Global that stores backpressure by component instance
    ///
    /// A component instance *not* having a value in this map indicates that
    /// `backpressure.set` has not been called.
    ///
    /// A `true`/`false` in the value corresponding to a component instance indicates that
    /// backpressure.set has been called at least once, with the last call containing the
    /// given value.
    ///
    /// ```ts
    /// type GlobalBackpressureMap = Map<number, bool>;
    /// ```
    GlobalBackpressureMap,

    /// Global that stores async state by component instance
    ///
    /// ```ts
    /// type ComponentAsyncState = {
    ///     mayLeave: boolean,
    /// };
    /// type GlobalBackpressureMap = Map<number, ComponentAsyncState>;
    /// ```
    GlobalAsyncStateMap,

    /// Function that retrieves or creates async state for a given component instance
    GetOrCreateAsyncState,

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

    /// Set the value of a context local storage for the current task/thread
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type SlotIndex = 0 | 1;
    /// function contextSet(componentIdx: number, taskId: i32, slot: SlotIndex, value: number);
    /// ```
    ///
    ContextSet,

    /// Gets the value stored in context local storage for the current task/thread
    ///
    /// Guest code generally uses this to reference internally stored context local storage,
    /// whether that is task local or thread local.
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type SlotIndex = 0 | 1;
    /// function contextGet(componentIdx: number, taskId: i32, slot: SlotIndex): i32;
    /// ```
    ///
    ContextGet,

    /// Set the backpressure for a given component instance
    ///
    /// Guest code generally uses this to reference internally stored context local storage,
    /// whether that is task local or thread local.
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type SlotIndex = 0 | 1;
    /// function contextGet(componentIdx: number, taskId: i32, slot: SlotIndex): i32;
    /// ```
    BackpressureSet,

    /// Cancel the current async task for a given component instance
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function taskCancel(componentIdx: number, isAsync: boolean);
    /// ```
    TaskCancel,

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
    LiftFlatBoolFromStorage,

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
    LiftFlatS8FromStorage,

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
    LiftFlatU8FromStorage,

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
    LiftFlatS16FromStorage,

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
    LiftFlatU16FromStorage,

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
    LiftFlatS32FromStorage,

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
    LiftFlatU32FromStorage,

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
    LiftFlatS64FromStorage,

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
    LiftFlatU64FromStorage,

    /// Lift a f32 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    LiftFlatFloat32FromStorage,

    /// Lift a f64 into provided storage given core type(s)
    ///
    /// This function is of the form:
    ///
    /// ```ts
    /// type u32 = number;
    /// (coreVals: u32[], ptr: u32, len: u32) => void;
    /// ```
    LiftFlatFloat64FromStorage,

    /// Lift a char into provided storage given core type(s) that represent utf8
    LiftFlatCharUtf8FromStorage,

    /// Lift a char into provided storage given core type(s) that represent utf16
    LiftFlatCharUtf16FromStorage,

    /// Lift a UTF8 string into provided storage given core type(s)
    LiftFlatStringUtf8FromStorage,

    /// Lift a UTF16 string into provided storage given core type(s)
    LiftFlatStringUtf16FromStorage,

    /// Lift a record into provided storage given core type(s)
    LiftFlatRecordFromStorage,

    /// Lift a variant into provided storage given core type(s)
    LiftFlatVariantFromStorage,

    /// Lift a list into provided storage given core type(s)
    LiftFlatListFromStorage,

    /// Lift a tuple into provided storage given core type(s)
    LiftFlatTupleFromStorage,

    /// Lift flags into provided storage given core type(s)
    LiftFlatFlagsFromStorage,

    /// Lift flags into provided storage given core type(s)
    LiftFlatEnumFromStorage,

    /// Lift an option into provided storage given core type(s)
    LiftFlatOptionFromStorage,

    /// Lift a result into provided storage given core type(s)
    LiftFlatResultFromStorage,

    /// Lift a owned resource into provided storage given core type(s)
    LiftFlatOwnFromStorage,

    /// Lift a borrowed resource into provided storage given core type(s)
    LiftFlatBorrowFromStorage,

    /// Lift a future into provided storage given core type(s)
    LiftFlatFutureFromStorage,

    /// Lift a stream into provided storage given core type(s)
    LiftFlatStreamFromStorage,

    /// Lift an error-context into provided storage given core type(s)
    LiftFlatErrorContextFromStorage,
}

/// Emits the intrinsic `i` to this file and then returns the name of the
/// intrinsic.
pub fn render_intrinsics(
    intrinsics: &mut BTreeSet<Intrinsic>,
    no_nodejs_compat: bool,
    instantiation: bool,
) -> Source {
    let mut output = Source::default();

    // Always include debug logging
    intrinsics.insert(Intrinsic::DebugLog);

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

    if intrinsics.contains(&Intrinsic::ContextGet) || intrinsics.contains(&Intrinsic::ContextSet) {
        intrinsics.extend([
            &Intrinsic::GlobalAsyncCurrentTaskMap,
            &Intrinsic::GetCurrentTask,
        ]);
    }

    if intrinsics.contains(&Intrinsic::BackpressureSet) {
        intrinsics.extend([&Intrinsic::GlobalBackpressureMap]);
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
                // TODO(async): write results into provided memory, perform checks for task & result types
                // see: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-taskreturn
                let task_return_fn = Intrinsic::TaskReturn.name();
                let task_map = Intrinsic::GlobalAsyncCurrentTaskMap.name();

                output.push_str(&format!("
                    function {task_return_fn}(componentIdx, memory, callbackFnIdx, liftFns, vals, storagePtr, storageLen) {{
                        const task = {task_map}.get(componentIdx);
                        if (!task) {{ throw new Error('invalid/missing async task'); }}
                        task.callbackFnIdx = callbackFnIdx;

                        const originalPtr = storagePtr;
                        const results = [];
                        for (const liftFn of liftFns) {{
                            if (storageLen <= 0) {{ throw new Error('ran out of storage while writing'); }}
                            const bytesWritten = liftFn(memory, vals, storagePtr, storageLen);
                            storagePtr += bytesWritten;
                            storageLen -= bytesWritten;
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

            // TODO(async): remove new task hack once tasks are present as they should be
            // TODO(async): context-get is NOT indexed by sub-component -- need to be able to get ONE task?
            // TODO(async): re-read docs on re-entrancy
            Intrinsic::GetCurrentTask => {
                let current_task_get_fn = Intrinsic::GetCurrentTask.name();
                let global_task_map = Intrinsic::GlobalAsyncCurrentTaskMap.name();
                output.push_str(&format!("
                    function {current_task_get_fn}(componentIdx) {{
                        componentIdx = componentIdx ?? 0;
                        if (!{global_task_map}.has(componentIdx)) {{
                            {global_task_map}.set(componentIdx, {{
                                componentIdx,
                                storage: [null, null],
                                cancelled: false,
                                alwaysTaskReturn: false,
                                returnCalls: 0,
                                requested: false,
                                borrowedHandles: {{}},
                                cancelled: false,
                            }});
                        }}

                        return {global_task_map}.get(componentIdx);
                    }}
                "));
            }

            Intrinsic::ContextSet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let context_set_fn = Intrinsic::ContextSet.name();
                let current_task_get_fn = Intrinsic::GetCurrentTask.name();
                output.push_str(&format!("
                    function {context_set_fn}(slot, value) {{
                        {debug_log_fn}('[{context_set_fn}()] args', {{ slot, value }});
                        const task = {current_task_get_fn}();
                        if (!task) {{ throw new Error('failed to retrieve current task'); }}
                        if (slot < 0 || value.len < slot) {{ throw new Error('invalid slot for current task'); }}
                        task.storage[slot] = value;
                    }}
                "));
            }

            Intrinsic::ContextGet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let context_get_fn = Intrinsic::ContextGet.name();
                let current_task_get_fn = Intrinsic::GetCurrentTask.name();
                output.push_str(&format!("
                    function {context_get_fn}(slot) {{
                        {debug_log_fn}('[{context_get_fn}()] args', {{ slot }});
                        const task = {current_task_get_fn}();
                        if (!task) {{ throw new Error('failed to retrieve current task'); }}
                        if (slot < 0 || slot > task.storage.length) {{ throw new Error('invalid slot for current task'); }}
                        if (task.storage[slot] === null) {{ throw new Error('slot not set before get'); }}
                        return task.storage[slot];
                    }}
                "));
            }

            Intrinsic::GlobalAsyncCurrentTaskMap => {
                let var_name = Intrinsic::GlobalAsyncCurrentTaskMap.name();
                output.push_str(&format!("const {var_name} = new Map();\n"));
            }

            Intrinsic::GlobalBackpressureMap => {
                let var_name = Intrinsic::GlobalBackpressureMap.name();
                output.push_str(&format!("const {var_name} = new Map();\n"));

            }

            Intrinsic::GlobalAsyncStateMap => {
                let var_name = Intrinsic::GlobalAsyncStateMap.name();
                output.push_str(&format!("const {var_name} = new Map();\n"));
            }

            Intrinsic::DebugLog => {
                let fn_name = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    const {fn_name} = (...args) => {{
                        if (!globalThis?.process?.env?.JCO_DEBUG) {{ return; }}
                        console.debug(...args);
                    }}
                "));
            }

            Intrinsic::I32ToCharUtf16 => {
                output.push_str(&format!("
                    function _i32ToCharUTF16 = (n) => {{
                        if (!n || typeof n !== 'number') {{ throw new Error('invalid i32'); }}
                        if (n < 0) {{ throw new Error('i32 must be greater than zero'); }}
                        if (n >= 0x110000) {{ throw new Error('invalid i32, out of range'); }}
                        if (0xD800 <= n && n <= 0xDFFF) {{ throw new Error('invalid i32 out of range'); }}
                        return String.fromCharCode(n);
                    }}
                "));
            }

            Intrinsic::I32ToCharUtf8 => {
                output.push_str(&format!("
                    function _i32ToCharUTF8 = (n) => {{
                        if (!n || typeof n !== 'number') {{ throw new Error('invalid i32'); }}
                        if (n < 0) {{ throw new Error('i32 must be greater than zero'); }}
                        if (n >= 0x110000) {{ throw new Error('invalid i32, out of range'); }}
                        if (0xD800 <= n && n <= 0xDFFF) {{ throw new Error('invalid i32 out of range'); }}
                        return new TextDecoder().decode(new Uint8Array([n]));
                    }}
                "));
            }

            // TODO(async): memory is sometimes missing (when we're dealing with stack values??)

            Intrinsic::LiftFlatBoolFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatBoolFromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatBoolFromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] !== 0 && vals[0] !== 1) {{ throw new Error('invalid value for core value representing bool'); }}
                        new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
                        return 1;
                    }}
                "));
            }

            Intrinsic::LiftFlatS8FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatS8FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatS8FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 127 || vals[0] < -128) {{ throw new Error('invalid value for core value representing s8'); }}
                        new DataView(memory.buffer).setInt32(storagePtr, vals[0], true);
                        return 8;
                    }}
                "));
            }

            Intrinsic::LiftFlatU8FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatU8FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatU8FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 255 || vals[0] < 0) {{ throw new Error('invalid value for core value representing u8'); }}
                        new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
                        return 8;
                    }}
                "));
            }

            Intrinsic::LiftFlatS16FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatS16FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatS16FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 32_767 || vals[0] < -32_768) {{ throw new Error('invalid value for core value representing s16'); }}
                        new DataView(memory.buffer).setInt16(storagePtr, vals[0], true);
                        return 16;
                    }}
                "));
            }

            Intrinsic::LiftFlatU16FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatU16FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatU16FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 65_535 || vals[0] < 0) {{ throw new Error('invalid value for core value representing u16'); }}
                        new DataView(memory.buffer).setUint16(storagePtr, vals[0], true);
                        return 16;
                    }}
                "));
            }

            Intrinsic::LiftFlatS32FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatS32FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatS32FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 2_147_483_647 || vals[0] < -2_147_483_648) {{ throw new Error('invalid value for core value representing s32'); }}
                        new DataView(memory.buffer).setInt32(storagePtr, vals[0], true);
                        return 32;
                    }}
                "));
            }

            Intrinsic::LiftFlatU32FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatU32FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatU32FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 4_294_967_295 || vals[0] < 0) {{ throw new Error('invalid value for core value representing u32'); }}
                        new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
                        return 32;
                    }}
                "));
            }

            Intrinsic::LiftFlatS64FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatS64FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatS64FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 9_223_372_036_854_775_807n || vals[0] < -9_223_372_036_854_775_808n) {{ throw new Error('invalid value for core value representing s64'); }}
                        new DataView(memory.buffer).setBigInt64(storagePtr, vals[0], true);
                        return 64;
                    }}
                "));
            }

            Intrinsic::LiftFlatU64FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatU64FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatU64FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        if (vals[0] > 18_446_744_073_709_551_615n || vals[0] < 0n) {{ throw new Error('invalid value for core value representing u64'); }}
                        new DataView(memory.buffer).setBigUint64(storagePtr, vals[0], true);
                        return 64;
                    }}
                "));
            }

            Intrinsic::LiftFlatFloat32FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatFloat32FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatFloat32FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setFloat32(storagePtr, vals[0], true);
                        return 32;
                    }}
                "));
            }

            Intrinsic::LiftFlatFloat64FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatFloat64FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatFloat64FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setFloat64(storagePtr, vals[0], true);
                        return 64;
                    }}
                "));
            }

            Intrinsic::LiftFlatCharUtf16FromStorage => {
                let i32_to_char_fn = Intrinsic::I32ToCharUtf16.name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatCharUTF16FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatCharUTF16FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setFloat64(storagePtr, {i32_to_char_fn}(vals[0]), true);
                        return 4;
                    }}
                "));
            }

            Intrinsic::LiftFlatCharUtf8FromStorage => {
                let i32_to_char_fn = Intrinsic::I32ToCharUtf8.name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatCharUTF8FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatStringUTF16FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setUint32(storagePtr, {i32_to_char_fn}(vals[0]), true);
                        return 4;
                    }}
                "));
            }

            Intrinsic::LiftFlatStringUtf16FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatStringUTF16FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatStringUTF16FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
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

            Intrinsic::LiftFlatStringUtf8FromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatStringUTF8FromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatStringUTF8FromStorage()] args', {{ memory, vals, storagePtr, storageLen }});
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

            // TODO(async): alignment -- before each read is performed, we need to align the pointer to the
            // alignment of the type of the field...
            // (this means moving forward slightly? going to the next point! => ceil(ptr / alignment) * alignment
            Intrinsic::LiftFlatRecordFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatRecordFromStorage(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatVariantFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
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

            Intrinsic::LiftFlatVariantFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatVariantFromStorage(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatVariantFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
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

            // TODO(async): Determine list length! only know the byte size
            Intrinsic::LiftFlatListFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatListFromStorage(elemSize, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatListFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
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

            Intrinsic::LiftFlatTupleFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatTupleFromStorage(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatTupleFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
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

            Intrinsic::LiftFlatFlagsFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatFlagsFromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatFlagsFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        if (vals.length != 1) {{ throw new Error('unexpected number of core vals'); }}
                        new DataView(memory.buffer).setInt32(storagePtr, vals[0], true);
                        return 4;
                    }}
                "));
            }

            Intrinsic::LiftFlatEnumFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatEnumFromStorage(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatEnumFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
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

            Intrinsic::LiftFlatOptionFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatOptionFromStorage(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatOptionFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
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

            Intrinsic::LiftFlatResultFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatResultFromStorage(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatResultFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
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

            Intrinsic::LiftFlatOwnFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatOwnFromStorage(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatOwnFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for owned resources not yet implemented!');
                    }}
                "));
            }

            Intrinsic::LiftFlatBorrowFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatBorrowFromStorage(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatBorrowFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for borrowed resources not yet implemented!');
                    }}
                "));
            }

            Intrinsic::LiftFlatFutureFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatFutureFromStorage(memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatFutureFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for futures not yet implemented!');
                    }}
                "));
            }

            Intrinsic::LiftFlatStreamFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatStreamFromStorage(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatStreamFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for streams not yet implemented!');
                    }}
                "));
            }

            Intrinsic::LiftFlatErrorContextFromStorage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!("
                    function _liftFlatErrorContextFromStorage(size, memory, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[_liftFlatErrorContextFromStorage()] args', {{ size, memory, vals, storagePtr, storageLen }});
                        throw new Error('flat lift for error-contexts not yet implemented!');
                    }}
                "));
            }

            Intrinsic::BackpressureSet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let backpressure_set_fn = Intrinsic::BackpressureSet.name();
                let bp_map = Intrinsic::GlobalBackpressureMap.name();
                output.push_str(&format!("
                    function {backpressure_set_fn}(ciid, value) {{
                        {debug_log_fn}('[{backpressure_set_fn}()] args', {{ ciid, value }});
                        if (typeof value !== 'number') {{ throw new TypeError('invalid value for backpressure set'); }}
                        {bp_map}.set(ciid, value !== 0);
                    }}
                "));
            }

            Intrinsic::TaskCancel => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let task_cancel_fn = Intrinsic::BackpressureSet.name();
                let current_task_get_fn = Intrinsic::GetCurrentTask.name();
                let get_or_create_async_state_fn = Intrinsic::GetOrCreateAsyncState.name();
                output.push_str(&format!("
                    function {task_cancel_fn}(ciid, isAsync) {{
                        {debug_log_fn}('[{task_cancel_fn}()] args', {{ ciid, value }});

                        const state = {get_or_create_async_state_fn}(ciid);
                        if (!state.mayLeave) {{ throw new Error('task is not marked as may leave, cannot be cancelled'); }}

                        const task = {current_task_get_fn}(ciid);
                        if (task.sync && !task.alwaysTaskReturn) {{
                            throw new Error('cannot cancel sync tasks without always task return set');
                        }}
                        if (!task.requested) {{ throw new Error('task cancellation has not been requested'); }}
                        if (task.borrowedHandles.length > 0) {{ throw new Error('task still has borrow handles'); }}
                        if (task.returnCalls > 0) {{ throw new Error('cannot cancel task that has already returned a value'); }}
                        if (task.cancelled) {{ throw new Error('cannot cancel task that has already been cancelled'); }}

                        task.cancelled = true;
                    }}
                "));
            }

            Intrinsic::GetOrCreateAsyncState => {
                let get_state_fn = Intrinsic::GetOrCreateAsyncState.name();
                let map = Intrinsic::GlobalAsyncStateMap.name();
                output.push_str(&format!("
                    function {get_state_fn}(componentIdx, init) {{
                        if (!{map}.has(componentIdx)) {{
                            {map}.set(componentIdx, {{
                                mayLeave: false
                                ...(init || {{}}),
                            }});
                        }}

                        return {map}.get(componentIdx);
                    }}
                "));
            },


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

            Intrinsic::DebugLog => "_debugLog",

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

            // General Async
            Intrinsic::GlobalAsyncStateMap => "ASYNC_STATE",
            Intrinsic::GetOrCreateAsyncState => "getOrCreateAsyncState",

            // Tasks
            Intrinsic::TaskReturn => "taskReturn",
            Intrinsic::SubtaskDrop => "subtaskDrop",

            // Context
            Intrinsic::ContextSet => "contextSet",
            Intrinsic::ContextGet => "contextGet",

            // Backpressure
            Intrinsic::BackpressureSet => "backpressureSet",
            Intrinsic::GlobalBackpressureMap => "BACKPRESSURE",

            // Tasks
            Intrinsic::TaskCancel => "taskCancel",

            // Helpers for working with async state
            Intrinsic::GetCurrentTask => "getCurrentTask",
            Intrinsic::GlobalAsyncCurrentTaskMap => "ASYNC_TASKS_BY_COMPONENT_IDX",

            // Type conversions
            Intrinsic::I32ToCharUtf8 => "_i32ToCharUtf8",
            Intrinsic::I32ToCharUtf16 => "_i32ToCharUtf16",

            // Lift helpers for various types
            Intrinsic::LiftFlatBoolFromStorage => "_liftFlatBoolFromStorage",
            Intrinsic::LiftFlatS8FromStorage => "_liftFlatS8FromStorage",
            Intrinsic::LiftFlatU8FromStorage => "_liftFlatU8FromStorage",
            Intrinsic::LiftFlatS16FromStorage => "_liftFlatS16FromStorage",
            Intrinsic::LiftFlatU16FromStorage => "_liftFlatU16FromStorage",
            Intrinsic::LiftFlatS32FromStorage => "_liftFlatS32FromStorage",
            Intrinsic::LiftFlatU32FromStorage => "_liftFlatU32FromStorage",
            Intrinsic::LiftFlatS64FromStorage => "_liftFlatS64FromStorage",
            Intrinsic::LiftFlatU64FromStorage => "_liftFlatU64FromStorage",
            Intrinsic::LiftFlatFloat32FromStorage => "_liftFlatFloat32FromStorage",
            Intrinsic::LiftFlatFloat64FromStorage => "_liftFlatFloat64FromStorage",
            Intrinsic::LiftFlatCharUtf16FromStorage => "_liftFlatCharUTF16FromStorage",
            Intrinsic::LiftFlatCharUtf8FromStorage => "_liftFlatCharUTF8FromStorage",
            Intrinsic::LiftFlatStringUtf8FromStorage => "_liftFlatStringUTF8FromStorage",
            Intrinsic::LiftFlatStringUtf16FromStorage => "_liftFlatStringUTF16FromStorage",
            Intrinsic::LiftFlatRecordFromStorage => "_liftFlatRecordFromStorage",
            Intrinsic::LiftFlatVariantFromStorage => "_liftFlatVariantFromStorage",
            Intrinsic::LiftFlatListFromStorage => "_liftFlatListFromStorage",
            Intrinsic::LiftFlatTupleFromStorage => "_liftFlatTupleFromStorage",
            Intrinsic::LiftFlatFlagsFromStorage => "_liftFlatFlagsFromStorage",
            Intrinsic::LiftFlatEnumFromStorage => "_liftFlatEnumFromStorage",
            Intrinsic::LiftFlatOptionFromStorage => "_liftFlatOptionFromStorage",
            Intrinsic::LiftFlatResultFromStorage => "_liftFlatResultFromStorage",
            Intrinsic::LiftFlatOwnFromStorage => "_liftFlatOwnFromStorage",
            Intrinsic::LiftFlatBorrowFromStorage => "_liftFlatBorrowFromStorage",
            Intrinsic::LiftFlatFutureFromStorage => "_liftFlatFutureFromStorage",
            Intrinsic::LiftFlatStreamFromStorage => "_liftFlatStreamFromStorage",
            Intrinsic::LiftFlatErrorContextFromStorage => "_liftFlatErrorContextFromStorage",
        }
    }
}
