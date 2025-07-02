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

    /// The definition of the `AsyncTask` JS class
    AsyncTaskClass,

    /// The constant that represents that a async task is blocked
    AsyncBlockedConstant,

    /// The definition of the `AsyncSubtask` JS class
    AsyncSubtaskClass,
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
            Self::GlobalAsyncCurrentTaskMap => "ASYNC_TASKS_BY_COMPONENT_IDX",
            Self::SubtaskCancel => "subtaskCancel",
            Self::SubtaskDrop => "subtaskDrop",
            Self::TaskCancel => "taskCancel",
            Self::TaskReturn => "taskReturn",
            Self::Yield => "asyncYield",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::GlobalAsyncCurrentTaskMap => {
                let var_name = Self::GlobalAsyncCurrentTaskMap.name();
                output.push_str(&format!("const {var_name} = new Map();\n"));
            }

            Self::AsyncBlockedConstant => {
                let name = Self::AsyncBlockedConstant.name();
                output.push_str(&format!("const {name} = 0xFFFF_FFFF;"));
            }

            Self::ContextSet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let context_set_fn = Self::ContextSet.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
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

            Self::ContextGet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let context_get_fn = Self::ContextGet.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
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

            Self::TaskReturn => {
                // TODO(async): write results into provided memory, perform checks for task & result types
                // see: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-taskreturn
                let task_return_fn = Self::TaskReturn.name();
                let task_map = Self::GlobalAsyncCurrentTaskMap.name();

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

            Self::GetCurrentTask => {
                // TODO: remove autovivication of tasks here, they should be created @ lift
                let task_class = Self::AsyncTaskClass.name();
                let current_task_get_fn = Self::GetCurrentTask.name();
                let global_task_map = Self::GlobalAsyncCurrentTaskMap.name();
                output.push_str(&format!(
                    "
                    let CURRENT_TASK;
                    function {current_task_get_fn}(componentIdx) {{
                        if (!componentIdx) {{
                            if (!CURRENT_TASK) {{ CURRENT_TASK = new {task_class}(); }}
                            return CURRENT_TASK;
                        }}
                        if (!{global_task_map}.has(componentIdx)) {{
                            {global_task_map}.set(componentIdx, new {task_class}());
                        }}
                        return {global_task_map}.get(componentIdx);
                    }}
                "
                ));
            }

            Self::AsyncTaskClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let event_code_enum = Intrinsic::AsyncEventCodeEnum.name();
                let task_class = Self::AsyncTaskClass.name();
                // TODO: remove the public mutable members that are eagerly exposed for early impl
                output.push_str(&format!("
                    class {task_class} {{
                        static State = {{
                            INITIAL: 'initial',
                            CANCEL_PENDING: 'cancel-pending',
                            CANCEL_DELIVERED: 'cancel-delivered',
                            RESOLVED: 'resolved',
                        }}

                        #state;
                        #onResolve = () => {{}};

                        cancelled = false;
                        requested = false;
                        alwaysTaskReturn = false;

                        componentIdx;
                        returnCalls =  0;
                        storage = [null, null];
                        borrowedHandles = {{}};

                        taskState() {{ return this.#state.slice(); }}

                        async waitForEvent(opts) {{
                            const {{ waitableSetRep, isAsync }} = opts;
                            {debug_log_fn}('[{task_class}#waitForEvent()] args', {{ waitableSetRep, isAsync }});

                            if (this.status === {task_class}.State.CANCEL_PENDING) {{
                                this.#state = {task_class}.State.CANCEL_DELIVERED;
                                return {{
                                    code: {event_code_enum}.TASK_CANCELLED,
                                    something: 0,
                                    something: 0,
                                }};
                            }}

                            const state = {get_or_create_async_state_fn}(this.componentIdx);
                            const waitableSet = state.waitableSets.get(waitableSetRep);
                            if (!waitableSet) {{ throw new Error('missing/invalid waitable set'); }}

                            waitableSet.numWaiting += 1;
                            let event = null;

                            while (event == null) {{
                                const promise = waitableSet.getPendingEvent();

                                const waited = await this.waitOn({{ promise, isAsync, isCancellable: true }});
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
                            {debug_log_fn}('[{task_class}#pollForEvent()] args', {{ waitableSetRep, isAsync }});

                            throw new Error('not implemented');
                        }}

                        async waitOn(opts) {{
                            const {{ promise, isAsync, isCancellable }} = opts;
                            {debug_log_fn}('[{task_class}#waitOn()] args', {{ promise, isAsync, isCancellable }});

                            // TODO: promise might be a waitable thing (ex. StreamEnd with waitable inside)

                            if (!promise) {{
                                // TODO
                            }}

                            throw new Error('not implemented');
                        }}

                        async yield(opts) {{
                            const {{ isAsync }} = opts;
                            {debug_log_fn}('[{task_class}#yield()] args', {{ isAsync }});

                            if (this.status === {task_class}.State.CANCEL_PENDING) {{
                                this.#state = {task_class}.State.CANCELLED;
                                return {{
                                    code: {event_code_enum}.TASK_CANCELLED,
                                    something: 0,
                                    something: 0,
                                }};
                            }}

                            const promise = new Promise(resolve => setTimeout(resolve, 100));
                            const waitResult = await this.waitOn({{ promise, isAsync, isCancellable: true }});
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
        }
    }
}
