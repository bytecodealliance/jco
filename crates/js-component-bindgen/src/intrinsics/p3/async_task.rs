//! Intrinsics that represent helpers that implement async tasks

use crate::{
    intrinsics::{
        Intrinsic, component::ComponentIntrinsic, conversion::ConversionIntrinsic,
        p3::waitable::WaitableIntrinsic,
    },
    source::Source,
};

/// This enum contains intrinsics that implement async tasks
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
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

    /// Function that creates the current task
    StartCurrentTask,

    /// Function that stops the current task
    EndCurrentTask,

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
}

impl AsyncTaskIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            "ASYNC_BLOCKED_CODE",
            "ASYNC_CURRENT_COMPONENT_IDXS",
            "ASYNC_CURRENT_TASK_IDS",
            "ASYNC_TASKS_BY_COMPONENT_IDX",
            "AsyncSubtask",
            "AsyncTask",
            "asyncYield",
            "contextGet",
            "contextSet",
            "endCurrentTask",
            "getCurrentTask",
            "startCurrentTask",
            "subtaskCancel",
            "subtaskDrop",
            "subtaskDrop",
            "taskCancel",
            "taskReturn",
            "unpackCallbackResult",
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::AsyncBlockedConstant => "ASYNC_BLOCKED_CODE",
            Self::AsyncSubtaskClass => "AsyncSubtask",
            Self::AsyncTaskClass => "AsyncTask",
            Self::ContextGet => "contextGet",
            Self::ContextSet => "contextSet",
            Self::GetCurrentTask => "getCurrentTask",
            Self::StartCurrentTask => "startCurrentTask",
            Self::EndCurrentTask => "endCurrentTask",
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
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
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
                let current_async_task_id_globals = Self::GlobalAsyncCurrentTaskIds.name();
                let current_component_idx_globals = Self::GlobalAsyncCurrentComponentIdxs.name();
                let type_check_i32 = Intrinsic::TypeCheckValidI32.name();
                output.push_str(&format!("
                    function {context_set_fn}(slot, value) {{
                        {debug_log_fn}('[{context_set_fn}()] args', {{ slot, value }});
                        if (!({type_check_i32}(value))) {{ throw new Error('invalid value for context set (not valid i32)'); }}
                        const taskMeta = {current_task_get_fn}({current_component_idx_globals}.at(-1), {current_async_task_id_globals}.at(-1));
                        if (!taskMeta) {{ throw new Error('failed to retrieve current task'); }}
                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing current task in metadata while setting context'); }}
                        if (slot < 0 || slot >= task.storage.length) {{ throw new Error('invalid slot for current task'); }}
                        task.storage[slot] = value;
                    }}
                "));
            }

            Self::ContextGet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let context_get_fn = Self::ContextGet.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                let current_async_task_id_globals = Self::GlobalAsyncCurrentTaskIds.name();
                let current_component_idx_globals = Self::GlobalAsyncCurrentComponentIdxs.name();
                output.push_str(&format!("
                    function {context_get_fn}(slot) {{
                        {debug_log_fn}('[{context_get_fn}()] args', {{
                            _globals: {{ {current_component_idx_globals}, {current_async_task_id_globals} }},
                            slot,
                        }});
                        const taskMeta = {current_task_get_fn}({current_component_idx_globals}.at(-1), {current_async_task_id_globals}.at(-1));
                        if (!taskMeta) {{ throw new Error('failed to retrieve current task metadata'); }}
                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing current task in metadata while getting context'); }}
                        if (slot < 0 || slot >= task.storage.length) {{ throw new Error('invalid slot for current task'); }}
                        return task.storage[slot];
                    }}
                "));
            }

            // Equivalent of `task.return`
            Self::TaskReturn => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let task_return_fn = Self::TaskReturn.name();
                let current_task_get_fn = Self::GetCurrentTask.name();

                output.push_str(&format!(r#"
                    function {task_return_fn}(ctx) {{
                        const {{ componentIdx, useDirectParams, getMemoryFn, memoryIdx, callbackFnIdx, liftFns }} = ctx;
                        const params = [...arguments].slice(1);
                        const memory = getMemoryFn();
                        {debug_log_fn}('[{task_return_fn}()] args', {{
                            componentIdx,
                            callbackFnIdx,
                            memoryIdx,
                            liftFns,
                            params,
                        }});

                        const taskMeta = {current_task_get_fn}(componentIdx);
                        if (!taskMeta) {{ throw new Error('failed to retrieve current task metadata'); }}

                        const task = taskMeta.task;
                        if (!taskMeta) {{ throw new Error('invalid/missing current task in metadata'); }}

                        const expectedMemoryIdx = task.getMemoryIdx();
                        if (expectedMemoryIdx !== null && expectedMemoryIdx !== memoryIdx) {{
                            throw new Error('task.return memory [' + memoryIdx + '] does not match task [' + expectedMemoryIdx + ']');
                        }}

                        task.callbackFnIdx = callbackFnIdx;

                        if (!memory && liftFns.length > 4) {{
                            throw new Error('memory must be present if more than max async flat lifts are performed');
                        }}

                        let liftCtx = {{ memory, useDirectParams, params }};
                        if (!useDirectParams) {{
                            liftCtx.storagePtr = params[0];
                            liftCtx.storageLen = params[1];
                        }}

                        const results = [];
                        {debug_log_fn}('[{task_return_fn}()] lifting results out of memory', {{ liftCtx }});
                        for (const liftFn of liftFns) {{
                            if (liftCtx.storageLen !== undefined && liftCtx.storageLen <= 0) {{
                                throw new Error('ran out of storage while writing');
                            }}
                            const [ val, newLiftCtx ] = liftFn(liftCtx);
                            liftCtx = newLiftCtx;
                            results.push(val);
                        }}

                        task.resolve(results);
                    }}
                "#));
            }

            Self::SubtaskDrop => {
                // TODO: ensure task is marked "may_leave", drop task for relevant component
                // see: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-subtaskdrop
                let debug_log_fn = Intrinsic::DebugLog.name();
                let subtask_drop_fn = Self::SubtaskDrop.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!("
                    function {subtask_drop_fn}(componentInstanceID, subtaskID) {{
                        {debug_log_fn}('[{subtask_drop_fn}()] args', {{ componentInstanceID, taskId }});
                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave, cannot be cancelled'); }}

                        const subtask =  state.subtasks.remove(subtaskID);
                        if (!subtask) {{ throw new Error('missing/invalid subtask specified for drop in component instance'); }}

                        subtask.drop();
                    }}
                "));
            }

            Self::Yield => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let yield_fn = Self::Yield.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                output.push_str(&format!(
                    "
                    function {yield_fn}(isAsync) {{
                        {debug_log_fn}('[{yield_fn}()] args', {{ isAsync }});
                        const task = {current_task_get_fn}();
                        if (!task) {{ throw new Error('invalid/missing async task'); }}
                        await task.yield({{ isAsync }});
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
                output.push_str(&format!("
                    function {task_cancel_fn}(componentInstanceID, isAsync) {{
                        {debug_log_fn}('[{task_cancel_fn}()] args', {{ componentInstanceID, isAsync }});

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave, cannot be cancelled'); }}

                        const task = {current_task_get_fn}(componentInstanceID);
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

            Self::TaskCancel => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let task_cancel_fn = Self::TaskCancel.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!("
                    function {task_cancel_fn}(componentInstanceID) {{
                        {debug_log_fn}('[{task_cancel_fn}()] args', {{ componentInstanceID, isAsync }});

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave, cannot be cancelled'); }}

                        const task = {current_task_get_fn}(componentInstanceID);
                        if (task.sync && !task.alwaysTaskReturn) {{
                            throw new Error('cannot cancel sync tasks without always task return set');
                        }}
                        task.cancel();
                    }}
                "));
            }

            Self::StartCurrentTask => {
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
                            entryFnName,
                            parentSubtaskID,
                            callbackFnName,
                            getCallbackFn,
                            getParamsFn,
                            stringEncoding,
                            errHandling,
                            getCalleeParamsFn,
                        }} = args;
                        if (componentIdx === undefined || componentIdx === null) {{
                            throw new Error('missing/invalid component instance index while starting task');
                        }}
                        const tasks = {global_task_map}.get(componentIdx);
                        const callbackFn = getCallbackFn ? getCallbackFn() : null;

                        const newTask = new {task_class}({{
                            componentIdx,
                            isAsync,
                            entryFnName,
                            callbackFn,
                            callbackFnName,
                            stringEncoding,
                            getCalleeParamsFn,
                            errHandling,
                        }});
                        newTask.enter();

                        const newTaskID = newTask.id();
                        const newTaskMeta = {{ id: newTaskID, componentIdx, task: newTask }};

                        {task_id_globals}.push(newTaskID);
                        {component_idx_globals}.push(componentIdx);

                        if (!tasks) {{
                            {global_task_map}.set(componentIdx, [newTaskMeta]);
                            return [newTask, newTaskID];
                        }} else {{
                            tasks.push(newTaskMeta);
                        }}

                        return [newTask, newTaskID];
                    }}
                "#,
                    fn_name = self.name(),
                ));
            }

            Self::GetCurrentTask => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let global_task_map = Self::GlobalAsyncCurrentTaskMap.name();
                output.push_str(&format!(
                    "
                    function {fn_name}(componentIdx) {{
                        {debug_log_fn}('[{fn_name}()] args', {{ componentIdx }});
                        if (componentIdx === undefined || componentIdx === null) {{
                            throw new Error('missing/invalid component instance index [' + componentIdx + '] while getting current task');
                        }}
                        const tasks = {global_task_map}.get(componentIdx);
                        if (tasks === undefined) {{
                            throw new Error('missing task lookup for component ID [' + componentIdx + '] while getting current task');
                        }}
                        if (tasks.length === 0) {{
                            throw new Error('missing/invalid tasks for component while getting current task');
                        }}
                        return tasks[tasks.length - 1];
                    }}
                ",
                    fn_name = self.name(),
                ));
            }

            Self::EndCurrentTask => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let global_task_map = Self::GlobalAsyncCurrentTaskMap.name();
                let task_id_globals = Self::GlobalAsyncCurrentTaskIds.name();
                let component_idx_globals = Self::GlobalAsyncCurrentComponentIdxs.name();
                output.push_str(&format!(
                    "
                    function {fn_name}(componentIdx, taskId) {{
                        {debug_log_fn}('[{fn_name}()] args', {{ componentIdx }});
                        componentIdx ??= {component_idx_globals}.at(-1);
                        taskId ??= {task_id_globals}.at(-1);
                        if (componentIdx === undefined || componentIdx === null) {{
                            throw new Error('missing/invalid component instance index while ending current task');
                        }}
                        const tasks = {global_task_map}.get(componentIdx);
                        if (!tasks || !Array.isArray(tasks)) {{
                            throw new Error('missing/invalid tasks for component instance while ending task');
                        }}
                        if (tasks.length == 0) {{
                            throw new Error('no current task(s) for component instance while ending task');
                        }}

                        if (taskId) {{
                            const last = tasks[tasks.length - 1];
                            if (last.id !== taskId) {{
                                // throw new Error('current task does not match expected task ID');
                                 return;
                            }}
                        }}

                        {task_id_globals}.pop();
                        {component_idx_globals}.pop();

                        const taskMeta = tasks.pop();
                        return taskMeta.task;
                    }}
                ",
                    fn_name = self.name()
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

                let awaitable_class = Intrinsic::AwaitableClass.name();
                let global_async_determinism = Intrinsic::GlobalAsyncDeterminism.name();
                let coin_flip_fn = Intrinsic::CoinFlip.name();

                // TODO: remove the public mutable members that are eagerly exposed for early impl
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
                        #entryFnName = null;
                        #subtasks = [];

                        #onResolve = null;
                        #completionPromise = null;

                        #memoryIdx = null;

                        #callbackFn = null;
                        #callbackFnName = null;

                        #postReturnFn = null;

                        #getCalleeParamsFn = null;

                        #stringEncoding = null;

                        #parentSubtask = null;

                        #needsExclusiveLock = false;

                        #errHandling;

                        cancelled = false;
                        requested = false;
                        alwaysTaskReturn = false;

                        returnCalls =  0;
                        storage = [0, 0];
                        borrowedHandles = {{}};

                        awaitableResume = null;
                        awaitableCancel = null;

                        constructor(opts) {{
                           this.#id = ++{task_class}._ID;

                           if (opts?.componentIdx === undefined) {{
                               throw new TypeError('missing component id during task creation');
                           }}
                           this.#componentIdx = opts.componentIdx;

                           this.#state = {task_class}.State.INITIAL;
                           this.#isAsync = opts?.isAsync ?? false;
                           this.#entryFnName = opts.entryFnName;

                           const {{
                               promise: completionPromise,
                               resolve: resolveCompletionPromise,
                               reject: rejectCompletionPromise,
                           }} = promiseWithResolvers();
                           this.#completionPromise = completionPromise;

                           this.#onResolve = (results) => {{
                               // TODO: handle external facing cancellation (should likely be a rejection)
                               resolveCompletionPromise(results);
                           }}

                           if (opts.callbackFn) {{ this.#callbackFn = opts.callbackFn; }}
                           if (opts.callbackFnName) {{ this.#callbackFnName = opts.callbackFnName; }}

                           if (opts.getCalleeParamsFn) {{ this.#getCalleeParamsFn = opts.getCalleeParamsFn; }}

                           if (opts.stringEncoding) {{ this.#stringEncoding = opts.stringEncoding; }}

                           if (opts.parentSubtask) {{ this.#parentSubtask = opts.parentSubtask; }}

                           this.#needsExclusiveLock = this.isSync() || !this.hasCallback();

                           if (opts.errHandling) {{ this.#errHandling = opts.errHandling; }}
                        }}

                        taskState() {{ return this.#state.slice(); }}
                        id() {{ return this.#id; }}
                        componentIdx() {{ return this.#componentIdx; }}
                        isAsync() {{ return this.#isAsync; }}
                        entryFnName() {{ return this.#entryFnName; }}
                        completionPromise() {{ return this.#completionPromise; }}

                        isAsync() {{ return this.#isAsync; }}
                        isSync() {{ return !this.isAsync(); }}

                        getErrHandling() {{ return this.#errHandling; }}

                        hasCallback() {{ return this.#callbackFn !== null; }}

                        setMemoryIdx(idx) {{ this.#memoryIdx = idx; }}
                        getMemoryIdx(idx) {{ return this.#memoryIdx; }}

                        setParentSubtask(subtask) {{
                            if (!subtask || !(subtask instanceof {subtask_class})) {{ return }}
                            if (this.#parentSubtask) {{ throw new Error('parent subtask can only be set once'); }}
                            this.#parentSubtask = subtask;
                        }}

                        getParentSubtask() {{ return this.#parentSubtask; }}

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

                        runCallbackFn(...args) {{
                            if (!this.#callbackFn) {{ throw new Error('on callback function has been set for task'); }}
                            return this.#callbackFn.apply(null, args);
                        }}

                        getCalleeParams() {{
                            if (!this.#getCalleeParamsFn) {{ throw new Error('missing/invalid getCalleeParamsFn'); }}
                            return this.#getCalleeParamsFn();
                        }}

                        mayEnter(task) {{
                            const cstate = {get_or_create_async_state_fn}(this.#componentIdx);
                            if (!cstate.backpressure) {{
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

                        async enter() {{
                            {debug_log_fn}('[{task_class}#enter()] args', {{ taskID: this.#id }});

                            const cstate = {get_or_create_async_state_fn}(this.#componentIdx);

                            // TODO: implement backpressure

                            if (this.needsExclusiveLock()) {{ cstate.exclusiveLock(); }}

                            return true;
                        }}

                        async waitUntil(opts) {{
                            const {{ readyFn, waitableSetRep, cancellable }} = opts;
                            {debug_log_fn}('[{task_class}#waitUntil()] args', {{ taskID: this.#id, waitableSetRep, cancellable }});

                            const state = {get_or_create_async_state_fn}(this.#componentIdx);
                            const wset = state.waitableSets.get(waitableSetRep);

                            let event;

                            wset.incrementNumWaiting();

                            const keepGoing = await this.suspendUntil({{
                                readyFn: () => {{
                                    return readyFn() && wset.hasPendingEvent();
                                }},
                                cancellable,
                            }});

                            if (keepGoing) {{
                                event = wset.getPendingEvent();
                            }} else {{
                                event = {{
                                    code: {event_code_enum}.TASK_CANCELLED,
                                    index: 0,
                                    result: 0,
                                }};
                            }}

                            wset.decrementNumWaiting();

                            return event;
                        }}

                        async pollForEvent(opts) {{
                            const {{ waitableSetRep, isAsync }} = opts;
                            {debug_log_fn}('[{task_class}#pollForEvent()] args', {{ taskID: this.#id, waitableSetRep, isAsync }});

                            if (this.#isAsync !== isAsync) {{
                                throw new Error('async pollForEvent called on non-async task');
                            }}

                            throw new Error('{task_class}#pollForEvent() not implemented');
                        }}

                        async onBlock(awaitable) {{
                            {debug_log_fn}('[{task_class}#onBlock()] args', {{ taskID: this.#id, awaitable }});
                            if (!(awaitable instanceof {awaitable_class})) {{
                                throw new Error('invalid awaitable during onBlock');
                            }}

                            // Build a promise that this task can await on which resolves when it is awoken
                            const {{ promise, resolve, reject }} = promiseWithResolvers();
                            this.awaitableResume = () => {{
                                {debug_log_fn}('[{task_class}] resuming after onBlock', {{ taskID: this.#id }});
                                resolve();
                            }};
                            this.awaitableCancel = (err) => {{
                                {debug_log_fn}('[{task_class}] rejecting after onBlock', {{ taskID: this.#id, err }});
                                reject(err);
                            }};

                            // Park this task/execution to be handled later
                            const state = {get_or_create_async_state_fn}(this.#componentIdx);
                            state.parkTaskOnAwaitable({{ awaitable, task: this }});

                            try {{
                                await promise;
                                return {task_class}.BlockResult.NOT_CANCELLED;
                            }} catch (err) {{
                                // rejection means task cancellation
                                return {task_class}.BlockResult.CANCELLED;
                            }}
                        }}

                        async asyncOnBlock(awaitable) {{
                            {debug_log_fn}('[{task_class}#asyncOnBlock()] args', {{ taskID: this.#id, awaitable }});
                            if (!(awaitable instanceof {awaitable_class})) {{
                                throw new Error('invalid awaitable during onBlock');
                            }}
                            // TODO: watch for waitable AND cancellation
                            // TODO: if it WAS cancelled:
                            // - return true
                            // - only once per subtask
                            // - do not wait on the scheduler
                            // - control flow should go to the subtask (only once)
                            // - Once subtask blocks/resolves, reqlinquishControl() will tehn resolve request_cancel_end (without scheduler lock release)
                            // - control flow goes back to request_cancel
                            //
                            // Subtask cancellation should work similarly to an async import call -- runs sync up until
                            // the subtask blocks or resolves
                            //
                            throw new Error('AsyncTask#asyncOnBlock() not yet implemented');
                        }}

                        async yieldUntil(opts) {{
                            const {{ readyFn, cancellable }} = opts;
                            {debug_log_fn}('[{task_class}#yield()] args', {{ taskID: this.#id, cancellable }});

                            const keepGoing = await this.suspendUntil({{ readyFn, cancellable }});
                            if (!keepGoing) {{
                                return {{
                                    code: {event_code_enum}.TASK_CANCELLED,
                                    index: 0,
                                    result: 0,
                                }};
                            }}

                            return {{
                                code: {event_code_enum}.NONE,
                                index: 0,
                                result: 0,
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
                            if (ready && !{global_async_determinism} && {coin_flip_fn}()) {{
                                return true;
                            }}

                            const cstate = {get_or_create_async_state_fn}(this.#componentIdx);
                            cstate.addPendingTask(this);

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

                            const taskWait = await cstate.suspendTask({{ task: this, readyFn }});
                            const keepGoing = await taskWait;
                            return keepGoing;
                        }}

                        deliverPendingCancel(opts) {{
                            const {{ cancellable }} = opts;
                            {debug_log_fn}('[{task_class}#deliverPendingCancel()] args', {{ cancellable }});

                            if (cancellable && this.#state === {task_class}.State.PENDING_CANCEL) {{
                                this.#state = Task.State.CANCEL_DELIVERED;
                                return true;
                            }}

                            return false;
                        }}

                        isCancelled() {{ return this.cancelled }}

                        cancel() {{
                            {debug_log_fn}('[{task_class}#cancel()] args', {{ }});
                            if (!this.taskState() !== {task_class}.State.CANCEL_DELIVERED) {{
                                throw new Error('invalid task state for cancellation');
                            }}
                            if (this.borrowedHandles.length > 0) {{ throw new Error('task still has borrow handles'); }}
                            this.cancelled = true;
                            this.#onResolve(new Error('cancelled'));
                            this.#state = {task_class}.State.RESOLVED;
                        }}

                        resolve(results) {{
                            {debug_log_fn}('[{task_class}#resolve()] args', {{ results }});
                            if (this.#state === {task_class}.State.RESOLVED) {{
                                throw new Error('task is already resolved');
                            }}
                            if (this.borrowedHandles.length > 0) {{ throw new Error('task still has borrow handles'); }}
                            switch (results.length) {{
                                case 0:
                                    this.#onResolve(undefined);
                                    break;
                                case 1:
                                    this.#onResolve(results[0]);
                                    break;
                                default:
                                    throw new Error('unexpected number of results');
                            }}
                            this.#state = {task_class}.State.RESOLVED;
                        }}

                        exit() {{
                            {debug_log_fn}('[{task_class}#exit()] args', {{ }});

                            // TODO: ensure there is only one task at a time (scheduler.lock() functionality)
                            if (this.#state !== {task_class}.State.RESOLVED) {{
                                throw new Error('task exited without resolution');
                            }}
                            if (this.borrowedHandles > 0) {{
                                throw new Error('task exited without clearing borrowed handles');
                            }}

                            const state = {get_or_create_async_state_fn}(this.#componentIdx);
                            if (!state) {{ throw new Error('missing async state for component [' + this.#componentIdx + ']'); }}
                            if (!this.#isAsync && !state.inSyncExportCall) {{
                                throw new Error('sync task must be run from components known to be in a sync export call');
                            }}
                            state.inSyncExportCall = false;

                            //if (this.needsExclusiveLock() && !state.isExclusivelyLocked()) {{
                            //    throw new Error('task [' + this.#id + '] exit: component [' + this.#componentIdx + '] should have been exclusively locked');
                            //}}

                            state.exclusiveRelease();
                        }}

                        needsExclusiveLock() {{ return this.#needsExclusiveLock; }}

                        createSubtask(args) {{
                            {debug_log_fn}('[{task_class}#createSubtask()] args', args);
                            const {{ componentIdx, memoryIdx, childTask }} = args;
                            const newSubtask = new {subtask_class}({{
                                componentIdx,
                                childTask,
                                parentTask: this,
                                memoryIdx,
                            }});
                            this.#subtasks.push(newSubtask);
                            return newSubtask;
                        }}

                        currentSubtask() {{
                            {debug_log_fn}('[{task_class}#currentSubtask()]');
                            if (this.#subtasks.length === 0) {{ return undefined; }}
                            return this.#subtasks.at(-1);
                        }}

                        endCurrentSubtask() {{
                            {debug_log_fn}('[{task_class}#endCurrentSubtask()]');
                            if (this.#subtasks.length === 0) {{ throw new Error('cannot end current subtask: no current subtask'); }}
                            const subtask = this.#subtasks.pop();
                            subtask.drop();
                            return subtask;
                        }}
                    }}
                "#));
            }

            Self::AsyncSubtaskClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let subtask_class = Self::AsyncSubtaskClass.name();
                let waitable_class = Intrinsic::Waitable(WaitableIntrinsic::WaitableClass).name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
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
                        #waitableRep = null;
                        #waitableResolve = null;
                        #waitableReject = null;

                        #callbackFn = null;
                        #callbackFnName = null;

                        #postReturnFn = null;
                        #onProgressFn = null;
                        #pendingEventFn = null;

                        #componentRep = null;

                        constructor(args) {{
                            if (!args.componentIdx) {{ throw new Error('missing componentIdx for subtask creation'); }}
                            this.#componentIdx = args.componentIdx;

                            if (!args.parentTask) {{ throw new Error('missing parent task during subtask creation'); }}
                            this.#parentTask = args.parentTask;

                            if (args.childTask) {{ this.#childTask = args.childTask; }}

                            if (args.memoryIdx) {{ this.#memoryIdx = args.memoryIdx; }}

                            if (args.waitable) {{
                                this.#waitable = args.waitable;
                            }} else {{
                                const {{ promise, resolve, reject }} = promiseWithResolvers();
                                this.#waitableResolve = resolve;
                                this.#waitableReject = reject;

                                const state = {get_or_create_async_state_fn}(this.#componentIdx);
                                if (!state) {{
                                    throw new Error('invalid/missing async state for component instance [' + componentInstanceID + ']');
                                }}

                                this.#waitable = new {waitable_class}({{ promise,  componentInstanceID: this.#componentIdx }});
                                this.#waitableRep = state.waitables.insert(this.#waitable);
                            }}

                            this.#lenders = [];
                            this.#id = ++{subtask_class}._ID;
                        }}

                        id() {{ return this.#id; }}
                        parentTaskID() {{ return this.#parentTask?.id(); }}
                        childTaskID() {{ return this.#childTask?.id(); }}

                        componentIdx() {{ return this.#componentIdx; }}

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

                        onStart(f) {{
                            if (!this.#onProgressFn) {{ throw new Error('missing on progress function'); }}
                            this.#onProgressFn();
                            this.#state = {subtask_class}.State.STARTED;
                        }}

                        setPendingEventFn(fn) {{
                            this.#waitable.setPendingEventFn(fn);
                        }}

                        onResolve(value) {{
                            if (!this.#onProgressFn) {{ throw new Error('missing on progress function'); }}
                            this.#onProgressFn();

                            if (value === null) {{
                                if (this.#cancelRequested) {{
                                    throw new Error('cancel was not requested, but no value present at return');
                                }}

                                if (this.#state === {subtask_class}.State.STARTING) {{
                                    this.#state = Subtask.State.CANCELLED_BEFORE_STARTED;
                                }} else {{
                                    if (this.#state !== {subtask_class}.State.STARTED) {{
                                        throw new Error('cancelled subtask must have been started before cancellation');
                                    }}
                                    this.#state = {subtask_class}.State.CANCELLED_BEFORE_RETURNED;
                                }}
                            }} else {{
                                if (this.#state !== {subtask_class}.State.STARTED) {{
                                    throw new Error('cancelled subtask must have been started before cancellation');
                                }}
                                this.#state = {subtask_class}.State.RETURNED;
                            }}
                        }}

                        setRep(rep) {{ this.#componentRep = rep; }}

                        getStateNumber() {{ return this.#state; }}
                        getWaitableRep() {{ return this.#waitableRep; }}

                        waitableRep() {{ return this.#waitableRep; }}

                        resolved() {{
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

                            if (this.#lenders.length === 0 || this.#waitable.resolved()) {{
                                throw new Error('subtask has no lendors or has already been resolved');
                            }}

                            handle.lends++;
                            this.#lenders.push(handle);
                        }}

                        deliverResolve() {{
                            {debug_log_fn}('[{subtask_class}#deliverResolve()] args', {{ }});
                            if (this.resolveDelivered() || this.resolved()) {{
                                throw new Error('subtask has already been resolved');
                            }}

                            for (const lender of this.#lenders) {{
                                lender.lends--;
                            }}

                            self.lenders = null;
                        }}

                        resolveDelivered() {{
                            {debug_log_fn}('[{subtask_class}#resolveDelivered()] args', {{ }});
                            if (this.#lenders === null && !this.resolved()) {{
                                throw new Error('invalid subtask state, lenders missing and subtask has not been resolved');
                            }}
                            return this.#lenders.length === 0;
                        }}

                        drop() {{
                            {debug_log_fn}('[{subtask_class}#drop()] args', {{ }});
                            if (!this.resolveDelivered()) {{
                                throw new Error('cannot drop subtask before resolve is delivered');
                            }}
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            this.#waitable.drop();
                            this.#dropped = true;
                        }}

                        getWaitableHandleIdx() {{
                            {debug_log_fn}('[{subtask_class}#getWaitableHandleIdx()] args', {{ }});
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            return this.#waitableRep;
                        }}
                    }}
                "#));
            }

            Self::UnpackCallbackResult => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let unpack_callback_result_fn = Self::UnpackCallbackResult.name();
                let i32_typecheck_fn = Intrinsic::TypeCheckValidI32.name();
                output.push_str(&format!("
                    function {unpack_callback_result_fn}(result) {{
                        {debug_log_fn}('[{unpack_callback_result_fn}()] args', {{ result }});
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

            // TODO: This function likely needs to be a generator
            // that first yields the task promise result, then tries to push resolution
            Self::DriverLoop => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let driver_loop_fn = Self::DriverLoop.name();
                let i32_typecheck = Intrinsic::TypeCheckValidI32.name();
                let to_int32_fn = Intrinsic::Conversion(ConversionIntrinsic::ToInt32).name();
                let unpack_callback_result_fn = Self::UnpackCallbackResult.name();
                let error_all_component_states_fn =
                    Intrinsic::Component(ComponentIntrinsic::ComponentStateSetAllError).name();

                output.push_str(&format!(r#"
                    async function {driver_loop_fn}(args) {{
                        {debug_log_fn}('[{driver_loop_fn}()] args', args);
                        const {{
                            componentState,
                            task,
                            fnName,
                            isAsync,
                            resolve,
                            reject,
                        }} = args;
                        let callbackResult = args.callbackResult;

                        const callbackFnName = task.getCallbackFnName();

                        try {{
                            callbackResult = await callbackResult;
                        }} catch (err) {{
                            err.componentIdx = task.componentIdx();

                            componentState.setErrored(err);
                            {error_all_component_states_fn}();

                            reject(err);
                            task.resolve([]);
                            return;
                        }}

                        // TODO(fix): callbackResult should not ever be undefined, *unless*
                        // we are calling it on a function that was not async to begin with?...
                        //
                        // In practice, the callback of `[async]run` returns undefined.
                        //
                        if (callbackResult === undefined) {{
                           {debug_log_fn}('[{driver_loop_fn}()] early exit due to undefined callback result', {{
                               taskID: task.id(),
                               subtaskID: task.currentSubtask()?.id(),
                               parentTaskID: task.currentSubtask()?.parentTaskID(),
                               fnName,
                               callbackResult
                           }});
                           resolve(null);
                           task.resolve([]);
                           return;
                        }}

                        let callbackCode;
                        let waitableSetRep;
                        let unpacked;
                        if (!({i32_typecheck}(callbackResult))) {{
                            throw new Error('invalid callback result [' + callbackResult + '], not a number');
                        }}
                        if (callbackResult < 0 || callbackResult > 3) {{
                            throw new Error('invalid async return value, outside callback code range');
                        }}
                        unpacked = {unpack_callback_result_fn}(callbackResult);
                        callbackCode = unpacked[0];
                        waitableSetRep = unpacked[1];

                        let eventCode;
                        let index;
                        let result;
                        let asyncRes;
                        try {{
                            while (true) {{
                                if (callbackCode !== 0) {{
                                    componentState.exclusiveRelease();
                                }}

                                switch (callbackCode) {{
                                    case 0: // EXIT
                                        {debug_log_fn}('[{driver_loop_fn}()] async exit indicated', {{
                                            fnName,
                                            callbackFnName,
                                            taskID: task.id()
                                        }});
                                        task.exit();
                                        resolve(null);
                                        return;

                                    case 1: // YIELD
                                        {debug_log_fn}('[{driver_loop_fn}()] yield', {{
                                            fnName,
                                            callbackFnName,
                                            taskID: task.id()
                                        }});
                                        asyncRes = await task.yieldUntil({{
                                            cancellable: true,
                                            readyFn: () => !componentState.isExclusivelyLocked()
                                        }});
                                        break;

                                    case 2: // WAIT for a given waitable set
                                        {debug_log_fn}('[{driver_loop_fn}()] waiting for event', {{
                                            fnName,
                                            callbackFnName,
                                            taskID: task.id(),
                                            waitableSetRep,
                                        }});
                                        if (eventCode === 1 && waitableSetRep === task.currentSubtask().getWaitableRep()) {{
                                            task.currentSubtask().doTheThing();
                                        }}
                                        asyncRes = await task.waitUntil({{
                                            readyFn: () => true,
                                            waitableSetRep,
                                            cancellable: true,
                                        }});
                                        break;

                                    case 3: // POLL
                                        {debug_log_fn}('[{driver_loop_fn}()] polling for event', {{
                                            fnName,
                                            callbackFnName,
                                            taskID: task.id(),
                                            waitableSetRep,
                                        }});
                                        asyncRes = await task.pollForEvent({{ isAsync: true, waitableSetRep }});
                                        break;

                                    default:
                                        throw new Error('Unrecognized async function result [' + ret + ']');
                                }}

                                componentState.exclusiveLock();

                                eventCode = asyncRes.code;
                                index = asyncRes.index;
                                result = asyncRes.result;
                                asyncRes = null;

                                {debug_log_fn}('[{driver_loop_fn}()] performing callback', {{
                                    fnName,
                                    callbackFnName,
                                    eventCode,
                                    index,
                                    result
                                }});

                                const callbackRes = task.runCallbackFn(
                                    {to_int32_fn}(eventCode),
                                    {to_int32_fn}(index),
                                    {to_int32_fn}(result),
                                );
                                unpacked = {unpack_callback_result_fn}(callbackRes);
                                callbackCode = unpacked[0];
                                waitableSetRep = unpacked[1];
                            }}
                        }} catch (err) {{
                            {debug_log_fn}('[{driver_loop_fn}()] error while resolving in async driver loop', {{
                                fnName,
                                callbackFnName,
                                eventCode,
                                index,
                                result,
                                err,
                            }});
                            reject(err);
                        }}
                    }}
                "#,
                ));
            }
        }
    }
}
