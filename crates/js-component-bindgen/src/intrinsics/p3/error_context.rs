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
            Self::ComponentGlobalTable => "GlobalErrorContextTable",
            Self::ComponentLocalTable => "errCtxLocal",
            Self::ErrorContextNew => "errCtxNew",
            Self::ErrorContextDrop => "errCtxDrop",
            Self::ErrorContextTransfer => "errCtxTransfer",
            Self::ErrorContextDebugMessage => "errCtxDebugMessage",
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
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!(r#"
                class {name} {{
                     static data = null;
                     static get() {{
                         if ({name}.data === null) {{
                             {name}.data = new {rep_table_class}({{ target: "global error context table" }});
                         }}
                         return {name}.data;
                     }}
                }}
                "#));
            }

            // NOTE: the top and middle level of the component local table are regular maps, with
            // leaves being actual `RepTable`s
            Self::ComponentLocalTable => {
                let name = Self::ComponentLocalTable.name();
                output.push_str(&format!(r#"let {name} = new Map();"#));
            }

            Self::ErrorContextNew => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let create_local_handle_fn = Self::CreateLocalHandle.name();
                let reserve_global_err_ctx_fn = Self::ReserveGlobalRep.name();
                let err_ctx_new_fn = Self::ErrorContextNew.name();
                let get_local_tbl_fn = Self::GetLocalTable.name();
                output.push_str(&format!(
                    r#"
                    function {err_ctx_new_fn}(args, msgPtr, msgLen) {{
                        {debug_log_fn}('[{err_ctx_new_fn}()] args', {{ args, msgPtr, msgLen }});
                        const {{ componentIdx, localTableIdx, readStrFn }} = args;

                        const componentTable = {get_local_tbl_fn}(componentIdx, localTableIdx);
                        const debugMessage = readStrFn(msgPtr, msgLen);
                        const rep = {reserve_global_err_ctx_fn}(debugMessage, 0);

                        const res = {create_local_handle_fn}(componentTable, rep);
                        return res;
                    }}
                "#
                ));
            }

            Self::ErrorContextDebugMessage => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let global_tbl = Self::ComponentGlobalTable.name();
                let err_ctx_debug_msg_fn = Self::ErrorContextDebugMessage.name();
                let get_local_tbl_fn = Self::GetLocalTable.name();
                output.push_str(&format!(r#"
                    function {err_ctx_debug_msg_fn}(args, handle, outputStrPtr) {{
                        {debug_log_fn}('[{err_ctx_debug_msg_fn}()] args', {{ args, handle, outputStrPtr }});
                        const {{ componentIdx, localTableIdx, writeStrFn }} = args;
                        const globalTable = {global_tbl}.get();

                        console.log("About to retrieve debug message", {{ componentIdx, localTableIdx, handle }});
                        const componentTable = {get_local_tbl_fn}(componentIdx, localTableIdx);
                        if (!componentTable.get(handle)) {{
                            throw new Error(`missing error-context handle [${{handle}}] in component [${{componentIdx}}] while retrieving debug msg`);
                        }}

                        const rep = componentTable.get(handle).rep;
                        const msg = globalTable.get(rep).debugMessage;
                        writeStrFn(msg, outputStrPtr);
                    }}
                "#));
            }

            Self::ErrorContextDrop => {
                let global_ref_count_add_fn = Self::GlobalRefCountAdd.name();
                let global_tbl = Self::ComponentGlobalTable.name();
                let err_ctx_drop_fn = Self::ErrorContextDrop.name();
                let get_local_tbl_fn = Self::GetLocalTable.name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!(r#"
                    function {err_ctx_drop_fn}(args, handle) {{
                        {debug_log_fn}('[{err_ctx_drop_fn}()] args', {{ args, handle }});
                        const {{ componentIdx, localTableIdx }} = args;
                        const globalTable = {global_tbl}.get();

                        const localErrCtxTable = {get_local_tbl_fn}(componentIdx, localTableIdx);
                        if (!localErrCtxTable.get(handle)) {{
                            throw new Error(`missing error-context with handle [${{handle}}] in component [${{componentIdx}}] during drop`);
                        }}
                        const existing = localErrCtxTable.get(handle);
                        existing.refCount -= 1;
                        if (existing.refCount === 0) {{ localErrCtxTable.remove(handle); }}
                        const globalRefCount = {global_ref_count_add_fn}(existing.rep, -1);
                        if (globalRefCount === 0) {{
                            if (existing.refCount !== 0) {{ throw new Error('local refCount exceeds global during removal'); }}
                            globalTable.remove(existing.rep);
                        }}
                        return true;
                    }}
                "#));
            }

            Self::ErrorContextTransfer => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let get_local_tbl_fn = Self::GetLocalTable.name();
                let err_ctx_drop_fn = Self::ErrorContextDrop.name();
                let get_handle_rep_fn = Self::GetHandleRep.name();
                let global_ref_count_add_fn = Self::GlobalRefCountAdd.name();
                let err_ctx_transfer_fn = Self::ErrorContextTransfer.name();
                let create_local_handle_fn = Self::CreateLocalHandle.name();
                // NOTE: the handle described below is *not* the error-context rep, but rather the
                // component-local handle for the canonical rep of a certain global error-context.
                //
                // handles are component instance local, reps are component (model) global
                output.push_str(&format!("
                    function {err_ctx_transfer_fn}(fromComponentIdx, toComponentIdx, handle, fromTableIdx, toTableIdx) {{
                        {debug_log_fn}('[{err_ctx_transfer_fn}()] args', {{ fromComponentIdx, toComponentIdx, handle, fromTableIdx, toTableIdx }});
                        const fromTbl = {get_local_tbl_fn}(fromComponentIdx, fromTableIdx);
                        const toTbl = {get_local_tbl_fn}(toComponentIdx, toTableIdx);
                        const rep = {get_handle_rep_fn}(fromTbl, handle);
                        {global_ref_count_add_fn}(rep, 1); // Add an extra global ref count to avoid premature removal during drop
                        {err_ctx_drop_fn}(fromTbl, handle);
                        const newHandle = {create_local_handle_fn}(toTbl, rep);
                        {global_ref_count_add_fn}(rep, -1); // Re-normalize the global count
                        return newHandle;
                    }}
                "));
            }

            Self::GetHandleRep => {
                let err_ctx_get_handle_rep_fn = Self::GetHandleRep.name();
                output.push_str(&format!(r#"
                    function {err_ctx_get_handle_rep_fn}(componentTable, handle) {{
                        if (!Array.isArray(componentTable[handle])) {{
                            throw new Error(`missing error-context with handle [${{handle}}] in component while retrieving rep`);
                        }}
                        return componentTable[handle][1];
                    }}
                "#));
            }

            Self::GlobalRefCountAdd => {
                let global_tbl = Self::ComponentGlobalTable.name();
                let err_ctx_global_ref_count_add_fn = Self::GlobalRefCountAdd.name();
                output.push_str(&format!("
                    function {err_ctx_global_ref_count_add_fn}(rep, amount) {{
                        const globalTable = {global_tbl}.get();
                        const errCtx = globalTable.get(rep);
                        if (!errCtx) {{
                            throw new Error(`missing global error-context [${{rep}}] while incrementing refcount`);
                        }}
                        return errCtx.refCount += amount ?? 1;
                    }}
                "));
            }

            Self::GetLocalTable => {
                let get_local_tbl_fn = Self::GetLocalTable.name();
                let local_tbl_var = Self::ComponentLocalTable.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!(r#"
                    function {get_local_tbl_fn}(componentIdx, tableIdx, opts) {{
                        const localTables = {local_tbl_var};
                        let tables = localTables.get(componentIdx);
                        if (!tables) {{
                            if (opts?.upsert) {{
                                tables = new Map();
                                localTables.set(componentIdx, tables);
                            }} else {{
                                throw new Error(`missing local error context table for component [${{componentIdx}}] while getting local table`);
                            }}
                        }}

                        let errCtxTable = tables.get(tableIdx);
                        if (!errCtxTable) {{
                            if (opts?.upsert) {{
                                errCtxTable = new {rep_table_class}({{ target: `component [${{componentIdx}}] error contexts` }});
                                tables.set(tableIdx, errCtxTable);
                            }} else {{
                                throw new Error(`missing table [${{tableIdx}}] in tables for component [${{componentIdx}}] while getting local table`);
                            }}
                        }}

                        return errCtxTable;
                    }}
                "#));
            }

            Self::CreateLocalHandle => {
                // NOTE: `rep`s are global component model representations, `handle`s are component-local table indices
                let create_local_handle_fn = Self::CreateLocalHandle.name();
                let global_tbl = Self::ComponentGlobalTable.name();
                output.push_str(&format!(r#"
                    function {create_local_handle_fn}(componentLocalTable, rep) {{
                        const globalTable = {global_tbl}.get();
                        if (!globalTable.contains(rep)) {{ throw new Error(`missing global error-context [${{rep}}]`); }}
                        const localHandle = componentLocalTable.insert({{ rep, refCount: 1 }});
                        globalTable.get(rep).refCount += 1;
                        return localHandle;
                    }}
                "#));
            }

            Self::ReserveGlobalRep => {
                let global_tbl = Self::ComponentGlobalTable.name();
                let reserve_global_rep_fn = Self::ReserveGlobalRep.name();
                output.push_str(&format!(r#"
                    function {reserve_global_rep_fn}(debugMessage, refCount) {{
                        const globalTable = {global_tbl}.get();
                        const rep = globalTable.insert({{ refCount, debugMessage }});
                        return rep;
                    }}
                "#));
            }
        }
    }
}
