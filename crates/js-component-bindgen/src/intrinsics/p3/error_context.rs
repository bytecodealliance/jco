//! Intrinsics that represent helpers that implement error contexts

use crate::{intrinsics::Intrinsic, source::Source};

/// This enum contains intrinsics that implement error contexts
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ErrCtxIntrinsic {
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
    ComponentGlobalTable,

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
    ComponentLocalTable,

    /// Create a new error context
    New,

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
    Drop,

    /// Transfer a remote error context to a local one, from one component to another
    ///
    /// Error contexts are stored and managed via the ErrorContexts intrinsic,
    /// and this intrinsic builds on that by implementing a function that will
    /// move an error context with a handle from one component that owns it to another.
    ///
    /// This intrinsic is normally invoked when an error-context is passed across a component
    /// boundary (ex. function output, closing a stream/future with an error, etc.)
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
    Transfer,

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
    DebugMessage,

    /// Retrieve the per component sparse array lookup of error contexts
    ///
    /// See [`Intrinsics::ErrorcontextComponentLocalTable`] for the shape of the lookup.
    ///
    /// This is a utility function that is used internally but does not translate to an actual component model intrinsic.
    GetLocalTable,

    /// Retrieve the component-global rep for a given component-local error-context handle
    ///
    /// See [`Intrinsics::ErrorcontextComponentLocalTable`] for the shape of the per-component error-context table.
    ///
    /// This is a utility function that is used internally but does not translate to an actual component model intrinsic.
    GetHandleRep,

    /// Increment the ref count for a component-global error-context
    ///
    /// See [`Intrinsics::ErrorcontextComponentLocalTable`] for the shape of the global error-context table.
    ///
    /// This is a utility function that is used internally but does not translate to an actual component model intrinsic.
    GlobalRefCountAdd,

    /// Create a local handle in a given component table
    ///
    /// See [`Intrinsics::ErrorcontextComponentLocalTable`] for the shape of the global error-context table.
    ///
    /// Note that this function is expected to receive a table *already* indexed by component.
    ///
    /// This is a utility function that is used internally but does not translate to an actual component model intrinsic.
    CreateLocalHandle,

    /// Reserve a new error context at the global scope, given a debug message to use
    ReserveGlobalRep,
}

impl ErrCtxIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
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
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::ComponentGlobalTable => "errCtxGlobal",
            Self::ComponentLocalTable => "errCtxLocal",
            Self::New => "errCtxNew",
            Self::Drop => "errCtxDrop",
            Self::Transfer => "errCtxTransfer",
            Self::DebugMessage => "errCtxDebugMessage",
            Self::GetHandleRep => "errCtxGetHandleRep",
            Self::GlobalRefCountAdd => "errCtxGlobalRefCountAdd",
            Self::GetLocalTable => "errCtxGetLocalTable",
            Self::CreateLocalHandle => "errCtxCreateLocalHandle",
            Self::ReserveGlobalRep => "errCtxReserveGlobalRep",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::ComponentGlobalTable => {
                let name = Self::ComponentGlobalTable.name();
                output.push_str(&format!("const {name} = new Map();"));
            }

            Self::ComponentLocalTable => {
                let name = Self::ComponentLocalTable.name();
                output.push_str(&format!("const {name} = new Map();"));
            }

            Self::New => {
                let create_local_handle_fn = Self::CreateLocalHandle.name();
                let reserve_global_err_ctx_fn = Self::ReserveGlobalRep.name();
                let new_fn = Self::New.name();
                let get_local_tbl_fn = Self::GetLocalTable.name();
                output.push_str(&format!(
                    "
                    function {new_fn}(componentIdx, errCtxTblIdx, readInputStrFn, msgPtr, msgLen) {{
                        const componentTable = {get_local_tbl_fn}(componentIdx, errCtxTblIdx);
                        const debugMessage = readInputStrFn(msgPtr, msgLen);
                        const rep = {reserve_global_err_ctx_fn}(debugMessage, 0);
                        return {create_local_handle_fn}(componentTable, rep);
                    }}
                "
                ));
            }

            Self::DebugMessage => {
                let global_tbl = Self::ComponentGlobalTable.name();
                let err_ctx_debug_msg_fn = Self::DebugMessage.name();
                let get_local_tbl_fn = Self::GetLocalTable.name();
                output.push_str(&format!("
                    function {err_ctx_debug_msg_fn}(componentIdx, errCtxTblIdx, opts, writeOutputStrFn, handle, outputStrPtr) {{
                        const componentTable = {get_local_tbl_fn}(componentIdx, errCtxTblIdx);
                        if (!componentTable.get(handle)) {{ throw new Error('missing error-context in component while retrieving debug msg'); }}
                        const rep = componentTable.get(handle).rep;
                        const msg = {global_tbl}.get(rep).debugMessage;
                        writeOutputStrFn(msg, outputStrPtr)
                    }}
                "));
            }

            Self::Drop => {
                let global_ref_count_add_fn = Self::GlobalRefCountAdd.name();
                let global_tbl = Self::ComponentGlobalTable.name();
                let err_ctx_drop_fn = Self::Drop.name();
                let get_local_tbl_fn = Self::GetLocalTable.name();
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
            }

            Self::Transfer => {
                let get_local_tbl_fn = Self::GetLocalTable.name();
                let drop_fn = Self::Drop.name();
                let get_handle_rep_fn = Self::GetHandleRep.name();
                let global_ref_count_add_fn = Self::GlobalRefCountAdd.name();
                let err_ctx_transfer_fn = Self::Transfer.name();
                let create_local_handle_fn = Self::CreateLocalHandle.name();
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

            Self::GetHandleRep => {
                let err_ctx_get_handle_rep_fn = Self::GetHandleRep.name();
                output.push_str(&format!("
                    function {err_ctx_get_handle_rep_fn}(componentTable, handle) {{
                        if (!Array.isArray(componentTable[handle])) {{ throw new Error('missing error-context in component while retrieving rep'); }}
                        return componentTable[handle][1];
                    }}
                "));
            }

            Self::GlobalRefCountAdd => {
                let global_tbl = Self::ComponentGlobalTable.name();
                let err_ctx_global_ref_count_add_fn = Self::GlobalRefCountAdd.name();
                output.push_str(&format!("
                    function {err_ctx_global_ref_count_add_fn}(rep, amount) {{
                        if (!{global_tbl}.get(rep)) {{ throw new Error('missing global error-context for rep [' + rep + '] while incrementing refcount'); }}
                        return {global_tbl}.get(rep).refCount += amount;
                    }}
                "));
            }

            Self::GetLocalTable => {
                let get_local_tbl_fn = Self::GetLocalTable.name();
                let local_tbl_var = Self::ComponentLocalTable.name();
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

            Self::CreateLocalHandle => {
                // TODO: Refactor to efficient tuple array sparse array setup + non-racy nextId mechanism
                let create_local_handle_fn = Self::CreateLocalHandle.name();
                let global_tbl = Self::ComponentGlobalTable.name();
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

            Self::ReserveGlobalRep => {
                // TODO: Refactor to efficient tuple array sparse array setup + non-racy nextId mechanism
                let global_tbl = Self::ComponentGlobalTable.name();
                let reserve_global_err_ctx_fn = Self::ReserveGlobalRep.name();
                output.push_str(&format!("
                    function {reserve_global_err_ctx_fn}(debugMessage, refCount) {{
                        const nextRep = {global_tbl}.size + 1;
                        if ({global_tbl}.has(nextRep)) {{ throw new Error('unexpected rep collision in global error-context map'); }}
                        {global_tbl}.set(nextRep, {{ refCount, debugMessage }});
                        return nextRep;
                    }}
                "));
            }
        }
    }
}
