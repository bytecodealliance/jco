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
                let get_current_task_meta =
                    render_args.require_intrinsic(Intrinsic::GetGlobalCurrentTaskMetaFn);
                let create_current_task = render_args.require_intrinsic(Intrinsic::AsyncTask(
                    AsyncTaskIntrinsic::CreateNewCurrentTask,
                ));
                let with_current_task =
                    render_args.require_intrinsic(Intrinsic::WithGlobalCurrentTaskMetaFn);
                let name = self.name();
                uwriteln!(
                    output,
                    r#"
                      function {name}(args) {{
                          const {{ componentIdx, dtor, rep }} = args;

                          // A resource can be disposed re-entrantly while its component
                          // already has a current task. In that case the destructor is part
                          // of that task and must not replace its current-task register.
                          if ({get_current_task_meta}(componentIdx)) {{
                              return dtor(rep);
                          }}

                          const [task] = {create_current_task}({{
                              componentIdx,
                              isAsync: false,
                              callingWasmExport: true,
                              entryFnName: '<resource-drop>',
                          }});
                          task.enterSync();

                          return {with_current_task}({{
                              taskID: task.id(),
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

            Self::ResourceTableCreateBorrow => {
                let table_flag = render_args.require_intrinsic(Self::ResourceTableFlag);
                uwriteln!(
                    output,
                    r#"
                      function rscTableCreateBorrow(table, rep, scopeId) {{
                          if (scopeId === undefined) {{ throw new Error("missing scopeId"); }}
                          const free = table[0] & ~{table_flag};
                          if (free === 0) {{
                              table.push(scopeId);
                              table.push(rep);
                              return (table.length >> 1) - 1;
                          }}
                          table[0] = table[free << 1];
                          table[free << 1] = scopeId;
                          table[(free << 1) + 1] = rep;
                          return free;
                      }}
                    "#,
                );
            }

            Self::ResourceTableCreateOwn => {
                let table_flag = render_args.require_intrinsic(Self::ResourceTableFlag);
                uwriteln!(
                    output,
                    r#"
                function rscTableCreateOwn(table, rep) {{
                    const free = table[0] & ~{table_flag};
                    table._createdReps.add(rep);
                    if (free === 0) {{
                        table.push(0);
                        table.push(rep | {table_flag});
                        return (table.length >> 1) - 1;
                    }}
                    table[0] = table[free << 1];
                    table[free << 1] = 0;
                    table[(free << 1) + 1] = rep | {table_flag};
                    return free;
                }}
            "#
                )
            }

            Self::ResourceTableGet => {
                let table_flag = render_args.require_intrinsic(Self::ResourceTableFlag);
                let runtime_error =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                uwriteln!(
                    output,
                    r#"
                function rscTableGet(table, handle) {{
                    const scope = table[handle << 1];
                    const val = table[(handle << 1) + 1];
                    const own = (val & {table_flag}) !== 0;
                    const rep = val & ~{table_flag};
                    if (rep === 0 || (scope & {table_flag}) !== 0) {{
                        // Resource entries occupy scope/rep pairs after the table sentinel.
                        throw new {runtime_error}(`unknown handle index ${{(handle << 1) + 1}}`);
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
                let runtime_error =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                let resource_scope_tasks = render_args.require_intrinsic(Self::ResourceScopeTasks);
                uwriteln!(
                    output,
                    r#"
                function rscTableRemove(table, handle) {{
                    const scope = table[handle << 1];
                    const val = table[(handle << 1) + 1];
                    const own = (val & {table_flag}) !== 0;
                    const rep = val & ~{table_flag};
                    if (val === 0 || (scope & {table_flag}) !== 0) {{
                        // Resource entries occupy scope/rep pairs after the table sentinel.
                        throw new {runtime_error}(`unknown handle index ${{(handle << 1) + 1}}`);
                    }}
                    if (own && scope !== 0) {{
                        throw new {runtime_error}('cannot remove owned resource while borrowed');
                    }}
                    const borrowTask = own ? undefined : {resource_scope_tasks}.get(scope);
                    table[handle << 1] = table[0] | {table_flag};
                    table[0] = handle | {table_flag};
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
                let rsc_table_get = render_args.require_intrinsic(Self::ResourceTableGet);
                let rsc_table_create_borrow =
                    render_args.require_intrinsic(Self::ResourceTableCreateBorrow);
                let scope_id = render_args.require_intrinsic(Intrinsic::ScopeId);
                let table_flag = render_args.require_intrinsic(Self::ResourceTableFlag);
                let get_global_current_task_meta =
                    render_args.require_intrinsic(Intrinsic::GetGlobalCurrentTaskMetaFn);
                let get_current_task = render_args
                    .require_intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask));

                uwriteln!(
                    output,
                    r#"
                    function {resource_transfer_borrow_fn}(handle, fromTid, toTid) {{
                        const fromTable = {handle_tables}[fromTid];
                        const {{ rep, own }} = {rsc_table_get}(fromTable, handle);

                        let toTable = {handle_tables}[toTid];
                        if (!toTable) {{
                            {handle_tables}[toTid] = [{table_flag}, 0];
                            toTable = {handle_tables}[toTid];
                            toTable._createdReps = new Set();
                        }}

                        const componentIdx = toTable._componentIdx;
                        const currentTaskMeta = componentIdx === undefined
                            ? undefined
                            : {get_global_current_task_meta}(componentIdx);
                        const borrowTask = currentTaskMeta
                            ? {get_current_task}(componentIdx, currentTaskMeta.taskID)?.task
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
