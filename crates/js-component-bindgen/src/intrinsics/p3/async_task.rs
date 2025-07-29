//! Intrinsics that represent helpers that implement async tasks

use crate::{
    intrinsics::{component::ComponentIntrinsic, Intrinsic},
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
    /// type GlobalAsyncCurrentTaskId = number | null;
    /// ```
    GlobalAsyncCurrentTaskId,

    /// Global that stores the current component ID (for the current task)
    ///
    /// This global variable is populated when a task is started, and cleared
    /// (reset to `null` in JS) when a task ends.
    ///
    /// ```ts
    /// type GlobalAsyncCurrentTaskId = number | null;
    /// ```
    GlobalAsyncCurrentComponentIdx,

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
}

impl AsyncTaskIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        ["taskReturn", "subtaskDrop"]
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
            Self::GlobalAsyncCurrentTaskId => "ASYNC_CURRENT_TASK_ID",
            Self::GlobalAsyncCurrentComponentIdx => "ASYNC_CURRENT_COMPONENT_IDX",
            Self::SubtaskCancel => "subtaskCancel",
            Self::SubtaskDrop => "subtaskDrop",
            Self::TaskCancel => "taskCancel",
            Self::TaskReturn => "taskReturn",
            Self::Yield => "asyncYield",
            Self::UnpackCallbackResult => "unpackCallbackResult",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::GlobalAsyncCurrentTaskMap => {
                let var_name = Self::GlobalAsyncCurrentTaskMap.name();
                output.push_str(&format!("const {var_name} = new Map();\n"));
            }

            Self::GlobalAsyncCurrentTaskId => {
                output.push_str(&format!("let {var_name} = null;\n", var_name = self.name(),));
            }

            Self::GlobalAsyncCurrentComponentIdx => {
                output.push_str(&format!("let {var_name} = null;\n", var_name = self.name(),));
            }

            Self::AsyncBlockedConstant => {
                let name = Self::AsyncBlockedConstant.name();
                output.push_str(&format!("const {name} = 0xFFFF_FFFF;"));
            }

            Self::ContextSet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let context_set_fn = Self::ContextSet.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                let current_async_task_id_global = Self::GlobalAsyncCurrentTaskId.name();
                let current_component_idx_global = Self::GlobalAsyncCurrentComponentIdx.name();
                let type_check_i32 = Intrinsic::TypeCheckValidI32.name();
                output.push_str(&format!("
                    function {context_set_fn}(slot, value) {{
                        {debug_log_fn}('[{context_set_fn}()] args', {{ slot, value }});
                        if (!({type_check_i32}(value))) {{ throw new Error('invalid value for context set (not valid i32)'); }}
                        const taskMeta = {current_task_get_fn}({current_component_idx_global}, {current_async_task_id_global});
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
                let current_async_task_id_global = Self::GlobalAsyncCurrentTaskId.name();
                let current_component_idx_global = Self::GlobalAsyncCurrentComponentIdx.name();
                output.push_str(&format!("
                    function {context_get_fn}(slot) {{
                        {debug_log_fn}('[{context_get_fn}()] args', {{
                            _globals: {{ {current_component_idx_global}, {current_async_task_id_global} }},
                            slot,
                        }});
                        const taskMeta = {current_task_get_fn}({current_component_idx_global}, {current_async_task_id_global});
                        if (!taskMeta) {{ throw new Error('failed to retrieve current task metadata'); }}
                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('invalid/missing current task in metadata while getting context'); }}
                        if (slot < 0 || slot >= task.storage.length) {{ throw new Error('invalid slot for current task'); }}
                        return task.storage[slot];
                    }}
                "));
            }

            Self::TaskReturn => {
                // TODO(async): write results into provided memory, perform checks for task & result types
                // see: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-taskreturn
                let debug_log_fn = Intrinsic::DebugLog.name();
                let task_return_fn = Self::TaskReturn.name();
                let current_task_get_fn = Self::GetCurrentTask.name();

                output.push_str(&format!("
                    function {task_return_fn}(componentIdx, memory, callbackFnIdx, liftFns, vals, storagePtr, storageLen) {{
                        {debug_log_fn}('[{task_return_fn}()] args', {{
                            componentIdx,
                            memory,
                            callbackFnIdx,
                            liftFns,
                            vals,
                            storagePtr,
                            storageLen,
                        }});
                        const taskMeta = {current_task_get_fn}(componentIdx);
                        if (!taskMeta) {{ throw new Error('failed to retrieve current task metadata'); }}
                        const task = taskMeta.task;
                        if (!taskMeta) {{ throw new Error('invalid/missing current task in metadata'); }}

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
                let task_id_global = Self::GlobalAsyncCurrentTaskId.name();
                let component_idx_global = Self::GlobalAsyncCurrentComponentIdx.name();
                output.push_str(&format!(
                    "
                    let NEXT_TASK_ID = 0n;
                    function {fn_name}(componentIdx, isAsync) {{
                        {debug_log_fn}('[{fn_name}()] args', {{ componentIdx, isAsync }});
                        if (componentIdx === undefined || componentIdx === null) {{
                            throw new Error('missing/invalid component instance index while starting task');
                        }}
                        const tasks = {global_task_map}.get(componentIdx);

                        const nextId = ++NEXT_TASK_ID;
                        const newTask = new {task_class}({{ id: nextId, componentIdx, isAsync }});
                        const newTaskMeta = {{ id: nextId, componentIdx, task: newTask }};

                        {task_id_global} = nextId;
                        {component_idx_global} = componentIdx;

                        if (!tasks) {{
                            {global_task_map}.set(componentIdx, [newTaskMeta]);
                            return nextId;
                        }} else {{
                            tasks.push(newTaskMeta);
                        }}

                        return nextId;
                    }}
                ",
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
                let task_id_global = Self::GlobalAsyncCurrentTaskId.name();
                let component_idx_global = Self::GlobalAsyncCurrentComponentIdx.name();
                output.push_str(&format!(
                    "
                    function {fn_name}(componentIdx, taskId) {{
                        {debug_log_fn}('[{fn_name}()] args', {{ componentIdx }});
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
                                throw new Error('current task does not match expected task ID');
                            }}
                        }}

                        const nextTaskID = tasks.pop();

                        {task_id_global} = nextTaskID;
                        {component_idx_global} = componentIdx;

                        return nextTaskID;
                    }}
                ",
                    fn_name = self.name()
                ));
            }

            Self::AsyncTaskClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let event_code_enum = Intrinsic::AsyncEventCodeEnum.name();
                let task_class = Self::AsyncTaskClass.name();

                let awaitable_class = Intrinsic::AwaitableClass.name();
                let global_async_determinism = Intrinsic::GlobalAsyncDeterminism.name();

                // TODO: remove the public mutable members that are eagerly exposed for early impl
                output.push_str(&format!("
                    class {task_class} {{
                        static State = {{
                            INITIAL: 'initial',
                            CANCEL_PENDING: 'cancel-pending',
                            CANCEL_DELIVERED: 'cancel-delivered',
                            RESOLVED: 'resolved',
                        }}

                        static OnBlockResult = {{
                            CANCELLED: 'on-block.cancelled',
                            RESUMED: 'on-block.resumed',
                        }}

                        #id;
                        #componentIdx;
                        #state;
                        #isAsync;
                        #onResolve = () => {{}};

                        cancelled = false;
                        requested = false;
                        alwaysTaskReturn = false;

                        returnCalls =  0;
                        storage = [0, 0];
                        borrowedHandles = {{}};

                        awaitableResume = null;
                        awaitableCancel = null;

                        constructor(opts) {{
                           if (opts?.id === undefined) {{ throw new TypeError('missing task ID during task creation'); }}
                           this.#id = opts.id;
                           if (opts?.componentIdx === undefined) {{ throw new TypeError('missing component id during task creation'); }}
                           this.#componentIdx = opts.componentIdx;
                           this.#state = {task_class}.State.INITIAL;
                           this.#isAsync = opts?.isAsync ?? false;
                        }}

                        taskState() {{ return this.#state.slice(); }}
                        id() {{ return this.#id; }}
                        componentIdx() {{ return this.#componentIdx; }}

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

                            // TODO: assert scheduler locked
                            // TODO: trap if on the stack

                            const cstate = {get_or_create_async_state_fn}(this.#componentIdx);

                            let mayNotEnter = !this.mayEnter(this);
                            const componentHasPendingTasks = cstate.pendingTasks > 0;
                            if (mayNotEnter || componentHasPendingTasks) {{
                                // TODO: this promise needs to be controllable? Not just pre-determined
                                cstate.pendingTasks.set(this.#id, new {awaitable_class}(new Promise()));

                                const blockResult = await this.onBlock(awaitable);
                                if (blockResult) {{
                                    // TODO: find this pending task in the component
                                    const pendingTask = cstate.pendingTasks.get(this.#id);
                                    if (!pendingTask) {{
                                        throw new Error('pending task [' + this.#id + '] not found for component instance');
                                    }}
                                    cstate.pendingTasks.remove(this.#id);
                                    this.onResolve(null);
                                    return false;
                                }}

                                mayNotEnter = !this.mayEnter(this);
                                if (!mayNotEnter || !cstate.startPendingTask) {{
                                    throw new Error('invalid component entrance/pending task resolution');
                                }}
                                cstate.startPendingTask = false;
                            }}

                            if (!this.isAsync) {{ cstate.callingSyncExport = true; }}

                            return true;
                        }}

                        async waitForEvent(opts) {{
                            const {{ waitableSetRep, isAsync }} = opts;
                            {debug_log_fn}('[{task_class}#waitForEvent()] args', {{ taskID: this.#id, waitableSetRep, isAsync }});

                            if (this.#isAsync !== isAsync) {{
                                throw new Error('async waitForEvent called on non-async task');
                            }}

                            if (this.status === {task_class}.State.CANCEL_PENDING) {{
                                this.#state = {task_class}.State.CANCEL_DELIVERED;
                                return {{
                                    code: {event_code_enum}.TASK_CANCELLED,
                                    something: 0,
                                    something: 0,
                                }};
                            }}

                            const state = {get_or_create_async_state_fn}(this.#componentIdx);
                            const waitableSet = state.waitableSets.get(waitableSetRep);
                            if (!waitableSet) {{ throw new Error('missing/invalid waitable set'); }}

                            waitableSet.numWaiting += 1;
                            let event = null;

                            while (event == null) {{
                                const awaitable = new {awaitable_class}(waitableSet.getPendingEvent());

                                const waited = await this.waitOn({{ awaitable, isAsync, isCancellable: true }});
                                if (waited) {{
                                    if (this.#state !== {task_class}.State.INITIAL) {{
                                        throw new Error('task should be in initial state found [' + this.#state + ']');
                                    }}
                                    this.#state = {task_class}.State.CANCELLED;
                                    return {{
                                        code: {event_code_enum}.TASK_CANCELLED,
                                        something: 0,
                                        something: 0,
                                    }};
                                }}

                                event = waitableSet.poll();
                            }}

                            waitableSet.numWaiting -= 1;
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

                        async waitOn(opts) {{
                            const {{ awaitable, isAsync, isCancellable }} = opts;
                            {debug_log_fn}('[{task_class}#waitOn()] args', {{ taskID: this.#id, awaitable, isAsync, isCancellable }});

                            if (this.#isAsync !== isAsync) {{
                                throw new Error('async waitOn called on non-async task');
                            }}

                            const state = {get_or_create_async_state_fn}(this.#componentIdx);
                            if (isAsync) {{
                                if (state.callingSyncImport()) {{
                                    throw new Error('cannot call async waitOn while calling a sync import');
                                }}
                                state.callingSyncImport(true);
                            }} else {{
                                this.startPendingTask();
                            }}

                            if (!(awaitable instanceof {awaitable_class})) {{
                                throw new Error('invalid awaitable');
                            }}

                            let cancelled;
                            if (awaitable.resolved && {global_async_determinism} === 'random') {{
                                cancelled = false;
                            }} else {{
                                cancelled = await this.onBlock(awaitable);
                                if (cancelled && !cancellable) {{
                                    if (this.#state !== {task_class}.State.INITIAL) {{
                                        throw new Error('uncancellable tasks can only be cancelled from intiial state');
                                    }}
                                    this.#state = {task_class}.State.PENDING_CANCEL;
                                    cancelled = await this.onBlock(awaitable);
                                    if (cancelled) {{
                                        throw new Error('uncancellable tasked cancelled during pending cancellation');
                                    }}
                                }}
                            }}

                            if (isAsync) {{
                                if (!state) {{ throw new Error('unexpectedly missing async state'); }}
                                while (state.callingSyncImport()) {{
                                    await state.waitForSyncImportCallEnd();
                                }}
                            }} else {{
                                state.callingSyncImport(false);
                                state.notifyAllwaitingTasks();
                            }}

                            return cancelled;
                        }}

                        async onBlock(awaitable) {{
                            {debug_log_fn}('[{task_class}#onBlock()] args', {{ taskID: this.#id, awaitable }});
                            if (!(awaitable instanceof {awaitable_class})) {{
                                throw new Error('invalid awaitable during onBlock');
                            }}

                            // Build a promise that this task can await on which resolves when it is awoken
                            const {{ promise, resolve, reject }} = Promise.withResolvers();
                            this.awaitableResume = () => {{
                                {debug_log_fn}('[{task_class}] resuming after onBlock', {{ taskID: this.#id }});
                                resolve();
                            }};
                            this.awaitableCancel = (err) => {{
                                {debug_log_fn}('[{task_class}] rejecting after onBlock', {{ taskID: this.#id, err}});
                                resolve();
                            }};

                            // Park this task/execution to be handled later
                            const state = {get_or_create_async_state_fn}(this.#componentIdx);
                            state.parkTaskOnAwaitable({{ awaitable, task: this }});

                            try {{
                                await promise;
                                return {task_class}.OnBlockResult.RESUMED;
                            }} catch (err) {{
                                // rejection means task cancellation
                                return {task_class}.OnBlockResult.CANCELLED;
                            }}
                        }}

                        // NOTE: this should likely be moved to a SubTask class
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

                        async yield(opts) {{
                            const {{ isAsync }} = opts;
                            {debug_log_fn}('[{task_class}#yield()] args', {{ taskID: this.#id, isAsync }});

                            if (this.#isAsync !== isAsync) {{
                                throw new Error('async yield called on non-async task');
                            }}

                            if (this.status === {task_class}.State.CANCEL_PENDING) {{
                                this.#state = {task_class}.State.CANCELLED;
                                return {{
                                    code: {event_code_enum}.TASK_CANCELLED,
                                    something: 0,
                                    something: 0,
                                }};
                            }}

                            const waitResult = await this.waitOn({{
                                awaitable: new {awaitable_class}(new Promise(resolve => setTimeout(resolve, 0))),
                                isAsync,
                                isCancellable: true
                            }});

                            if (waitResult) {{
                                if (this.#state !== {task_class}.State.INITIAL) {{
                                    throw new Error('task should be in initial state found [' + this.#state + ']');
                                }}
                                this.#state = {task_class}.State.CANCELLED;
                                return {{
                                    code: {event_code_enum}.TASK_CANCELLED,
                                    something: 0,
                                    something: 0,
                                }};
                            }}

                            return {{
                                code: {event_code_enum}.NONE,
                                something: 0,
                                something: 0,
                            }};
                        }}

                        cancel() {{
                            {debug_log_fn}('[{task_class}#cancel()] args', {{ }});
                            if (!task.taskState() !== {task_class}.State.CANCEL_DELIVERED) {{
                                throw new Error('invalid task state for cancellation');
                            }}
                            if (task.borrowedHandles.length > 0) {{ throw new Error('task still has borrow handles'); }}

                            this.#onResolve();
                            this.#state = {task_class}.State.RESOLVED;
                        }}

                        exit() {{
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

                            this.startPendingTask();
                        }}

                        startPendingTask(opts) {{
                            // TODO: implement
                        }}

                    }}
                "));
            }

            Self::AsyncSubtaskClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let subtask_class = Self::AsyncSubtaskClass.name();
                // TODO: remove the public mutable members that are eagerly exposed for early impl
                output.push_str(&format!("
                    class {subtask_class} {{
                        #lenders = null;
                        #waitable = null;

                        resolveDelivered() {{
                            {debug_log_fn}('[{subtask_class}#resolveDelivered()] args', {{ }});
                            if (this.#lenders || self.resolved) {{
                                throw new Error('subtask has no lendors or has already been resolved');
                            }}
                           return this.#lenders !== null;
                        }}

                        drop() {{
                            {debug_log_fn}('[{subtask_class}#drop()] args', {{ }});
                            this.resolveDelivered();
                            if (#this.waitable) {{ this.#waitable.drop(); }}
                        }}
                    }}
                "));
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
                        const waitableSetIdx = result >> 4;
                        return [eventCode, waitableSetIdx];
                    }}
                ",
                ));
            }
        }
    }
}
