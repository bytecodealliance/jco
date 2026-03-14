//! Intrinsics that represent helpers that implement async tasks

use crate::intrinsics::Intrinsic;
use crate::intrinsics::component::ComponentIntrinsic;
use crate::intrinsics::conversion::ConversionIntrinsic;
use crate::intrinsics::p3::waitable::WaitableIntrinsic;
use crate::source::Source;

/// This enum contains intrinsics that implement async tasks
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum AsyncTaskIntrinsic {
    /// Set the value of a context local storage for the current task/thread
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type SlotIndex = 0 | 1;
    /// function contextSet(slot: SlotIndex, value: number);
    /// ```
    ///
    ContextSet,

    /// Gets the value stored in context local storage for the current task/thread
    ///
    /// Guest code uses this to reference internally stored context local storage,
    /// whether that is task local or thread local.
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type SlotIndex = 0 | 1;
    /// function contextGet(slot: SlotIndex): i32;
    /// ```
    ///
    ContextGet,

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

    /// Yield a task
    ///
    /// Guest code uses this to yield control flow to the host (and possibly other components)
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function yield_(isAsync: boolean);
    /// ```
    Yield,

    /// Cancel the current async subtask for a given component instance
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// function subtaskCancel(componentIdx: number, isAsync: boolean);
    /// ```
    SubtaskCancel,

    /// Cancel the current task
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// function taskCancel(componentIdx: i32);
    /// ```
    TaskCancel,

    /// Function that retrieves the current global async current task
    GetCurrentTask,

    /// Function that creates a new task, and marks it as the current executing task
    CreateNewCurrentTask,

    /// Function that stops the current task
    ClearCurrentTask,

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
    ///     returnCalls: number,
    ///     requested: boolean,
    ///     borrowedHandles: Record<number, boolean>,
    ///     cancelled: boolean,
    /// }
    ///
    /// type GlobalAsyncCurrentTaskMap = Map<number, Task>;
    /// ```
    GlobalAsyncCurrentTaskMap,

    /// Global that stores the current task ID
    ///
    /// This global variable is populated when a task is started, and cleared
    /// (reset to `null` in JS) when a task ends.
    ///
    /// This global is used only when *necessary* -- for canonical builtins that
    /// do not include/cannot access the current task any other way, often because
    /// they have no access to the current component instance index (e.g. `context.get`).
    ///
    /// ```ts
    /// type GlobalAsyncCurrentTaskIds = number[];
    /// ```
    GlobalAsyncCurrentTaskIds,

    /// Global that stores the current component ID (for the current task)
    ///
    /// This global variable is populated when a task is started, and cleared
    /// (reset to `null` in JS) when a task ends.
    ///
    /// ```ts
    /// type GlobalAsyncCurrentTaskIds = number[];
    /// ```
    GlobalAsyncCurrentComponentIdxs,

    /// The definition of the `AsyncTask` JS class
    AsyncTaskClass,

    /// The constant that represents that a async task is blocked
    AsyncBlockedConstant,

    /// The definition of the `AsyncSubtask` JS class
    AsyncSubtaskClass,

    /// A utility function used for unpacking results to callbck that mostly contain
    /// a callback code and possibly a waitable set index to be watied on or polled
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// function unpackCallbackResult(callbackResult: i32): [i32, i32];
    /// ```
    UnpackCallbackResult,

    /// JS that contains the loop which drives a given async task to completion.
    ///
    /// This intrinsic is not a canon function but instead a reusable JS snippet
    /// that controls
    ///
    /// The Canonical ABI pseudo-code equivalent  be `thread_func(thread)` in `canon_lift`
    /// though threads are not yet implemented.
    ///
    /// Normally, the async driver loop returns a Promise that resolves to the result
    /// of the original async function that was called.
    ///
    /// See `Instruction::CallWasm` for example usage.
    ///
    /// ```ts
    /// interface DriverLoopArgs {
    ///     componentState: ComponentAsyncState,
    ///     task: AsyncTask,
    ///     fnName: string,
    ///     callbackFnName: string,
    ///     isAsync: boolean, // whether using JSPI *or* lifted async function
    ///     callbackResult: number, // initial wasm call result that contains callback code and more metadata
    ///     // Normally, the driver loop is run in a separately executing Promise,
    ///     // so we ensure that the enclosing promise itself can eventually be resolved
    ///     resolve: () => void,
    ///     reject: () => void,
    /// }
    ///
    /// function asyncDriverLoop(args: DriverLoopArgs): Promise<any>;
    /// ```
    DriverLoop,

    /// Intrinsic used when components lower imports to be used
    /// from other components or the host.
    ///
    /// # Component Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// ```
    ///
    LowerImport,

    /// Version of lower import written explicitly for backwards compatibility
    ///
    /// TODO(breaking): remove this when specifying async imports/exports is removed.
    LowerImportBackwardsCompat,

    /// Global variable that represents whether the *current* task my block
    /// see `CoreDef::TaskMayBlock`
    CurrentTaskMayBlock,

    /// Called before entering sync-to-sync guest-to-guest call
    EnterSymmetricSyncGuestCall,

    /// Called when exiting a sync-to-sync guest-to-guest call
    ExitSymmetricSyncGuestCall,

    /// Component index that is saved across sync-to-sync guest calls
    SymmetricSyncGuestCallStack,
}

impl AsyncTaskIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            Self::CurrentTaskMayBlock.name(),
            Self::AsyncBlockedConstant.name(),
            Self::AsyncSubtaskClass.name(),
            Self::AsyncTaskClass.name(),
            Self::ContextGet.name(),
            Self::ContextSet.name(),
            Self::GetCurrentTask.name(),
            Self::CreateNewCurrentTask.name(),
            Self::ClearCurrentTask.name(),
            Self::GlobalAsyncCurrentTaskMap.name(),
            Self::GlobalAsyncCurrentTaskIds.name(),
            Self::GlobalAsyncCurrentComponentIdxs.name(),
            Self::SubtaskCancel.name(),
            Self::SubtaskDrop.name(),
            Self::TaskCancel.name(),
            Self::TaskReturn.name(),
            Self::Yield.name(),
            Self::UnpackCallbackResult.name(),
            Self::DriverLoop.name(),
            Self::LowerImport.name(),
            Self::LowerImportBackwardsCompat.name(),
            Self::EnterSymmetricSyncGuestCall.name(),
            Self::ExitSymmetricSyncGuestCall.name(),
            Self::SymmetricSyncGuestCallStack.name(),
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::CurrentTaskMayBlock => "CURRENT_TASK_MAY_BLOCK",
            Self::AsyncBlockedConstant => "ASYNC_BLOCKED_CODE",
            Self::AsyncSubtaskClass => "AsyncSubtask",
            Self::AsyncTaskClass => "AsyncTask",
            Self::ContextGet => "contextGet",
            Self::ContextSet => "contextSet",
            Self::GetCurrentTask => "getCurrentTask",
            Self::CreateNewCurrentTask => "createNewCurrentTask",
            Self::ClearCurrentTask => "clearCurrentTask",
            Self::GlobalAsyncCurrentTaskMap => "ASYNC_TASKS_BY_COMPONENT_IDX",
            Self::GlobalAsyncCurrentTaskIds => "ASYNC_CURRENT_TASK_IDS",
            Self::GlobalAsyncCurrentComponentIdxs => "ASYNC_CURRENT_COMPONENT_IDXS",
            Self::SubtaskCancel => "subtaskCancel",
            Self::SubtaskDrop => "subtaskDrop",
            Self::TaskCancel => "taskCancel",
            Self::TaskReturn => "taskReturn",
            Self::Yield => "asyncYield",
            Self::UnpackCallbackResult => "unpackCallbackResult",
            Self::DriverLoop => "_driverLoop",
            Self::LowerImport => "_lowerImport",
            Self::LowerImportBackwardsCompat => "_lowerImportBackwardsCompat",
            Self::EnterSymmetricSyncGuestCall => "_symmetricSyncGuestCallEnter",
            Self::ExitSymmetricSyncGuestCall => "_symmetricSyncGuestCallExit",
            Self::SymmetricSyncGuestCallStack => "SYMMETRIC_SYNC_GUEST_CALL_STACK",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::CurrentTaskMayBlock => {
                output.push_str(&format!(
                    "const {var_name} = new WebAssembly.Global({{ value: 'i32', mutable: true }}, 0);\n",
                    var_name = self.name()
                ));
            }

            Self::GlobalAsyncCurrentTaskMap => {
                let var_name = Self::GlobalAsyncCurrentTaskMap.name();
                output.push_str(&format!("const {var_name} = new Map();\n"));
            }

            Self::GlobalAsyncCurrentTaskIds => {
                output.push_str(&format!("const {var_name} = [];\n", var_name = self.name(),));
            }

            Self::GlobalAsyncCurrentComponentIdxs => {
                output.push_str(&format!("const {var_name} = [];\n", var_name = self.name(),));
            }

            Self::AsyncBlockedConstant => {
                let name = Self::AsyncBlockedConstant.name();
                output.push_str(&format!("const {name} = 0xFFFF_FFFF;"));
            }

            Self::ContextSet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let context_set_fn = Self::ContextSet.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                let type_check_i32 = Intrinsic::TypeCheckValidI32.name();
                let get_global_current_task_meta_fn = Intrinsic::GetGlobalCurrentTaskMetaFn.name();

                output.push_str(&format!(r#"
                    function {context_set_fn}(ctx, value) {{
                        const {{ componentIdx, slot }} = ctx;
                        if (componentIdx === undefined) {{ throw new TypeError("missing component idx"); }}
                        if (slot === undefined) {{ throw new TypeError("missing slot"); }}
                        if (!({type_check_i32}(value))) {{ throw new Error('invalid value for context set (not valid i32)'); }}

                        const currentTaskMeta = {get_global_current_task_meta_fn}(componentIdx);
                        if (!currentTaskMeta) {{
                            throw new Error(`missing/incomplete global current task meta for component idx [${{componentIdx}}] during context set`);
                        }}
                        const taskID = currentTaskMeta.taskID;

                        const taskMeta = {current_task_get_fn}(componentIdx, taskID);
                        if (!taskMeta) {{ throw new Error('failed to retrieve current task'); }}

                        let task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing current task in metadata while setting context'); }}

                        {debug_log_fn}('[{context_set_fn}()] args', {{
                            slot,
                            value,
                            storage: task.storage,
                            taskID: task.id(),
                            componentIdx: task.componentIdx(),
                        }});

                        if (slot < 0 || slot >= task.storage.length) {{ throw new Error('invalid slot for current task'); }}
                        task.storage[slot] = value;
                    }}
                "#));
            }

            Self::ContextGet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let context_get_fn = Self::ContextGet.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                let get_global_current_task_meta_fn = Intrinsic::GetGlobalCurrentTaskMetaFn.name();

                output.push_str(&format!(r#"
                    function {context_get_fn}(ctx) {{
                        const {{ componentIdx, slot }} = ctx;
                        if (componentIdx === undefined) {{ throw new TypeError("missing component idx"); }}
                        if (slot === undefined) {{ throw new TypeError("missing slot"); }}

                        const currentTaskMeta = {get_global_current_task_meta_fn}(componentIdx);
                        if (!currentTaskMeta) {{
                            throw new Error(`missing/incomplete global current task meta for component idx [${{componentIdx}}] during context set`);
                        }}
                        const taskID = currentTaskMeta.taskID;

                        const taskMeta = {current_task_get_fn}(componentIdx, taskID);
                        if (!taskMeta) {{ throw new Error('failed to retrieve current task'); }}

                        let task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing current task in metadata while getting context'); }}

                        {debug_log_fn}('[{context_get_fn}()] args', {{
                            slot,
                            storage: task.storage,
                            taskID: task.id(),
                            componentIdx: task.componentIdx(),
                        }});

                        if (slot < 0 || slot >= task.storage.length) {{ throw new Error('invalid slot for current task'); }}

                        return task.storage[slot];
                    }}
                    "#));
            }

            // Equivalent of `task.return`
            Self::TaskReturn => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let task_return_fn = Self::TaskReturn.name();
                let get_global_current_task_meta_fn = Intrinsic::GetGlobalCurrentTaskMetaFn.name();
                let current_task_get_fn = Self::GetCurrentTask.name();

                output.push_str(&format!(r#"
                    function {task_return_fn}(ctx) {{
                        const {{
                            componentIdx,
                            useDirectParams,
                            getMemoryFn,
                            memoryIdx,
                            callbackFnIdx,
                            liftFns,
                            lowerFns
                        }} = ctx;
                        const params = [...arguments].slice(1);
                        const memory = getMemoryFn();

                        const {{ taskID }} = {get_global_current_task_meta_fn}(componentIdx);

                        const taskMeta = {current_task_get_fn}(componentIdx, taskID);
                        if (!taskMeta) {{ throw new Error('failed to retrieve current task metadata'); }}

                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing current task in metadata'); }}

                        {debug_log_fn}('[{task_return_fn}()] args', {{
                            componentIdx,
                            taskID: task.id(),
                            subtaskID: task.getParentSubtask()?.id(),
                            callbackFnIdx,
                            memoryIdx,
                            liftFns,
                            lowerFns,
                            params,
                        }});

                        // If we are in a subtask, and have a fused helper function provided to use
                        // via PrepareCall, we can use that function rather than performing lifting manually.
                        //
                        // See also documentation on `HostIntrinsic::PrepareCall`
                        const subtaskCallMetadata = task.getParentSubtask()?.getCallMetadata();
                        if (subtaskCallMetadata?.returnFn) {{
                            subtaskCallMetadata.returnFn.apply(null, [...params, subtaskCallMetadata.resultPtr]);
                            subtaskCallMetadata.returnFnCalled = true;
                            task.resolve(params);
                            return;
                        }}

                        const expectedMemoryIdx = task.getReturnMemoryIdx();
                        if (expectedMemoryIdx !== null && memoryIdx !== null && expectedMemoryIdx !== memoryIdx) {{
                            {debug_log_fn}("[{task_return_fn}()] mismatched memory indices", {{ expectedMemoryIdx, memoryIdx }});
                            throw new Error('task.return memory [' + memoryIdx + '] does not match task [' + expectedMemoryIdx + ']');
                        }}

                        task.callbackFnIdx = callbackFnIdx;

                        if (!memory && liftFns.length > 4) {{
                            {debug_log_fn}("[{task_return_fn}()] memory not present for max async flat lifts");
                            throw new Error('memory must be present if more than max async flat lifts are performed');
                        }}

                        let liftCtx = {{ memory, useDirectParams, params, componentIdx }};
                        if (!useDirectParams) {{
                            liftCtx.storagePtr = params[0];
                            liftCtx.storageLen = params[1];
                        }}

                        const liftedResults = [];
                        {debug_log_fn}('[{task_return_fn}()] lifting results out of memory', {{ liftCtx }});
                        for (const liftFn of liftFns) {{
                            if (liftCtx.storageLen !== undefined && liftCtx.storageLen <= 0) {{
                                {debug_log_fn}("[{task_return_fn}()] ran out of range while writing");
                                throw new Error('ran out of storage while writing');
                            }}
                            const [ val, newLiftCtx ] = liftFn(liftCtx);
                            liftCtx = newLiftCtx;
                            liftedResults.push(val);
                        }}

                        task.resolve(liftedResults);
                    }}
                "#));
            }

            Self::SubtaskDrop => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let subtask_drop_fn = Self::SubtaskDrop.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!("
                    function {subtask_drop_fn}(componentIdx, subtaskWaitableRep) {{
                        {debug_log_fn}('[{subtask_drop_fn}()] args', {{ componentIdx, subtaskWaitableRep }});

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component is not marked as may leave, cannot be cancelled'); }}

                        const subtask =  cstate.handles.remove(subtaskWaitableRep);
                        if (!subtask) {{ throw new Error('missing/invalid subtask specified for drop in component instance'); }}

                        subtask.drop();
                    }}
                "));
            }

            Self::Yield => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let yield_fn = Self::Yield.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                let get_global_current_task_meta_fn = Intrinsic::GetGlobalCurrentTaskMetaFn.name();

                output.push_str(&format!(
                    "
                    function {yield_fn}(ctx) {{
                        {debug_log_fn}('[{yield_fn}()] args', {{ ctx }});
                        const {{ componentIdx, isCancellable }} = ctx;
                        const {{ taskID }} = {get_global_current_task_meta_fn}(componentIdx);

                        const taskMeta = {current_task_get_fn}(componentIdx, taskID);
                        if (!taskMeta) {{ throw new Error('invalid/missing async task meta'); }}

                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        await task.yield({{ isAsync, isCancellable }});
                    }}
                "
                ));
            }

            Self::SubtaskCancel => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let task_cancel_fn = Self::SubtaskCancel.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let get_global_current_task_meta_fn = Intrinsic::GetGlobalCurrentTaskMetaFn.name();

                output.push_str(&format!("
                    function {task_cancel_fn}(componentIdx, isAsync) {{
                        {debug_log_fn}('[{task_cancel_fn}()] args', {{ componentIdx, isAsync }});

                        const state = {get_or_create_async_state_fn}(componentIdx);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave, cannot be cancelled'); }}

                        const {{ taskID }} = {get_global_current_task_meta_fn}(componentIdx);

                        const taskMeta = {current_task_get_fn}(componentIdx, taskID);
                        if (!taskMeta) {{ throw new Error('invalid/missing async task meta'); }}

                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        if (task.sync && !task.alwaysTaskReturn) {{
                            throw new Error('cannot cancel sync tasks without always task return set');
                        }}
                        if (!task.cancelRequested) {{ throw new Error('task cancellation has not been requested'); }}
                        if (task.borrowedHandles.length > 0) {{ throw new Error('task still has borrow handles'); }}
                        if (task.returnCalls > 0) {{ throw new Error('cannot cancel task that has already returned a value'); }}
                        if (task.cancelled) {{ throw new Error('cannot cancel task that has already been cancelled'); }}

                        task.cancelled = true;
                    }}
                "));
            }

            Self::TaskCancel => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let task_cancel_fn = Self::TaskCancel.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let get_global_current_task_meta_fn = Intrinsic::GetGlobalCurrentTaskMetaFn.name();

                output.push_str(&format!("
                    function {task_cancel_fn}(componentIdx) {{
                        {debug_log_fn}('[{task_cancel_fn}()] args', {{ componentIdx, isAsync }});

                        const state = {get_or_create_async_state_fn}(componentIdx);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave, cannot be cancelled'); }}

                        const {{ taskID }} = {get_global_current_task_meta_fn}(componentIdx);

                        const taskMeta = {current_task_get_fn}(componentIdx, taskID);
                        if (!taskMeta) {{ throw new Error('invalid/missing async task meta'); }}

                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        if (task.sync && !task.alwaysTaskReturn) {{
                            throw new Error('cannot cancel sync tasks without always task return set');
                        }}

                        task.cancel();
                    }}
                "));
            }

            Self::CreateNewCurrentTask => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let task_class = Self::AsyncTaskClass.name();
                let global_task_map = Self::GlobalAsyncCurrentTaskMap.name();
                let task_id_globals = Self::GlobalAsyncCurrentTaskIds.name();
                let component_idx_globals = Self::GlobalAsyncCurrentComponentIdxs.name();

                output.push_str(&format!(
                    r#"
                    function {fn_name}(args) {{
                        {debug_log_fn}('[{fn_name}()] args', args);
                        const {{
                            componentIdx,
                            isAsync,
                            isManualAsync,
                            entryFnName,
                            parentSubtaskID,
                            callbackFnName,
                            getCallbackFn,
                            getParamsFn,
                            stringEncoding,
                            errHandling,
                            getCalleeParamsFn,
                            resultPtr,
                            callingWasmExport,
                        }} = args;
                        if (componentIdx === undefined || componentIdx === null) {{
                            throw new Error('missing/invalid component instance index while starting task');
                        }}
                        let taskMetas = {global_task_map}.get(componentIdx);
                        const callbackFn = getCallbackFn ? getCallbackFn() : null;

                        const newTask = new {task_class}({{
                            componentIdx,
                            isAsync,
                            isManualAsync,
                            entryFnName,
                            callbackFn,
                            callbackFnName,
                            stringEncoding,
                            getCalleeParamsFn,
                            resultPtr,
                            errHandling,
                        }});

                        const newTaskID = newTask.id();
                        const newTaskMeta = {{ id: newTaskID, componentIdx, task: newTask }};

                        // NOTE: do not track host tasks
                        {task_id_globals}.push(newTaskID);
                        {component_idx_globals}.push(componentIdx);

                        if (!taskMetas) {{
                            taskMetas = [newTaskMeta];
                            {global_task_map}.set(componentIdx, [newTaskMeta]);
                        }} else {{
                            taskMetas.push(newTaskMeta);
                        }}

                        return [newTask, newTaskID];
                    }}
                "#,
                    fn_name = self.name(),
                ));
            }

            // Debug log for this is disabled since it is fairly noisy
            Self::GetCurrentTask => {
                let global_task_map = Self::GlobalAsyncCurrentTaskMap.name();
                let current_component_idx_globals =
                    AsyncTaskIntrinsic::GlobalAsyncCurrentComponentIdxs.name();
                output.push_str(&format!(
                    r#"
                    function {fn_name}(componentIdx, taskID) {{
                        let usedGlobal = false;
                        if (componentIdx === undefined || componentIdx === null) {{
                            throw new Error('missing component idx'); // TODO(fix)
                            // componentIdx = {current_component_idx_globals}.at(-1);
                            // usedGlobal = true;
                        }}

                        const taskMetas = {global_task_map}.get(componentIdx);
                        if (taskMetas === undefined || taskMetas.length === 0) {{ return undefined; }}

                        if (taskID) {{
                            return taskMetas.find(meta => meta.task.id() === taskID);
                        }}

                        const taskMeta = taskMetas[taskMetas.length - 1];
                        if (!taskMeta || !taskMeta.task) {{ return undefined; }}

                        return taskMeta;
                    }}
                "#,
                    fn_name = self.name(),
                ));
            }

            Self::ClearCurrentTask => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let fn_name = self.name();
                let global_task_map = Self::GlobalAsyncCurrentTaskMap.name();
                let task_id_globals = Self::GlobalAsyncCurrentTaskIds.name();
                let component_idx_globals = Self::GlobalAsyncCurrentComponentIdxs.name();

                output.push_str(&format!(
                    r#"
                    function {fn_name}(componentIdx, taskID) {{
                        {debug_log_fn}('[{fn_name}()] args', {{ componentIdx, taskID }});

                        if (componentIdx === undefined || componentIdx === null) {{
                            throw new Error('missing/invalid component instance index while ending current task');
                        }}

                        const tasks = {global_task_map}.get(componentIdx);
                        if (!tasks || !Array.isArray(tasks)) {{
                            throw new Error('missing/invalid tasks for component instance while ending task');
                        }}
                        if (tasks.length == 0) {{
                            throw new Error(`no current tasks for component instance [${{componentIdx}}] while ending task`);
                        }}

                        if (taskID !== undefined) {{
                            const last = tasks[tasks.length - 1];
                            if (last.id !== taskID) {{
                                // throw new Error('current task does not match expected task ID');
                                return;
                            }}
                        }}

                        {task_id_globals}.pop();
                        {component_idx_globals}.pop();

                        const taskMeta = tasks.pop();
                        return taskMeta.task;
                    }}
                "#,
                ));
            }

            // NOTE: since threads are not yet supported, places that would have called out to threads instead run
            // `immediate<original function>` -- i.e. `Thread#suspendUntil` becomes `AsyncTask#immediateSuspendUntil`
            Self::AsyncTaskClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let event_code_enum = Intrinsic::AsyncEventCodeEnum.name();
                let task_class = Self::AsyncTaskClass.name();
                let subtask_class = Self::AsyncSubtaskClass.name();

                let global_async_determinism = Intrinsic::GlobalAsyncDeterminism.name();
                let coin_flip_fn = Intrinsic::CoinFlip.name();
                let waitable_class = Intrinsic::Waitable(WaitableIntrinsic::WaitableClass).name();
                let clear_current_task_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::ClearCurrentTask).name();

                output.push_str(&format!(r#"
                    class {task_class} {{
                        static _ID = 0n;

                        static State = {{
                            INITIAL: 'initial',
                            CANCELLED: 'cancelled',
                            CANCEL_PENDING: 'cancel-pending',
                            CANCEL_DELIVERED: 'cancel-delivered',
                            RESOLVED: 'resolved',
                        }}

                        static BlockResult = {{
                            CANCELLED: 'block.cancelled',
                            NOT_CANCELLED: 'block.not-cancelled',
                        }}

                        #id;
                        #componentIdx;
                        #state;
                        #isAsync;
                        #isManualAsync;
                        #entryFnName = null;

                        #onResolveHandlers = [];
                        #completionPromise = null;
                        #rejected = false;

                        #exitPromise = null;
                        #onExitHandlers = [];

                        #memoryIdx = null;
                        #memory = null;

                        #callbackFn = null;
                        #callbackFnName = null;

                        #postReturnFn = null;

                        #getCalleeParamsFn = null;

                        #stringEncoding = null;

                        #parentSubtask = null;

                        #needsExclusiveLock = false;

                        #errHandling;

                        #backpressurePromise;
                        #backpressureWaiters = 0n;

                        #returnLowerFns = null;

                        #subtasks = [];

                        #entered = false;
                        #exited = false;
                        #errored = null;

                        cancelled = false;
                        cancelRequested = false;
                        alwaysTaskReturn = false;

                        returnCalls =  0;
                        storage = [0, 0];
                        borrowedHandles = {{}};

                        constructor(opts) {{
                           this.#id = ++{task_class}._ID;

                           if (opts?.componentIdx === undefined) {{
                               throw new TypeError('missing component id during task creation');
                           }}
                           this.#componentIdx = opts.componentIdx;

                           this.#state = {task_class}.State.INITIAL;
                           this.#isAsync = opts?.isAsync ?? false;
                           this.#isManualAsync = opts?.isManualAsync ?? false;
                           this.#entryFnName = opts.entryFnName;

                           const {{
                               promise: completionPromise,
                               resolve: resolveCompletionPromise,
                               reject: rejectCompletionPromise,
                           }} = promiseWithResolvers();
                           this.#completionPromise = completionPromise;

                           this.#onResolveHandlers.push((results) => {{
                               if (this.#errored !== null) {{
                                   rejectCompletionPromise(this.#errored);
                                   return;
                               }} else if (this.#rejected) {{
                                   rejectCompletionPromise(results);
                                   return;
                               }}
                               resolveCompletionPromise(results);
                           }});

                           const {{
                               promise: exitPromise,
                               resolve: resolveExitPromise,
                               reject: rejectExitPromise,
                           }} = promiseWithResolvers();
                           this.#exitPromise = exitPromise;

                           this.#onExitHandlers.push(() => {{
                               resolveExitPromise();
                           }});

                           if (opts.callbackFn) {{ this.#callbackFn = opts.callbackFn; }}
                           if (opts.callbackFnName) {{ this.#callbackFnName = opts.callbackFnName; }}

                           if (opts.getCalleeParamsFn) {{ this.#getCalleeParamsFn = opts.getCalleeParamsFn; }}

                           if (opts.stringEncoding) {{ this.#stringEncoding = opts.stringEncoding; }}

                           if (opts.parentSubtask) {{ this.#parentSubtask = opts.parentSubtask; }}

                           this.#needsExclusiveLock = this.isSync() || !this.hasCallback();

                           if (opts.errHandling) {{ this.#errHandling = opts.errHandling; }}
                        }}

                        taskState() {{ return this.#state; }}
                        id() {{ return this.#id; }}
                        componentIdx() {{ return this.#componentIdx; }}
                        entryFnName() {{ return this.#entryFnName; }}

                        completionPromise() {{ return this.#completionPromise; }}
                        exitPromise() {{ return this.#exitPromise; }}

                        isAsync() {{ return this.#isAsync; }}
                        isSync() {{ return !this.isAsync(); }}

                        getErrHandling() {{ return this.#errHandling; }}

                        hasCallback() {{ return this.#callbackFn !== null; }}

                        getReturnMemoryIdx() {{ return this.#memoryIdx; }}
                        setReturnMemoryIdx(idx) {{
                            if (idx === null) {{ return; }}
                            this.#memoryIdx = idx;
                        }}

                        getReturnMemory() {{ return this.#memory; }}
                        setReturnMemory(m) {{
                            if (m === null) {{ return; }}
                            this.#memory = m;
                        }}

                        setReturnLowerFns(fns) {{ this.#returnLowerFns = fns; }}
                        getReturnLowerFns() {{ return this.#returnLowerFns; }}

                        setParentSubtask(subtask) {{
                            if (!subtask || !(subtask instanceof {subtask_class})) {{ return }}
                            if (this.#parentSubtask) {{ throw new Error('parent subtask can only be set once'); }}
                            this.#parentSubtask = subtask;
                        }}

                        getParentSubtask() {{ return this.#parentSubtask; }}

                        // TODO(threads): this is very inefficient, we can pass along a root task,
                        // and ideally do not need this once thread support is in place
                        getRootTask() {{
                            let currentSubtask = this.getParentSubtask();
                            let task = this;
                            while (currentSubtask) {{
                                task = currentSubtask.getParentTask();
                                currentSubtask = task.getParentSubtask();
                            }}
                            return task;
                        }}

                        setPostReturnFn(f) {{
                            if (!f) {{ return; }}
                            if (this.#postReturnFn) {{ throw new Error('postReturn fn can only be set once'); }}
                            this.#postReturnFn = f;
                        }}

                        setCallbackFn(f, name) {{
                            if (!f) {{ return; }}
                            if (this.#callbackFn) {{ throw new Error('callback fn can only be set once'); }}
                            this.#callbackFn = f;
                            this.#callbackFnName = name;
                        }}

                        getCallbackFnName() {{
                            if (!this.#callbackFnName) {{ return undefined; }}
                            return this.#callbackFnName;
                        }}

                        async runCallbackFn(...args) {{
                            if (!this.#callbackFn) {{ throw new Error('on callback function has been set for task'); }}
                            return await this.#callbackFn.apply(null, args);
                        }}

                        getCalleeParams() {{
                            if (!this.#getCalleeParamsFn) {{ throw new Error('missing/invalid getCalleeParamsFn'); }}
                            return this.#getCalleeParamsFn();
                        }}

                        mayBlock() {{ return this.isAsync() || this.isResolvedState() }}

                        mayEnter(task) {{
                            const cstate = {get_or_create_async_state_fn}(this.#componentIdx);
                            if (cstate.hasBackpressure()) {{
                                {debug_log_fn}('[{task_class}#mayEnter()] disallowed due to backpressure', {{ taskID: this.#id }});
                                return false;
                            }}
                            if (!cstate.callingSyncImport()) {{
                                {debug_log_fn}('[{task_class}#mayEnter()] disallowed due to sync import call', {{ taskID: this.#id }});
                                return false;
                            }}
                            const callingSyncExportWithSyncPending = cstate.callingSyncExport && !task.isAsync;
                            if (!callingSyncExportWithSyncPending) {{
                                {debug_log_fn}('[{task_class}#mayEnter()] disallowed due to sync export w/ sync pending', {{ taskID: this.#id }});
                                return false;
                            }}
                            return true;
                        }}

                        enterSync() {{
                            if (this.needsExclusiveLock()) {{
                                const cstate = {get_or_create_async_state_fn}(this.#componentIdx);
                                cstate.exclusiveLock();
                            }}
                            return true;
                        }}

                        async enter(opts) {{
                            {debug_log_fn}('[{task_class}#enter()] args', {{
                                taskID: this.#id,
                                componentIdx: this.#componentIdx,
                                subtaskID: this.getParentSubtask()?.id(),
                            }});

                            if (this.#entered) {{
                                throw new Error(`task with ID [${{this.#id}}] should not be entered twice`);
                            }}

                            const cstate = {get_or_create_async_state_fn}(this.#componentIdx);

                            // If a task is either synchronous or host-provided (e.g. a host import, whether sync or async)
                            // then we can avoid component-relevant tracking and immediately enter
                            if (this.isSync() || opts?.isHost) {{
                                this.#entered = true;

                                // TODO(breaking): remove once manually-spccifying async fns is removed
                                // It is currently possible for an actually sync export to be specified
                                // as async via JSPI
                                if (this.#isManualAsync) {{
                                    if (this.needsExclusiveLock()) {{ cstate.exclusiveLock(); }}
                                }}

                                return this.#entered;
                            }}

                            if (cstate.hasBackpressure()) {{
                                cstate.addBackpressureWaiter();

                                const result = await this.waitUntil({{
                                    readyFn: () => !cstate.hasBackpressure(),
                                    cancellable: true,
                                }});

                                cstate.removeBackpressureWaiter();

                                if (result === {task_class}.BlockResult.CANCELLED) {{
                                    this.cancel();
                                    return false;
                                }}
                            }}

                            if (this.needsExclusiveLock()) {{ cstate.exclusiveLock(); }}

                            this.#entered = true;
                            return this.#entered;
                        }}

                        isRunningState() {{ return this.#state !== {task_class}.State.RESOLVED; }}
                        isResolvedState() {{ return this.#state === {task_class}.State.RESOLVED; }}
                        isResolved() {{ return this.#state === {task_class}.State.RESOLVED; }}

                        async waitUntil(opts) {{
                            const {{ readyFn, waitableSetRep, cancellable }} = opts;
                            {debug_log_fn}('[{task_class}#waitUntil()] args', {{ taskID: this.#id, waitableSetRep, cancellable }});

                            const state = {get_or_create_async_state_fn}(this.#componentIdx);
                            const wset = state.handles.get(waitableSetRep);

                            let event;

                            wset.incrementNumWaiting();

                            const keepGoing = await this.suspendUntil({{
                                readyFn: () => {{
                                    const hasPendingEvent = wset.hasPendingEvent();
                                    const ready = readyFn();
                                    return ready && hasPendingEvent;
                                }},
                                cancellable,
                            }});

                            if (keepGoing) {{
                                event = wset.getPendingEvent();
                            }} else {{
                                event = {{
                                    code: {event_code_enum}.TASK_CANCELLED,
                                    payload0: 0,
                                    payload1: 0,
                                }};
                            }}

                            wset.decrementNumWaiting();

                            return event;
                        }}

                        async yieldUntil(opts) {{
                            const {{ readyFn, cancellable }} = opts;
                            {debug_log_fn}('[{task_class}#yieldUntil()] args', {{ taskID: this.#id, cancellable }});

                            const keepGoing = await this.suspendUntil({{ readyFn, cancellable }});
                            if (keepGoing) {{
                                return {{
                                    code: {event_code_enum}.NONE,
                                    payload0: 0,
                                    payload1: 0,
                                }};
                            }}

                            return {{
                                code: {event_code_enum}.TASK_CANCELLED,
                                payload0: 0,
                                payload1: 0,
                            }};
                        }}

                        async suspendUntil(opts) {{
                            const {{ cancellable, readyFn }} = opts;
                            {debug_log_fn}('[{task_class}#suspendUntil()] args', {{ cancellable }});

                            const pendingCancelled = this.deliverPendingCancel({{ cancellable }});
                            if (pendingCancelled) {{ return false; }}

                            const completed = await this.immediateSuspendUntil({{ readyFn, cancellable }});
                            return completed;
                        }}

                        // TODO(threads): equivalent to thread.suspend_until()
                        async immediateSuspendUntil(opts) {{
                            const {{ cancellable, readyFn }} = opts;
                            {debug_log_fn}('[{task_class}#immediateSuspendUntil()] args', {{ cancellable, readyFn }});

                            const ready = readyFn();
                            if (ready && {global_async_determinism} === 'random') {{
                                const coinFlip = {coin_flip_fn}();
                                if (coinFlip) {{ return true }}
                            }}

                            const keepGoing = await this.immediateSuspend({{ cancellable, readyFn }});
                            return keepGoing;
                        }}

                        async immediateSuspend(opts) {{ // NOTE: equivalent to thread.suspend()
                            // TODO(threads): store readyFn on the thread
                            const {{ cancellable, readyFn }} = opts;
                            {debug_log_fn}('[{task_class}#immediateSuspend()] args', {{ cancellable, readyFn }});

                            const pendingCancelled = this.deliverPendingCancel({{ cancellable }});
                            if (pendingCancelled) {{ return false; }}

                            const cstate = {get_or_create_async_state_fn}(this.#componentIdx);
                            const keepGoing = await cstate.suspendTask({{ task: this, readyFn }});
                            return keepGoing;
                        }}

                        deliverPendingCancel(opts) {{
                            const {{ cancellable }} = opts;
                            {debug_log_fn}('[{task_class}#deliverPendingCancel()] args', {{ cancellable }});

                            if (cancellable && this.#state === {task_class}.State.PENDING_CANCEL) {{
                                this.#state = {task_class}.State.CANCEL_DELIVERED;
                                return true;
                            }}

                            return false;
                        }}

                        isCancelled() {{ return this.cancelled }}

                        cancel(args) {{
                            {debug_log_fn}('[{task_class}#cancel()] args', {{ }});
                            if (this.taskState() !== {task_class}.State.CANCEL_DELIVERED) {{
                                throw new Error(`(component [${{this.#componentIdx}}]) task [${{this.#id}}] invalid task state [${{this.taskState()}}] for cancellation`);
                            }}
                            if (this.borrowedHandles.length > 0) {{ throw new Error('task still has borrow handles'); }}
                            this.cancelled = true;
                            this.onResolve(args?.error ?? new Error('task cancelled'));
                            this.#state = {task_class}.State.RESOLVED;
                        }}

                        onResolve(taskValue) {{
                            const handlers = this.#onResolveHandlers;
                            this.#onResolveHandlers = [];
                            for (const f of handlers) {{
                                try {{
                                    // TODO(fix): resolve handlers getting called a ton?
                                    f(taskValue);
                                }} catch (err) {{
                                    {debug_log_fn}("[{task_class}#onResolve] error during task resolve handler", err);
                                    throw err;
                                }}
                            }}

                            if (this.#parentSubtask) {{
                                const meta = this.#parentSubtask.getCallMetadata();
                                // Run the rturn fn if it has not already been called -- this *should* have happened in
                                // `task.return`, but some paths do not go through task.return (e.g. async lower of sync fn
                                // which goes through prepare + async-start-call)
                                if (meta.returnFn && !meta.returnFnCalled) {{
                                    {debug_log_fn}('[{task_class}#onResolve()] running returnFn', {{
                                        componentIdx: this.#componentIdx,
                                        taskID: this.#id,
                                        subtaskID: this.#parentSubtask.id(),
                                    }});
                                    const memory = meta.getMemoryFn();
                                    meta.returnFn.apply(null, [taskValue, meta.resultPtr]);
                                    meta.returnFnCalled = true;
                                }}
                            }}

                            if (this.#postReturnFn) {{
                                {debug_log_fn}('[{task_class}#onResolve()] running post return ', {{
                                    componentIdx: this.#componentIdx,
                                    taskID: this.#id,
                                }});
                                try {{
                                    this.#postReturnFn(taskValue);
                                }} catch (err) {{
                                    {debug_log_fn}("[{task_class}#onResolve] error during task resolve handler", err);
                                    throw err;
                                }}
                            }}

                            if (this.#parentSubtask) {{
                                this.#parentSubtask.onResolve(taskValue);
                            }}
                        }}

                        registerOnResolveHandler(f) {{
                            this.#onResolveHandlers.push(f);
                        }}

                        isRejected() {{ return this.#rejected; }}

                        setErrored(err) {{
                            this.#errored = err;
                        }}

                        reject(taskErr) {{
                            {debug_log_fn}('[{task_class}#reject()] args', {{
                                componentIdx: this.#componentIdx,
                                taskID: this.#id,
                                parentSubtask: this.#parentSubtask,
                                parentSubtaskID: this.#parentSubtask?.id(),
                                entryFnName: this.entryFnName(),
                                callbackFnName: this.#callbackFnName,
                                errMsg: taskErr.message,
                            }});

                            if (this.isResolvedState() || this.#rejected) {{ return; }}

                            console.log("SUBTASKS?", this.#subtasks);
                            console.log("UPPER??", this.#parentSubtask);
                            for (const subtask of this.#subtasks) {{
                                subtask.reject(taskErr);
                            }}

                            this.#rejected = true;
                            this.cancelRequested = true;
                            this.#state = {task_class}.State.PENDING_CANCEL;
                            const cancelled = this.deliverPendingCancel({{ cancellable: true }});

// TODO: do cleanup here to reset the machinery so we can run again?


                            this.cancel({{ error: taskErr }});
                        }}

                        resolve(results) {{
                            {debug_log_fn}('[{task_class}#resolve()] args', {{
                                componentIdx: this.#componentIdx,
                                taskID: this.#id,
                                entryFnName: this.entryFnName(),
                                callbackFnName: this.#callbackFnName,
                            }});

                            if (this.#state === {task_class}.State.RESOLVED) {{
                                throw new Error(`(component [${{this.#componentIdx}}]) task [${{this.#id}}]  is already resolved (did you forget to wait for an import?)`);
                            }}

                            if (this.borrowedHandles.length > 0) {{
                                throw new Error('task still has borrow handles');
                            }}

                            this.#state = {task_class}.State.RESOLVED;

                            switch (results.length) {{
                                case 0:
                                    this.onResolve(undefined);
                                    break;
                                case 1:
                                    this.onResolve(results[0]);
                                    break;
                                default:
                                    {debug_log_fn}('[{task_class}#resolve()] unexpected number of results', {{
                                        componentIdx: this.#componentIdx,
                                        results,
                                        taskID: this.#id,
                                        subtaskID: this.#parentSubtask?.id(),
                                        entryFnName: this.#entryFnName,
                                        callbackFnName: this.#callbackFnName,
                                    }});
                                    throw new Error('unexpected number of results');
                            }}
                        }}

                        exit() {{
                            {debug_log_fn}('[{task_class}#exit()]', {{
                                componentIdx: this.#componentIdx,
                                taskID: this.#id,
                            }});

                            if (this.#exited)  {{ throw new Error("task has already exited"); }}

                            if (this.#state !== {task_class}.State.RESOLVED) {{
                                // TODO(fix): only fused, manually specified post returns seem to break this invariant,
                                // as the TaskReturn trampoline is not activated it seems.
                                //
                                // see: test/p3/ported/wasmtime/component-async/post-return.js
                                //
                                // We *should* be able to upgrade this to be more strict and throw at some point,
                                // which may involve rewriting the upstream test to surface task return manually somehow.
                                //
                                //throw new Error(`(component [${{this.#componentIdx}}]) task [${{this.#id}}] exited without resolution`);
                                {debug_log_fn}('[{task_class}#exit()] task exited without resolution', {{
                                    componentIdx: this.#componentIdx,
                                    taskID: this.#id,
                                    subtask: this.getParentSubtask(),
                                    subtaskID: this.getParentSubtask()?.id(),
                                }});
                                this.#state = {task_class}.State.RESOLVED;
                            }}

                            if (this.borrowedHandles > 0) {{
                                throw new Error('task [${{this.#id}}] exited without clearing borrowed handles');
                            }}

                            const state = {get_or_create_async_state_fn}(this.#componentIdx);
                            if (!state) {{ throw new Error('missing async state for component [' + this.#componentIdx + ']'); }}

                            // Exempt the host from exclusive lock check
                            if (this.#componentIdx !== -1 && this.needsExclusiveLock() && !state.isExclusivelyLocked()) {{
                               throw new Error(`task [${{this.#id}}] exit: component [${{this.#componentIdx}}] should have been exclusively locked`);
                            }}

                            state.exclusiveRelease();

                            for (const f of this.#onExitHandlers) {{
                                try {{
                                    f();
                                }} catch (err) {{
                                    console.error("error during task exit handler", err);
                                    throw err;
                                }}
                            }}

                            this.#exited = true;
                            {clear_current_task_fn}(this.#componentIdx, this.id());
                        }}

                        needsExclusiveLock() {{
                            return !this.#isAsync || this.hasCallback();
                        }}

                        createSubtask(args) {{
                            {debug_log_fn}('[{task_class}#createSubtask()] args', args);
                            const {{ componentIdx, childTask, callMetadata, fnName, isAsync, isManualAsync }} = args;

                            const cstate = {get_or_create_async_state_fn}(this.#componentIdx);
                            if (!cstate) {{
                                throw new Error(`invalid/missing async state for component idx [${{componentIdx}}]`);
                            }}

                            const waitable = new {waitable_class}({{
                                componentIdx: this.#componentIdx,
                                target: `subtask (internal ID [${{this.#id}}])`,
                            }});

                            const newSubtask = new {subtask_class}({{
                                componentIdx,
                                childTask,
                                parentTask: this,
                                callMetadata,
                                isAsync,
                                isManualAsync,
                                fnName,
                                waitable,
                            }});
                            this.#subtasks.push(newSubtask);
                            newSubtask.setTarget(`subtask (internal ID [${{newSubtask.id()}}], waitable [${{waitable.idx()}}], component [${{componentIdx}}])`);
                            waitable.setIdx(cstate.handles.insert(newSubtask));
                            waitable.setTarget(`waitable for subtask (waitable id [${{waitable.idx()}}], subtask internal ID [${{newSubtask.id()}}])`);

                            return newSubtask;
                        }}

                        getLatestSubtask() {{
                            return this.#subtasks.at(-1);
                        }}

                        getSubtaskByWaitableRep(rep) {{
                            if (rep === undefined) {{ throw new TypeError('missing rep'); }}
                            return this.#subtasks.find(s => s.waitableRep() === rep);
                        }}

                        currentSubtask() {{
                            {debug_log_fn}('[{task_class}#currentSubtask()]');
                            if (this.#subtasks.length === 0) {{ return undefined; }}
                            return this.#subtasks.at(-1);
                        }}

                        removeSubtask(subtask) {{
                            if (this.#subtasks.length === 0) {{ throw new Error('cannot end current subtask: no current subtask'); }}
                            this.#subtasks = this.#subtasks.filter(t => t !== subtask);
                            return subtask;
                        }}
                    }}
                "#));
            }

            Self::AsyncSubtaskClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let subtask_class = Self::AsyncSubtaskClass.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let lookup_memories_for_component = Intrinsic::LookupMemoriesForComponent.name();

                output.push_str(&format!(r#"
                    class {subtask_class} {{
                        static _ID = 0n;

                        static State = {{
                            STARTING: 0,
                            STARTED: 1,
                            RETURNED: 2,
                            CANCELLED_BEFORE_STARTED: 3,
                            CANCELLED_BEFORE_RETURNED: 4,
                        }};

                        #id;
                        #state = {subtask_class}.State.STARTING;
                        #componentIdx;

                        #parentTask;
                        #childTask = null;

                        #dropped = false;
                        #cancelRequested = false;

                        #memoryIdx = null;
                        #lenders = null;

                        #waitable = null;

                        #callbackFn = null;
                        #callbackFnName = null;

                        #postReturnFn = null;
                        #onProgressFn = null;
                        #pendingEventFn = null;

                        #callMetadata = {{}};

                        #resolved = false;

                        #onResolveHandlers = [];
                        #onStartHandlers = [];

                        #result = null;
                        #resultSet = false;

                        fnName;
                        target;
                        isAsync;
                        isManualAsync;

                        constructor(args) {{
                            if (typeof args.componentIdx !== 'number') {{
                                throw new Error('invalid componentIdx for subtask creation');
                            }}
                            this.#componentIdx = args.componentIdx;

                            this.#id = ++{subtask_class}._ID;
                            this.fnName = args.fnName;

                            if (!args.parentTask) {{ throw new Error('missing parent task during subtask creation'); }}
                            this.#parentTask = args.parentTask;

                            if (args.childTask) {{ this.#childTask = args.childTask; }}

                            if (args.memoryIdx) {{ this.#memoryIdx = args.memoryIdx; }}

                            if (!args.waitable) {{ throw new Error("missing/invalid waitable"); }}
                            this.#waitable = args.waitable;

                            if (args.callMetadata) {{ this.#callMetadata = args.callMetadata; }}

                            this.#lenders = [];
                            this.target = args.target;
                            this.isAsync = args.isAsync;
                            this.isManualAsync = args.isManualAsync;
                        }}

                        id() {{ return this.#id; }}
                        parentTaskID() {{ return this.#parentTask?.id(); }}
                        childTaskID() {{ return this.#childTask?.id(); }}
                        state() {{ return this.#state; }}

                        waitable() {{ return this.#waitable; }}
                        waitableRep() {{ return this.#waitable.idx(); }}

                        join() {{ return this.#waitable.join(...arguments); }}
                        getPendingEvent() {{ return this.#waitable.getPendingEvent(...arguments); }}
                        hasPendingEvent() {{ return this.#waitable.hasPendingEvent(...arguments); }}
                        setPendingEvent() {{ return this.#waitable.setPendingEvent(...arguments); }}

                        setTarget(tgt) {{ this.target = tgt; }}

                        getResult() {{
                            if (!this.#resultSet) {{ throw new Error("subtask result has not been set") }}
                            return this.#result;
                        }}
                        setResult(v) {{
                            if (this.#resultSet) {{ throw new Error("subtask result has already been set"); }}
                            this.#result = v;
                            this.#resultSet = true;
                        }}

                        componentIdx() {{ return this.#componentIdx; }}

                        setChildTask(t) {{
                            if (!t) {{ throw new Error('cannot set missing/invalid child task on subtask'); }}
                            if (this.#childTask) {{ throw new Error('child task is already set on subtask'); }}
                            if (this.#parentTask === t) {{ throw new Error("parent cannot be child"); }}
                            this.#childTask = t;
                        }}
                        getChildTask(t) {{ return this.#childTask; }}

                        getParentTask() {{ return this.#parentTask; }}

                        setCallbackFn(f, name) {{
                            if (!f) {{ return; }}
                            if (this.#callbackFn) {{ throw new Error('callback fn can only be set once'); }}
                            this.#callbackFn = f;
                            this.#callbackFnName = name;
                        }}

                        getCallbackFnName() {{
                            if (!this.#callbackFn) {{ return undefined; }}
                            return this.#callbackFn.name;
                        }}

                        setPostReturnFn(f) {{
                            if (!f) {{ return; }}
                            if (this.#postReturnFn) {{ throw new Error('postReturn fn can only be set once'); }}
                            this.#postReturnFn = f;
                        }}

                        setOnProgressFn(f) {{
                            if (this.#onProgressFn) {{ throw new Error('on progress fn can only be set once'); }}
                            this.#onProgressFn = f;
                        }}

                        isNotStarted() {{
                            return this.#state == {subtask_class}.State.STARTING;
                        }}

                        registerOnStartHandler(f) {{
                            this.#onStartHandlers.push(f);
                        }}

                        onStart(args) {{
                            {debug_log_fn}('[{subtask_class}#onStart()] args', {{
                                componentIdx: this.#componentIdx,
                                subtaskID: this.#id,
                                parentTaskID: this.parentTaskID(),
                                fnName: this.fnName,
                            }});

                            if (this.#onProgressFn) {{ this.#onProgressFn(); }}

                            this.#state = {subtask_class}.State.STARTED;

                            let result;

                            // If we have been provided a helper start function as a result of
                            // component fusion performed by wasmtime tooling, then we can call that helper and lifts/lowers will
                            // be performed for us.
                            //
                            // See also documentation on `HostIntrinsic::PrepareCall`
                            //
                            if (this.#callMetadata.startFn) {{
                                result = this.#callMetadata.startFn.apply(null, args?.startFnParams ?? []);
                            }}

                            return result;
                        }}


                        registerOnResolveHandler(f) {{
                            this.#onResolveHandlers.push(f);
                        }}

                        reject(subtaskErr) {{
                            this.#childTask?.reject(subtaskErr);
                        }}

                        onResolve(subtaskValue) {{
                            {debug_log_fn}('[{subtask_class}#onResolve()] args', {{
                                componentIdx: this.#componentIdx,
                                subtaskID: this.#id,
                                isAsync: this.isAsync,
                                childTaskID: this.childTaskID(),
                                parentTaskID: this.parentTaskID(),
                                parentTaskFnName: this.#parentTask?.entryFnName(),
                                fnName: this.fnName,
                            }});

                            if (this.#resolved) {{
                                throw new Error('subtask has already been resolved');
                            }}

                            if (this.#onProgressFn) {{ this.#onProgressFn(); }}

                            if (subtaskValue === null) {{
                                if (this.#cancelRequested) {{
                                    throw new Error('cancel was not requested, but no value present at return');
                                }}

                                if (this.#state === {subtask_class}.State.STARTING) {{
                                    this.#state = {subtask_class}.State.CANCELLED_BEFORE_STARTED;
                                }} else {{
                                    if (this.#state !== {subtask_class}.State.STARTED) {{
                                        throw new Error('resolved subtask must have been started before cancellation');
                                    }}
                                    this.#state = {subtask_class}.State.CANCELLED_BEFORE_RETURNED;
                                }}
                            }} else {{
                                if (this.#state !== {subtask_class}.State.STARTED) {{
                                    throw new Error('resolved subtask must have been started before completion');
                                }}
                                this.#state = {subtask_class}.State.RETURNED;
                            }}

                            this.setResult(subtaskValue);

                            for (const f of this.#onResolveHandlers) {{
                                try {{
                                    f(subtaskValue);
                                }} catch (err) {{
                                    console.error("error during subtask resolve handler", err);
                                    throw err;
                                }}
                            }}

                            const callMetadata = this.getCallMetadata();

                            // TODO(fix): we should be able to easily have the caller's meomry
                            // to lower into here, but it's not present in PrepareCall
                            const memory = callMetadata.memory ?? this.#parentTask?.getReturnMemory() ?? {lookup_memories_for_component}({{ componentIdx: this.#parentTask?.componentIdx() }})[0];
                            if (callMetadata && !callMetadata.returnFn && this.isAsync && callMetadata.resultPtr && memory) {{
                                const {{ resultPtr, realloc }} = callMetadata;
                                const lowers = callMetadata.lowers; // may have been updated in task.return of the child
                                if (lowers && lowers.length > 0) {{
                                    lowers[0]({{
                                        componentIdx: this.#componentIdx,
                                        memory,
                                        realloc,
                                        vals: [subtaskValue],
                                        storagePtr: resultPtr,
                                    }});
                                }}
                            }}

                            this.#resolved = true;
                            this.#parentTask.removeSubtask(this);
                        }}

                        getStateNumber() {{ return this.#state; }}
                        isReturned() {{ return this.#state === {subtask_class}.State.RETURNED; }}

                        getCallMetadata() {{ return this.#callMetadata; }}

                        isResolved() {{
                            if (this.#state === {subtask_class}.State.STARTING
                                || this.#state === {subtask_class}.State.STARTED) {{
                                return false;
                            }}
                            if (this.#state === {subtask_class}.State.RETURNED
                                || this.#state === {subtask_class}.State.CANCELLED_BEFORE_STARTED
                                || this.#state === {subtask_class}.State.CANCELLED_BEFORE_RETURNED) {{
                                return true;
                            }}
                            throw new Error('unrecognized internal Subtask state [' + this.#state + ']');
                        }}

                        addLender(handle) {{
                            {debug_log_fn}('[{subtask_class}#addLender()] args', {{ handle }});
                            if (!Number.isNumber(handle)) {{ throw new Error('missing/invalid lender handle [' + handle + ']'); }}

                            if (this.#lenders.length === 0 || this.isResolved()) {{
                                throw new Error('subtask has no lendors or has already been resolved');
                            }}

                            handle.lends++;
                            this.#lenders.push(handle);
                        }}

                        deliverResolve() {{
                            {debug_log_fn}('[{subtask_class}#deliverResolve()] args', {{
                                lenders: this.#lenders,
                                parentTaskID: this.parentTaskID(),
                                subtaskID: this.#id,
                                childTaskID: this.childTaskID(),
                                resolved: this.isResolved(),
                                resolveDelivered: this.resolveDelivered(),
                            }});

                            const cannotDeliverResolve = this.resolveDelivered() || !this.isResolved();
                            if (cannotDeliverResolve) {{
                                throw new Error('subtask cannot deliver resolution twice, and the subtask must be resolved');
                            }}

                            for (const lender of this.#lenders) {{
                                lender.lends--;
                            }}

                            this.#lenders = null;
                        }}

                        resolveDelivered() {{
                            {debug_log_fn}('[{subtask_class}#resolveDelivered()] args', {{ }});
                            if (this.#lenders === null && !this.isResolved()) {{
                                throw new Error('invalid subtask state, lenders missing and subtask has not been resolved');
                            }}
                            return this.#lenders === null;
                        }}

                        drop() {{
                            {debug_log_fn}('[{subtask_class}#drop()] args', {{
                                componentIdx: this.#componentIdx,
                                parentTaskID: this.#parentTask?.id(),
                                parentTaskFnName: this.#parentTask?.entryFnName(),
                                childTaskID: this.#childTask?.id(),
                                childTaskFnName: this.#childTask?.entryFnName(),
                                subtaskFnName: this.fnName,
                            }});
                            if (!this.#waitable) {{ throw new Error('missing/invalid inner waitable'); }}
                            if (!this.resolveDelivered()) {{
                                throw new Error('cannot drop subtask before resolve is delivered');
                            }}
                            if (this.#waitable) {{ this.#waitable.drop() }}
                            this.#dropped = true;
                        }}

                        #getComponentState() {{
                            const state = {get_or_create_async_state_fn}(this.#componentIdx);
                            if (!state) {{
                                throw new Error('invalid/missing async state for component [' + componentIdx + ']');
                            }}
                            return state;
                        }}

                        getWaitableHandleIdx() {{
                            {debug_log_fn}('[{subtask_class}#getWaitableHandleIdx()] args', {{ }});
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            return this.waitableRep();
                        }}
                    }}
                "#));
            }

            Self::UnpackCallbackResult => {
                let unpack_callback_result_fn = Self::UnpackCallbackResult.name();
                let i32_typecheck_fn = Intrinsic::TypeCheckValidI32.name();
                output.push_str(&format!("
                    function {unpack_callback_result_fn}(result) {{
                        if (!({i32_typecheck_fn}(result))) {{ throw new Error('invalid callback return value [' + result + '], not a valid i32'); }}
                        const eventCode = result & 0xF;
                        if (eventCode < 0 || eventCode > 3) {{
                            throw new Error('invalid async return value [' + eventCode + '], outside callback code range');
                        }}
                        if (result < 0 || result >= 2**32) {{ throw new Error('invalid callback result'); }}
                        // TODO: table max length check?
                        const waitableSetRep = result >> 4;
                        return [eventCode, waitableSetRep];
                    }}
                ",
                ));
            }

            Self::DriverLoop => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let driver_loop_fn = Self::DriverLoop.name();
                let i32_typecheck = Intrinsic::TypeCheckValidI32.name();
                let to_int32_fn = Intrinsic::Conversion(ConversionIntrinsic::ToInt32).name();
                let unpack_callback_result_fn = Self::UnpackCallbackResult.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();

                output.push_str(&format!(r#"
                    async function {driver_loop_fn}(args) {{
                        {debug_log_fn}('[{driver_loop_fn}()] args', args);
                        const {{
                            componentState,
                            task,
                            fnName,
                            isAsync,
                        }} = args;
                        let callbackResult = args.callbackResult;

                        const callbackFnName = task.getCallbackFnName();
                        const componentIdx = task.componentIdx();

                        if (callbackResult instanceof Promise) {{
                            throw new Error("callbackResult should be a value, not a promise");
                        }}

                        if (callbackResult === undefined) {{
                            throw new Error("callback result should never be undefined");
                        }}

                        let callbackCode;
                        let waitableSetRep;
                        let unpacked;
                        try {{
                            if (!({i32_typecheck}(callbackResult))) {{
                                throw new Error('invalid callback result [' + callbackResult + '], not a number');
                            }}

                            unpacked = {unpack_callback_result_fn}(callbackResult);
                            callbackCode = unpacked[0];
                            waitableSetRep = unpacked[1];
                        }} catch(err) {{
                            console.error("failed to unpack callback result", err);
                            throw err;
                        }}

                        if (callbackCode < 0 || callbackCode > 3) {{
                            throw new Error('invalid async return value, outside callback code range');
                        }}

                        let eventCode;
                        let index;
                        let result;
                        let asyncRes;
                        try {{
                            while (true) {{
                                if (callbackCode !== 0) {{ componentState.exclusiveRelease(); }}

                                switch (callbackCode) {{
                                    case 0: // EXIT
                                        {debug_log_fn}('[{driver_loop_fn}()] async exit indicated', {{
                                            fnName,
                                            componentIdx,
                                            callbackFnName,
                                            taskID: task.id()
                                        }});
                                        task.exit();
                                        return;

                                    case 1: // YIELD
                                        {debug_log_fn}('[{driver_loop_fn}()] yield', {{
                                            fnName,
                                            componentIdx,
                                            callbackFnName,
                                            taskID: task.id()
                                        }});
                                        asyncRes = await task.yieldUntil({{
                                            cancellable: true,
                                            readyFn: () => !componentState.isExclusivelyLocked(),
                                        }});
                                        {debug_log_fn}('[{driver_loop_fn}()] finished yield', {{
                                            fnName,
                                            componentIdx,
                                            callbackFnName,
                                            taskID: task.id(),
                                            asyncRes,
                                        }});
                                        break;

                                    case 2: // WAIT for a given waitable set
                                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                                        {debug_log_fn}('[{driver_loop_fn}()] waiting for event', {{
                                            fnName,
                                            componentIdx,
                                            callbackFnName,
                                            taskID: task.id(),
                                            waitableSetRep,
                                            waitableSetTargets: cstate.handles.get(waitableSetRep).targets(),
                                        }});
                                        asyncRes = await task.waitUntil({{
                                            readyFn: () => !componentState.isExclusivelyLocked(),
                                            waitableSetRep,
                                            cancellable: true,
                                        }});
                                        {debug_log_fn}('[{driver_loop_fn}()] finished waiting for event', {{
                                            fnName,
                                            componentIdx,
                                            callbackFnName,
                                            taskID: task.id(),
                                            waitableSetRep,
                                            asyncRes,
                                        }});
                                        break;

                                    default:
                                        throw new Error(`Unrecognized async function result [${{ret}}]`);
                                }}

                                componentState.exclusiveLock();

                                // If the task failed via any means, leave early and reject.
                                if (task.isRejected()) {{
                                    {debug_log_fn}('[{driver_loop_fn}()] detected task rejection, leaving early');
                                    return;
                                }}

                                if (asyncRes.code === undefined) {{ throw new Error("missing event code from event"); }}
                                if (asyncRes.payload0 === undefined) {{ throw new Error("missing payload0 from event"); }}
                                if (asyncRes.payload1 === undefined) {{ throw new Error("missing payload1 from event"); }}

                                eventCode = asyncRes.code; // async event enum code
                                index = asyncRes.payload0; // varies (e.g. idx of related waitable set)
                                result = asyncRes.payload1; // varies (e.g. task state)
                                asyncRes = null;

                                {debug_log_fn}('[{driver_loop_fn}()] performing callback', {{
                                    fnName,
                                    componentIdx,
                                    taskID: task.id(),
                                    callbackFnName,
                                    eventCode,
                                    index,
                                    result
                                }});

                                const callbackRes = await task.runCallbackFn(
                                    {to_int32_fn}(eventCode),
                                    {to_int32_fn}(index),
                                    {to_int32_fn}(result),
                                );

                                unpacked = {unpack_callback_result_fn}(callbackRes);
                                callbackCode = unpacked[0];
                                waitableSetRep = unpacked[1];

                                {debug_log_fn}('[{driver_loop_fn}()] callback result unpacked', {{
                                    fnName,
                                    componentIdx,
                                    callbackFnName,
                                    callbackRes,
                                    callbackCode,
                                    waitableSetRep,
                                }});
                            }}
                        }} catch (err) {{
                            {debug_log_fn}('[{driver_loop_fn}()] error during async driver loop', {{
                                fnName,
                                callbackFnName,
                                componentIdx,
                                taskID: task.id(),
                                subtaskID: task.getParentSubtask()?.id(),
                                parentTaskID: task.getParentSubtask()?.getParentTask()?.id(),
                                event: {{
                                    eventCode,
                                    index,
                                    result,
                                }},
                                err,
                            }});
                        }}
                    }}
                "#,
                ));
            }

            // NOTE: the function that is output by this intrinsic also receives the
            // function that *should* be called (i.e. a trampoline to CallWasm, etc)
            //
            // LowerImport serves as the calling point of a lowered import that is *not*
            // a guest->guest async call.
            //
            // For example, consider a scenario where the host calls a guest that calls a host
            // import. The following entities are created:
            //
            // 1. A Task for the "entrypoint" exported guest fn
            // 2. A Subtask that wraps the component call to the imported host fn
            // 3. A Task for execution of the imported host fn
            //
            // Between (2) and (3), this LowerImport intrinsic should be called, serving a role
            // similar to PrepareCall/AsyncStartCall in guest->guest async lowered import calls.
            //
            Self::LowerImport => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_import_fn = Self::LowerImport.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let async_event_code_enum = Intrinsic::AsyncEventCodeEnum.name();
                let get_global_current_task_meta_fn = Intrinsic::GetGlobalCurrentTaskMetaFn.name();

                output.push_str(&format!(
                    r#"
                    async function {lower_import_fn}(args) {{
                        const params = [...arguments].slice(1);
                        {debug_log_fn}('[{lower_import_fn}()] args', {{ args, params }});
                        const {{
                            functionIdx,
                            componentIdx,
                            isAsync,
                            isManualAsync,
                            paramLiftFns,
                            resultLowerFns,
                            funcTypeIsAsync,
                            metadata,
                            memoryIdx,
                            getMemoryFn,
                            getReallocFn,
                            importFn,
                        }} = args;

                        const {{ taskID }} = {get_global_current_task_meta_fn}(componentIdx);

                        const taskMeta = {current_task_get_fn}(componentIdx, taskID);
                        if (!taskMeta) {{ throw new Error('invalid/missing async task meta'); }}

                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);

                        // TODO: re-enable this check -- postReturn can call imports though,
                        // and that breaks things.
                        //
                        // if (!cstate.mayLeave) {{
                        //     throw new Error(`cannot leave instance [${{componentIdx}}]`);
                        // }}

                        if (!task.mayBlock() && funcTypeIsAsync && !isAsync) {{
                            throw new Error("non async exports cannot synchronously call async functions");
                        }}

                        // If there is an existing task, this should be part of a subtask
                        const memory = getMemoryFn();
                        const subtask = task.createSubtask({{
                           componentIdx,
                           parentTask: task,
                           fnName: importFn.fnName,
                           isAsync,
                           isManualAsync,
                           callMetadata: {{
                               memoryIdx,
                               memory,
                               realloc: getReallocFn(),
                               resultPtr: params[0],
                               lowers: resultLowerFns,
                           }}
                        }});
                        task.setReturnMemoryIdx(memoryIdx);
                        task.setReturnMemory(getMemoryFn());

                        subtask.onStart();

                        // If dealing with a sync lowered sync function, we can directly return results
                        //
                        // TODO(breaking): remove once we get rid of manual async import specification,
                        // as func types cannot be detected in that case only (and we don't need that w/ p3)
                        if (!isManualAsync && !isAsync && !funcTypeIsAsync) {{
                            const res = importFn(...params);
                            // TODO(breaking): remove once we get rid of manual async import specification,
                            // as func types cannot be detected in that case only (and we don't need that w/ p3)
                            if (!funcTypeIsAsync && !subtask.isReturned()) {{
                                throw new Error('post-execution subtasks must either be async or returned');
                            }}
                            return subtask.getResult();
                        }}

                        // Sync-lowered async functions requires async behavior because the callee *can* block,
                        // but this call must *act* synchronously and return immediately with the result
                        // (i.e. not returning until the work is done)
                        //
                        // TODO(breaking): remove checking for manual async specification here, once we can go p3-only
                        //
                        if (!isManualAsync && !isAsync && funcTypeIsAsync) {{
                            const {{ promise, resolve }} = new Promise();
                            queueMicrotask(async () => {{
                                if (!subtask.isResolvedState()) {{
                                    await task.suspendUntil({{ readyFn: () => task.isResolvedState() }});
                                }}
                                resolve(subtask.getResult());
                            }});
                            return promise;
                        }}

                        // NOTE: at this point we know that we are working with an async lowered import

                        const subtaskState = subtask.getStateNumber();
                        if (subtaskState < 0 || subtaskState > 2**5) {{
                            throw new Error('invalid subtask state, out of valid range');
                        }}

                        subtask.setOnProgressFn(() => {{
                            subtask.setPendingEvent(() => {{
                                if (subtask.isResolved()) {{ subtask.deliverResolve(); }}
                                const event = {{
                                    code: {async_event_code_enum}.SUBTASK,
                                    payload0: subtask.waitableRep(),
                                    payload1: subtask.getStateNumber(),
                                }}
                                return event;
                            }});
                        }});

                        // This is a hack to maintain backwards compatibility with
                        // manually-specified async imports, used in wasm exports that are
                        // not actually async (but are specified as so).
                        //
                        // This is not normal p3 sync behavior but instead anticipating that
                        // the caller that is doing manual async will be waiting for a promise that
                        // resolves to the *actual* result.
                        //
                        // TODO(breaking): remove once manually specified async is removed
                        //
                        // There are a few cases:
                        // 1. sync function with async types (e.g. `f: func() -> stream<u32>`)
                        // 2. async function with async types (e.g. `f: async func() -> stream<u32>`)
                        // 3. async function with sync types (e.g. `f: async func() -> list<u32>`)
                        // 4. sync function with non-async types (e.g. `f: func() -> list<u32>`)
                        //
                        // This hack *only* applies to 4 -- the case where an async JS host function
                        // is supplied to a Wasm export which does *not* need to do any async abi
                        // lifting/lowering (async ABI did not exist when JSPI integratiton was
                        // initially merged to enable asynchronously returning values from the host)
                        //
                        const requiresManualAsyncResult = !isAsync && !funcTypeIsAsync && isManualAsync;
                        let manualAsyncResult;
                        if (requiresManualAsyncResult) {{
                            manualAsyncResult = Promise.withResolvers();
                        }}

                        try {{
                            {debug_log_fn}('[{lower_import_fn}()] calling lowered import', {{ importFn, params }});
                            const res = await importFn(...params);
                            if (requiresManualAsyncResult) {{
                                manualAsyncResult.resolve(subtask.getResult());
                            }}
                        }} catch (err) {{
                            {debug_log_fn}("[{lower_import_fn}()] import fn error:", err);
                            if (requiresManualAsyncResult) {{
                                manualAsyncResult.reject(err);
                            }}
                            throw err;
                        }}

                        if (requiresManualAsyncResult) {{ return manualAsyncResult.promise; }}

                        return Number(subtask.waitableRep()) << 4 | subtaskState;
                    }}
                    "#
                ));
            }

            // This version of lower import is sync, doing any requried work in the background,
            // explicitly for older P2 components targeted by jco transpile. We need this because
            // JSPI will not allow calling suspending imports from regular functions, which
            // means that a sync export will not be able to call a 'manually async' import.
            //
            // TODO(breaking): remove when manually specifying async imports/expors is removed.
            //
            Self::LowerImportBackwardsCompat => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_import_backwards_compat_fn = Self::LowerImportBackwardsCompat.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let async_event_code_enum = Intrinsic::AsyncEventCodeEnum.name();
                let get_global_current_task_meta_fn = Intrinsic::GetGlobalCurrentTaskMetaFn.name();

                output.push_str(&format!(
                    r#"
                    function {lower_import_backwards_compat_fn}(args) {{
                        const params = [...arguments].slice(1);
                        {debug_log_fn}('[{lower_import_backwards_compat_fn}()] args', {{ args, params }});
                        const {{
                            functionIdx,
                            componentIdx,
                            isAsync,
                            isManualAsync,
                            paramLiftFns,
                            resultLowerFns,
                            funcTypeIsAsync,
                            metadata,
                            memoryIdx,
                            getMemoryFn,
                            getReallocFn,
                            importFn,
                        }} = args;

                        const {{ taskID }} = {get_global_current_task_meta_fn}(componentIdx);

                        const taskMeta = {current_task_get_fn}(componentIdx, taskID);
                        if (!taskMeta) {{ throw new Error('invalid/missing async task meta'); }}

                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);

                        // TODO: re-enable this check -- postReturn can call imports though,
                        // and that breaks things.
                        //
                        // if (!cstate.mayLeave) {{
                        //     throw new Error(`cannot leave instance [${{componentIdx}}]`);
                        // }}

                        if (!task.mayBlock() && funcTypeIsAsync && !isAsync) {{
                            throw new Error("non async exports cannot synchronously call async functions");
                        }}

                        // If there is an existing task, this should be part of a subtask
                        const memory = getMemoryFn();
                        const subtask = task.createSubtask({{
                           componentIdx,
                           parentTask: task,
                           fnName: importFn.fnName,
                           isAsync,
                           isManualAsync,
                           callMetadata: {{
                               memoryIdx,
                               memory,
                               realloc: getReallocFn(),
                               resultPtr: params[0],
                               lowers: resultLowerFns,
                           }}
                        }});
                        task.setReturnMemoryIdx(memoryIdx);
                        task.setReturnMemory(getMemoryFn());

                        subtask.onStart();

                        // If dealing with a sync lowered sync function, we can directly return results
                        //
                        // TODO(breaking): remove once we get rid of manual async import specification,
                        // as func types cannot be detected in that case only (and we don't need that w/ p3)
                        if (!isManualAsync && !isAsync && !funcTypeIsAsync) {{
                            const res = importFn(...params);
                            // TODO(breaking): remove once we get rid of manual async import specification,
                            // as func types cannot be detected in that case only (and we don't need that w/ p3)
                            if (!funcTypeIsAsync && !subtask.isReturned()) {{
                                throw new Error('post-execution subtasks must either be async or returned');
                            }}
                            return subtask.getResult();
                        }}

                        // Sync-lowered async functions requires async behavior because the callee *can* block,
                        // but this call must *act* synchronously and return immediately with the result
                        // (i.e. not returning until the work is done)
                        //
                        // TODO(breaking): remove checking for manual async specification here, once we can go p3-only
                        //
                        if (!isManualAsync && !isAsync && funcTypeIsAsync) {{
                            const {{ promise, resolve }} = new Promise();
                            queueMicrotask(async () => {{
                                if (!subtask.isResolvedState()) {{
                                    await task.suspendUntil({{ readyFn: () => task.isResolvedState() }});
                                }}
                                resolve(subtask.getResult());
                            }});
                            return promise;
                        }}

                        // NOTE: at this point we know that we are working with an async lowered import

                        const subtaskState = subtask.getStateNumber();
                        if (subtaskState < 0 || subtaskState > 2**5) {{
                            throw new Error('invalid subtask state, out of valid range');
                        }}

                        subtask.setOnProgressFn(() => {{
                            subtask.setPendingEvent(() => {{
                                if (subtask.isResolved()) {{ subtask.deliverResolve(); }}
                                const event = {{
                                    code: {async_event_code_enum}.SUBTASK,
                                    payload0: subtask.waitableRep(),
                                    payload1: subtask.getStateNumber(),
                                }}
                                return event;
                            }});
                        }});

                        // This is a hack to maintain backwards compatibility with
                        // manually-specified async imports, used in wasm exports that are
                        // not actually async (but are specified as so).
                        //
                        // This is not normal p3 sync behavior but instead anticipating that
                        // the caller that is doing manual async will be waiting for a promise that
                        // resolves to the *actual* result.
                        //
                        // TODO(breaking): remove once manually specified async is removed
                        //
                        // There are a few cases:
                        // 1. sync function with async types (e.g. `f: func() -> stream<u32>`)
                        // 2. async function with async types (e.g. `f: async func() -> stream<u32>`)
                        // 3. async function with sync types (e.g. `f: async func() -> list<u32>`)
                        // 4. sync function with non-async types (e.g. `f: func() -> list<u32>`)
                        //
                        // This hack *only* applies to 4 -- the case where an async JS host function
                        // is supplied to a Wasm export which does *not* need to do any async abi
                        // lifting/lowering (async ABI did not exist when JSPI integratiton was
                        // initially merged to enable asynchronously returning values from the host)
                        //
                        const requiresManualAsyncResult = !isAsync && !funcTypeIsAsync && isManualAsync;
                        let manualAsyncResult;
                        if (requiresManualAsyncResult) {{
                            manualAsyncResult = Promise.withResolvers();
                        }}

                        queueMicrotask(async () => {{
                            try {{
                                {debug_log_fn}('[{lower_import_backwards_compat_fn}()] calling lowered import', {{ importFn, params }});
                                const res = await importFn(...params);
                                if (requiresManualAsyncResult) {{
                                    manualAsyncResult.resolve(subtask.getResult());
                                }}
                            }} catch (err) {{
                                {debug_log_fn}("[{lower_import_backwards_compat_fn}()] import fn error:", err);
                                if (requiresManualAsyncResult) {{
                                    manualAsyncResult.reject(err);
                                }}
                                throw err;
                            }}
                        }});

                        if (requiresManualAsyncResult) {{ return manualAsyncResult.promise; }}

                        return Number(subtask.waitableRep()) << 4 | subtaskState;
                    }}
                    "#
                ));
            }

            // This call receives the following params:
            // - caller instance
            // - callee async (0 for sync)
            // - callee instance
            //
            // Note that symmetric guest calls are may be called before lowered import calls as well.
            //
            // Symmentric guest enters are marked as as async because they must possibly wait for
            // the availability (unlock) of component instances that they run on.
            //
            Self::EnterSymmetricSyncGuestCall => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let enter_symmetric_sync_guest_call_fn = self.name();
                let get_current_task_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let create_new_current_task_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::CreateNewCurrentTask).name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let set_global_current_task_meta_fn = Intrinsic::SetGlobalCurrentTaskMetaFn.name();
                let symmetric_sync_guest_call_stack = Self::SymmetricSyncGuestCallStack.name();

                // TODO: find a way to get the callee function/export name for the executing symmetric call,
                // at present we only have the current executing task which is far outside
                // (ex. 'run()' that was executing in the caller when the callee is 'set_value()' in the callee)
                output.push_str(&format!(
                    r#"
                    function {enter_symmetric_sync_guest_call_fn}(callerComponentIdx, calleeIsAsync, calleeComponentIdx) {{
                        {debug_log_fn}('[{enter_symmetric_sync_guest_call_fn}()] args', {{
                            callerComponentIdx,
                            calleeIsAsync,
                            calleeComponentIdx
                        }});

                        const cstate = {get_or_create_async_state_fn}(calleeComponentIdx);

                        if (calleeIsAsync) {{ throw new Error('symmetric sync guest->guest call should not be async'); }}

                        const callerTaskMeta = {get_current_task_fn}(callerComponentIdx);
                        if (!callerTaskMeta) {{ throw new Error('missing current caller task metadata'); }}
                        const callerTask = callerTaskMeta.task;
                        if (!callerTask) {{ throw new Error('missing current caller task'); }}

                        const subtask = callerTask.createSubtask({{
                           componentIdx: callerComponentIdx,
                           parentTask: callerTask,
                           isAsync: !!calleeIsAsync,
                        }});

                        const [newTask, newTaskID] = {create_new_current_task_fn}({{
                            componentIdx: calleeComponentIdx,
                            isAsync: !!calleeIsAsync,
                            entryFnName: [
                                'task',
                                callerTask.id(),
                                'subtask',
                                subtask.id(),
                                'task',
                                'new-sync-guest-task',
                            ].join("/"),
                        }});

                        subtask.setChildTask(newTask);
                        newTask.setParentSubtask(subtask);

                        subtask.onStart();
                        newTask.enterSync();
                        {set_global_current_task_meta_fn}({{
                            taskID: newTask.id(),
                            componentIdx: newTask.componentIdx(),
                        }});
                        {symmetric_sync_guest_call_stack}.push({{
                            componentIdx: newTask.componentIdx(),
                        }});

                        {debug_log_fn}('[{enter_symmetric_sync_guest_call_fn}()] finished preparing', {{
                            callerComponentIdx,
                            calleeComponentIdx,
                            subtaskID: subtask.id(),
                            newTaskID: newTask.id(),
                        }});
                    }}
                    "#,
                ));
            }

            Self::ExitSymmetricSyncGuestCall => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let exit_symmetric_sync_guest_call_fn = self.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let get_current_task_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let clear_global_current_task_meta_fn =
                    Intrinsic::ClearGlobalCurrentTaskMetaFn.name();
                let symmetric_sync_guest_call_stack = Self::SymmetricSyncGuestCallStack.name();

                // NOTE: we need to end the task (and clear task machinery/set relevant state)
                // for sync->sync guest calls here because normal task machinery does not work
                // *at all* during the guest sync execution (i.e. there is no call to `CallWasm`).
                //
                output.push_str(&format!(
                    r#"
                    function {exit_symmetric_sync_guest_call_fn}() {{
                        const {{ componentIdx }} = {symmetric_sync_guest_call_stack}.pop();
                        const cstate = {get_or_create_async_state_fn}(componentIdx);

                        const taskMeta = {get_current_task_fn}(componentIdx);
                        if (!taskMeta) {{ throw new Error('missing current caller task metadata'); }}
                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('missing current caller task'); }}

                        {debug_log_fn}('[{exit_symmetric_sync_guest_call_fn}()] exiting', {{
                            componentIdx,
                            taskID: task.id(),
                            subtask: task.getParentSubtask(),
                            subtaskID: task.getParentSubtask()?.id(),
                            parent: task.getParentSubtask()?.getParentTask(),
                        }});

                        task.resolve([]);
                        task.exit();

                        {clear_global_current_task_meta_fn}({{
                            taskID: task.id(),
                            componentIdx: task.componentIdx(),
                        }});
                    }}
                    "#,
                ));
            }

            Self::SymmetricSyncGuestCallStack => {
                let var_name = self.name();
                output.push_str(&format!("let {var_name} = [];\n"));
            }
        }
    }
}
