//! Intrinsics that represent helpers that deal with Component Model resources

use std::fmt::Write;

use crate::intrinsics::p3::async_task::AsyncTaskIntrinsic;
use crate::intrinsics::{Intrinsic, RenderIntrinsicsArgs};
use crate::source::Source;
use crate::uwriteln;

/// This enum contains intrinsics for supporting Component Model resources
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ResourceIntrinsic {
    /// # Resource table slab implementation
    ///
    /// Resource table slab implementation on top of a plain JS array of numbers, for
    /// performance. We don't use a typed array because we need resizability without reserving
    /// a large buffer.
    ///
    /// Each entry consists of a pair of values, either a free list entry, or a data entry.
    ///
    /// ## Free List Entries:
    ///
    ///  |    index (x, u30)   |       ~unused~      |
    ///  |------ 32 bits ------|------ 32 bits ------|
    ///  | 01xxxxxxxxxxxxxxxxx | ################### |
    ///
    /// Free list entries use only the first value in the pair, with bit 30 (`T_FLAG`) always
    /// set to indicate that the pair is part of the free list. The first pair of entries at
    /// indices 0 and 1 is the free list head, with the initial values of 1 << 30 and 0
    /// respectively. Removing the 1 << 30 flag gives 0, which indicates the end of the free
    /// list.
    ///
    /// ## Data Entries:
    ///
    ///  |    scope (x, u30)   |  own(o) + rep (x, u32)   |
    ///  |------ 32 bits ------|-------- 33 bits ---------|
    ///  | 00xxxxxxxxxxxxxxxxx | oxxxxxxxxxxxxxxxxxxxxxxx |
    ///
    /// Data entry pairs consist of a first u30 scope entry and a second rep entry. The field
    /// is only called the scope for interface shape consistency, but is actually used for the
    /// ref count for own handles and the scope id for borrow handles. Bit 30 is never set for
    /// this first entry to distinguish the pair from the free list.
    ///
    /// The second item in the pair is the rep for the resource, as an unsigned 32-bit value,
    /// plus `T_OWN` (2 ** 32) if it is an own handle. A rep is any u32 the guest chooses (for
    /// example the address of an object in linear memory), so ownership is kept above its 32
    /// bits rather than in one of them: an entry is owned if it is at least `T_OWN`, and its rep
    /// is the entry modulo `T_OWN`.
    ///
    /// The free list numbering and the handle numbering are the same, indexing by pair, so to
    /// get from a handle or free list numbering to an index, we multiply by two.
    ///
    /// For example, to access a handle n, we read the pair of values n * 2 and n * 2 + 1 in
    /// the array to get the context and rep respectively. If bit 30 is set on the context, we
    /// throw for an invalid handle. The rep value is taken without the ownership offset.
    /// A zero rep is valid; only handle index zero is reserved.
    ///
    ResourceTableFlag,

    /// Offset added to the rep of an own handle in a resource table, see `ResourceTableFlag`
    ResourceTableOwnFlag,

    /// Global map from a component instance index (or a table without one) to its handle
    /// index space, which all handle kinds of the instance share
    HandleIndexSpaces,

    /// Get (or create) the handle index space of a component instance
    GetHandleIndexSpace,
    ResourceTableCreateBorrow,
    ResourceTableCreateOwn,
    ResourceTableGet,
    ResourceTableEnsureBorrowDrop,
    ResourceTableRemove,
    ResourceCallBorrows,
    ResourceScopeCounter,
    ResourceScopeTasks,
    ResourceTransferBorrow,
    ResourceTransferBorrowValidLifting,
    ResourceTransferOwn,
    CurResourceBorrows,
    ResourceDestructorCall,
}

impl ResourceIntrinsic {
    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            Self::ResourceCallBorrows.name(),
            Self::ResourceTableFlag.name(),
            Self::ResourceTableOwnFlag.name(),
            Self::HandleIndexSpaces.name(),
            Self::GetHandleIndexSpace.name(),
            Self::ResourceTableCreateBorrow.name(),
            Self::ResourceTableCreateOwn.name(),
            Self::ResourceTableGet.name(),
            Self::ResourceTableEnsureBorrowDrop.name(),
            Self::ResourceTableRemove.name(),
            Self::ResourceTransferBorrow.name(),
            Self::ResourceTransferBorrowValidLifting.name(),
            Self::ResourceTransferOwn.name(),
            Self::CurResourceBorrows.name(),
            Self::ResourceScopeCounter.name(),
            Self::ResourceScopeTasks.name(),
            Self::ResourceDestructorCall.name(),
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::ResourceCallBorrows => "RESOURCE_CALL_BORROWS",
            Self::ResourceScopeCounter => "RESOURCE_SCOPE_ID",
            Self::ResourceScopeTasks => "RESOURCE_SCOPE_TASKS",
            Self::ResourceTableFlag => "T_FLAG",
            Self::ResourceTableOwnFlag => "T_OWN",
            Self::HandleIndexSpaces => "HANDLE_INDEX_SPACES",
            Self::GetHandleIndexSpace => "getHandleIndexSpace",
            Self::ResourceTableCreateBorrow => "rscTableCreateBorrow",
            Self::ResourceTableCreateOwn => "rscTableCreateOwn",
            Self::ResourceTableGet => "rscTableGet",
            Self::ResourceTableEnsureBorrowDrop => "rscTableTryGet",
            Self::ResourceTableRemove => "rscTableRemove",
            Self::ResourceTransferBorrow => "resourceTransferBorrow",
            Self::ResourceTransferBorrowValidLifting => "resourceTransferBorrowValidLifting",
            Self::ResourceTransferOwn => "resourceTransferOwn",
            Self::CurResourceBorrows => "curResourceBorrows",
            Self::ResourceDestructorCall => "callResourceDestructor",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source, render_args: &RenderIntrinsicsArgs<'_>) {
        match self {
            Self::ResourceDestructorCall => {
                let create_current_task = render_args.intrinsic_call_prefix(Intrinsic::AsyncTask(
                    AsyncTaskIntrinsic::CreateNewCurrentImplicitThread,
                ));
                let with_current_task =
                    render_args.require_intrinsic(Intrinsic::WithGlobalCurrentThreadMetaFn);
                let name = self.name();
                uwriteln!(
                    output,
                    r#"
                      function {name}(args) {{
                          const {{ componentIdx, dtor, rep }} = args;

                          // A destructor enters a separate synchronous call, even when
                          // invoked from its own component. Its context slots must start
                          // empty: SDK task hooks allocate and free a stack through them.
                          // The enclosing task's register is restored after the call.

                          const {{ task, threadID }} = {create_current_task}{{
                              componentIdx,
                              isAsync: false,
                              callingWasmExport: true,
                              entryFnName: '<resource-drop>',
                          }});
                          task.enterSync();

                          return {with_current_task}({{
                              taskID: task.id(),
                              threadID,
                              componentIdx,
                              fn: () => {{
                                  try {{
                                      const result = dtor(rep);
                                      task.resolve([]);
                                      task.exit();
                                      return result;
                                  }} catch (err) {{
                                      if (!task.isResolvedState()) {{
                                          task.setErrored(err);
                                          task.reject(err);
                                      }}
                                      if (!task.isExited()) {{
                                          task.exit({{ skipExclusiveLockCheck: true }});
                                      }}
                                      throw err;
                                  }}
                              }},
                          }});
                      }}
                    "#,
                );
            }

            Self::CurResourceBorrows => output.push_str(
                "
                let curResourceBorrows = [];
            ",
            ),

            Self::ResourceTableFlag => {
                let table_flag = self.name();
                uwriteln!(output, "const {table_flag} = 1 << 30;");
            }

            Self::ResourceTableOwnFlag => {
                let own_flag = self.name();
                uwriteln!(output, "const {own_flag} = 2 ** 32;");
            }

            Self::HandleIndexSpaces => {
                let name = self.name();
                uwriteln!(output, "const {name} = new Map();");
            }

            Self::GetHandleIndexSpace => {
                let get_handle_index_space_fn = self.name();
                let handle_index_spaces = render_args.require_intrinsic(Self::HandleIndexSpaces);
                uwriteln!(
                    output,
                    r#"
                    function {get_handle_index_space_fn}(key) {{
                        let space = {handle_index_spaces}.get(key);
                        if (space === undefined) {{
                            // One index space per component instance (Canonical ABI
                            // `inst.handles`): resource handles, waitables, waitable sets and
                            // error contexts share it. Freed indices are reused LIFO, as
                            // `Table.add` does. Index 0 is never a handle.
                            space = {{
                                next: 1,
                                free: [],
                                alloc() {{ return this.free.length > 0 ? this.free.pop() : this.next++; }},
                                release(idx) {{ this.free.push(idx); }},
                            }};
                            {handle_index_spaces}.set(key, space);
                        }}
                        return space;
                    }}
                    "#
                );
            }

            Self::ResourceTableCreateBorrow => {
                let get_handle_index_space_fn =
                    render_args.require_intrinsic(Self::GetHandleIndexSpace);
                uwriteln!(
                    output,
                    r#"
                      function rscTableCreateBorrow(table, rep, scopeId) {{
                          if (scopeId === undefined) {{ throw new Error("missing scopeId"); }}
                          // (a table's component instance shares one index space between all
                          // its handle kinds; a table without an instance keeps its own)
                          const handle = {get_handle_index_space_fn}(table._componentIdx ?? table).alloc();
                          table[handle << 1] = scopeId;
                          table[(handle << 1) + 1] = rep >>> 0;
                          return handle;
                      }}
                    "#,
                );
            }

            Self::ResourceTableCreateOwn => {
                let own_flag = render_args.require_intrinsic(Self::ResourceTableOwnFlag);
                let get_handle_index_space_fn =
                    render_args.require_intrinsic(Self::GetHandleIndexSpace);
                uwriteln!(
                    output,
                    r#"
                function rscTableCreateOwn(table, rep) {{
                    // Reps are u32: one from a core function arrives as a signed i32
                    rep >>>= 0;
                    table._createdReps.add(rep);
                    const handle = {get_handle_index_space_fn}(table._componentIdx ?? table).alloc();
                    table[handle << 1] = 0;
                    table[(handle << 1) + 1] = rep + {own_flag};
                    return handle;
                }}
            "#
                )
            }

            Self::ResourceTableGet => {
                let table_flag = render_args.require_intrinsic(Self::ResourceTableFlag);
                let own_flag = render_args.require_intrinsic(Self::ResourceTableOwnFlag);
                let runtime_error =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                uwriteln!(
                    output,
                    r#"
                function rscTableGet(table, handle) {{
                    const scope = table[handle << 1];
                    const val = table[(handle << 1) + 1];
                    const own = val >= {own_flag};
                    const rep = own ? val - {own_flag} : val;
                    // (a freed or never allocated index has no entry in this table: its
                    // index may belong to another handle kind of the instance)
                    // Zero reps are valid; freed entries are identified by the scope flag.
                    if (val === undefined || (scope & {table_flag}) !== 0) {{
                        throw new {runtime_error}(`unknown handle index ${{handle}}`);
                    }}
                    return {{ rep, scope, own }};
                }}
            "#
                )
            }

            Self::ResourceTableEnsureBorrowDrop => output.push_str(
                "
                function rscTableEnsureBorrowDrop(table, handle, scope) {
                    if (table[handle << 1] === scope) {
                        throw new TypeError('Resource borrow was not dropped at end of call');
                    }
                }
            ",
            ),

            Self::ResourceTableRemove => {
                let table_flag = render_args.require_intrinsic(Self::ResourceTableFlag);
                let own_flag = render_args.require_intrinsic(Self::ResourceTableOwnFlag);
                let runtime_error =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                let resource_scope_tasks = render_args.require_intrinsic(Self::ResourceScopeTasks);
                let get_handle_index_space_fn =
                    render_args.require_intrinsic(Self::GetHandleIndexSpace);
                uwriteln!(
                    output,
                    r#"
                function rscTableRemove(table, handle) {{
                    const scope = table[handle << 1];
                    const val = table[(handle << 1) + 1];
                    const own = val >= {own_flag};
                    const rep = own ? val - {own_flag} : val;
                    // A borrowed entry can store zero without being freed.
                    if (val === undefined || (scope & {table_flag}) !== 0) {{
                        throw new {runtime_error}(`unknown handle index ${{handle}}`);
                    }}
                    if (own && scope !== 0) {{
                        throw new {runtime_error}('cannot remove owned resource while borrowed');
                    }}
                    const borrowTask = own ? undefined : {resource_scope_tasks}.get(scope);
                    // Mark the slot freed and give its index back to the instance's space.
                    table[handle << 1] = {table_flag};
                    table[(handle << 1) + 1] = 0;
                    {get_handle_index_space_fn}(table._componentIdx ?? table).release(handle);
                    borrowTask?.removeBorrowedHandle();
                    return {{ rep, scope, own }};
                }}
            "#
                )
            }

            Self::ResourceTransferBorrow => {
                let resource_transfer_borrow_fn = self.name();
                let handle_tables = render_args.require_intrinsic(Intrinsic::HandleTables);
                let resource_borrows = render_args.require_intrinsic(Self::ResourceCallBorrows);
                let table_get_call =
                    render_args.intrinsic_call(Self::ResourceTableGet, "fromTable, handle");
                let rsc_table_create_borrow =
                    render_args.require_intrinsic(Self::ResourceTableCreateBorrow);
                let scope_id = render_args.require_intrinsic(Intrinsic::ScopeId);
                let table_flag = render_args.require_intrinsic(Self::ResourceTableFlag);
                let get_global_current_thread_meta =
                    render_args.require_intrinsic(Intrinsic::GetGlobalCurrentThreadMetaFn);
                let get_current_task = render_args.intrinsic_call_prefix(Intrinsic::AsyncTask(
                    AsyncTaskIntrinsic::GetCurrentTask,
                ));

                uwriteln!(
                    output,
                    r#"
                    function {resource_transfer_borrow_fn}(handle, fromTid, toTid) {{
                        const fromTable = {handle_tables}[fromTid];
                        const {{ rep, own }} = {table_get_call};

                        let toTable = {handle_tables}[toTid];
                        if (!toTable) {{
                            {handle_tables}[toTid] = [{table_flag}, 0];
                            toTable = {handle_tables}[toTid];
                            toTable._createdReps = new Set();
                        }}

                        const componentIdx = toTable._componentIdx;
                        const currentTaskMeta = componentIdx === undefined
                            ? undefined
                            : {get_global_current_thread_meta}(componentIdx);
                        const borrowTask = currentTaskMeta
                            ? {get_current_task}componentIdx, currentTaskMeta.taskID)?.task
                            : undefined;

                        if (borrowTask && own) {{
                            fromTable[handle << 1]++;
                            borrowTask.addResourceLender(fromTable, handle);
                        }}

                        if (toTable._createdReps.has(rep)) {{
                            return rep;
                        }}

                        const newHandle = {rsc_table_create_borrow}(
                            toTable,
                            rep,
                            borrowTask?.resourceScopeId() ?? {scope_id},
                        );
                        if (borrowTask) {{
                            borrowTask.addBorrowedHandle();
                        }} else {{
                            {resource_borrows}.push({{ rid: toTid, handle: newHandle }});
                        }}
                        return newHandle;
                    }}
                "#
                );
            }

            Self::ResourceTransferBorrowValidLifting => {
                let resource_transfer_borrow =
                    render_args.require_intrinsic(Self::ResourceTransferBorrow);
                uwriteln!(
                    output,
                    "const resourceTransferBorrowValidLifting = {resource_transfer_borrow};"
                );
            }

            Self::ResourceTransferOwn => {
                let handle_tables = render_args.require_intrinsic(Intrinsic::HandleTables);
                let rsc_table_remove = render_args.require_intrinsic(Self::ResourceTableRemove);
                let rsc_table_create_own =
                    render_args.require_intrinsic(Self::ResourceTableCreateOwn);
                let table_flag = render_args.require_intrinsic(Self::ResourceTableFlag);
                output.push_str(&format!(
                    r#"
                    function resourceTransferOwn(handle, fromTid, toTid) {{
                        const {{ rep }} = {rsc_table_remove}({handle_tables}[fromTid], handle);

                        let toTable = {handle_tables}[toTid];
                        if (!toTable) {{
                            {handle_tables}[toTid] = [{table_flag}, 0];
                            toTable = {handle_tables}[toTid];
                            toTable._createdReps = new Set();
                        }}

                        const newHandle = {rsc_table_create_own}(toTable, rep);
                        return newHandle;
                    }}
                "#
                ));
            }

            Self::ResourceCallBorrows => {
                let name = self.name();
                output.push_str(&format!("let {name} = [];"));
            }

            Self::ResourceScopeCounter => {
                let name = self.name();
                uwriteln!(output, "let {name} = 0;");
            }

            Self::ResourceScopeTasks => {
                let name = self.name();
                uwriteln!(output, "const {name} = new Map();");
            }
        }
    }
}
