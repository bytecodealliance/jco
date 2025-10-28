//! Intrinsics that represent helpers that manage per-component state

use crate::{intrinsics::Intrinsic, source::Source};

/// This enum contains intrinsics that manage per-component state
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ComponentIntrinsic {
    /// Global that stores async state by component instance
    ///
    /// ```ts
    /// type ComponentAsyncState = {
    ///     mayLeave: boolean,
    /// };
    /// type GlobalAsyncStateMap = Map<number, ComponentAsyncState>;
    /// ```
    GlobalAsyncStateMap,

    /// Function that retrieves or creates async state for a given component instance
    GetOrCreateAsyncState,

    /// Set the backpressure for a given component instance
    ///
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type Value = 0 | 1;
    /// function backpressureSet(componentIdx: number, value: val);
    /// ```
    BackpressureSet,

    /// Increment the backpressure for a given component instance
    ///
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function backpressureSet(componentIdx: number);
    /// ```
    BackpressureInc,

    /// Decrement the backpressure for a given component instance
    ///
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function backpressureSet(componentIdx: number);
    /// ```
    BackpressureDec,

    /// A class that encapsulates component-level async state
    ComponentAsyncStateClass,

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
}

impl ComponentIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        []
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::GlobalAsyncStateMap => "ASYNC_STATE",
            Self::GetOrCreateAsyncState => "getOrCreateAsyncState",
            Self::BackpressureSet => "backpressureSet",
            Self::BackpressureInc => "backpressureInc",
            Self::BackpressureDec => "backpressureDec",
            Self::ComponentAsyncStateClass => "ComponentAsyncState",
            Self::LowerImport => "_intrinsic_component_lowerImport",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::GlobalAsyncStateMap => {
                let var_name = Self::GlobalAsyncStateMap.name();
                output.push_str(&format!("const {var_name} = new Map();\n"));
            }

            Self::BackpressureSet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let backpressure_set_fn = Self::BackpressureSet.name();
                let get_or_create_async_state_fn = Self::GetOrCreateAsyncState.name();
                output.push_str(&format!("
                    function {backpressure_set_fn}(componentInstanceID, value) {{
                        {debug_log_fn}('[{backpressure_set_fn}()] args', {{ componentInstanceID, value }});
                        if (typeof value !== 'number') {{ throw new TypeError('invalid value for backpressure set'); }}
                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        state.backpressure = value !== 0;
                    }}
                "));
            }

            Self::BackpressureInc => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let backpressure_inc_fn = Self::BackpressureInc.name();
                let get_or_create_async_state_fn = Self::GetOrCreateAsyncState.name();
                output.push_str(&format!(
                    "
                    function {backpressure_inc_fn}(componentInstanceID) {{
                        {debug_log_fn}('[{backpressure_inc_fn}()] args', {{ componentInstanceID }});
                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        state.backpressure += 1;
                    }}
                "
                ));
            }

            Self::BackpressureDec => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let backpressure_dec_fn = Self::BackpressureDec.name();
                let get_or_create_async_state_fn = Self::GetOrCreateAsyncState.name();
                output.push_str(&format!(
                    "
                    function {backpressure_dec_fn}(componentInstanceID) {{
                        {debug_log_fn}('[{backpressure_dec_fn}()] args', {{ componentInstanceID }});
                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        state.backpressure = Math.max(0, state.backpressure - 1) ;
                    }}
                "
                ));
            }

            Self::ComponentAsyncStateClass => {
                let rep_table_class = Intrinsic::RepTableClass.name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!(
                    r#"
                    class {class_name} {{
                        #callingAsyncImport = false;
                        #syncImportWait = promiseWithResolvers();
                        #lock = null;

                        mayLeave = true;
                        waitableSets = new {rep_table_class}();
                        waitables = new {rep_table_class}();
                        subtasks = new {rep_table_class}();

                        #parkedTasks = new Map();

                        #suspendedTasksByTaskID = new Map();
                        #suspendedTaskIDs = [];
                        #taskResumerInterval = null;

                        #pendingTasks = [];

                        constructor(args) {{
                            this.#taskResumerInterval = setInterval(() => {{
                                try {{
                                    this.tick();
                                }} catch (err) {{
                                    {debug_log_fn}('[{class_name}#taskResumer()] tick failed', {{ err }});
                                }}
                            }}, 0);
                        }};

                        callingSyncImport(val) {{
                            if (val === undefined) {{ return this.#callingAsyncImport; }}
                            if (typeof val !== 'boolean') {{ throw new TypeError('invalid setting for async import'); }}
                            const prev = this.#callingAsyncImport;
                            this.#callingAsyncImport = val;
                            if (prev === true && this.#callingAsyncImport === false) {{
                                this.#notifySyncImportEnd();
                            }}
                        }}

                        #notifySyncImportEnd() {{
                            const existing = this.#syncImportWait;
                            this.#syncImportWait = promiseWithResolvers();
                            existing.resolve();
                        }}

                        async waitForSyncImportCallEnd() {{
                            await this.#syncImportWait.promise;
                        }}

                        parkTaskOnAwaitable(args) {{
                            if (!args.awaitable) {{ throw new TypeError('missing awaitable when trying to park'); }}
                            if (!args.task) {{ throw new TypeError('missing task when trying to park'); }}
                            const {{ awaitable, task }} = args;

                            let taskList = this.#parkedTasks.get(awaitable.id());
                            if (!taskList) {{
                                taskList = [];
                                this.#parkedTasks.set(awaitable.id(), taskList);
                            }}
                            taskList.push(task);

                            this.wakeNextTaskForAwaitable(awaitable);
                        }}

                        wakeNextTaskForAwaitable(awaitable) {{
                            if (!awaitable) {{ throw new TypeError('missing awaitable when waking next task'); }}
                            const awaitableID = awaitable.id();

                            const taskList = this.#parkedTasks.get(awaitableID);
                            if (!taskList || taskList.length === 0) {{
                              {debug_log_fn}('[{class_name}] no tasks waiting for awaitable', {{ awaitableID: awaitable.id() }});
                              return;
                            }}

                            let task = taskList.shift(); // todo(perf)
                            if (!task) {{ throw new Error('no task in parked list despite previous check'); }}

                            if (!task.awaitableResume) {{
                                throw new Error('task ready due to awaitable is missing resume', {{ taskID: task.id(), awaitableID }});
                            }}
                            task.awaitableResume();
                        }}

                        async exclusiveLock() {{  // TODO: use atomics
                            if (this.#lock === null) {{
                                this.#lock = {{ ticket: 0n }};
                            }}

                            // Take a ticket for the next valid usage
                            const ticket = ++this.#lock.ticket;

                            {debug_log_fn}('[{class_name}#exclusiveLock()] locking', {{
                                currentTicket: ticket - 1n,
                                ticket
                            }});

                            // If there is an active promise, then wait for it
                            let finishedTicket;
                            while (this.#lock.promise) {{
                                finishedTicket = await this.#lock.promise;
                                if (finishedTicket === ticket - 1n) {{ break; }}
                            }}

                            const {{ promise, resolve }} = promiseWithResolvers();
                            this.#lock = {{
                                ticket,
                                promise,
                                resolve,
                            }};

                            return this.#lock.promise;
                        }}

                        exclusiveRelease() {{
                            {debug_log_fn}('[{class_name}#exclusiveRelease()] releasing', {{
                                currentTicket: this.#lock === null ? 'none' : this.#lock.ticket,
                            }});

                            if (this.#lock === null) {{ return; }}

                            const existingLock = this.#lock;
                            this.#lock = null;
                            existingLock.resolve(existingLock.ticket);
                        }}

                        isExclusivelyLocked() {{ return this.#lock !== null; }}

                        #getSuspendedTaskMeta(taskID) {{
                            return this.#suspendedTasksByTaskID.get(taskID);
                        }}

                        #removeSuspendedTaskMeta(taskID) {{
                            {debug_log_fn}('[{class_name}#removeSuspendedTaskMeta()] removing suspended task', {{ taskID }});
                            const idx = this.#suspendedTaskIDs.findIndex(t => t && t.taskID === taskID);
                            const meta = this.#suspendedTasksByTaskID.get(taskID);
                            this.#suspendedTaskIDs[idx] = null;
                            this.#suspendedTasksByTaskID.delete(taskID);
                            return meta;
                        }}

                        #addSuspendedTaskMeta(meta) {{
                            if (!meta) {{ throw new Error('missing task meta'); }}
                            const taskID = meta.taskID;
                            this.#suspendedTasksByTaskID.set(taskID, meta);
                            this.#suspendedTaskIDs.push(taskID);
                            if (this.#suspendedTasksByTaskID.size < this.#suspendedTaskIDs.length - 10) {{
                                this.#suspendedTaskIDs = this.#suspendedTaskIDs.filter(t => t !== null);
                            }}
                        }}

                        suspendTask(args) {{
                            // TODO(threads): readyFn is normally on the thread
                            const {{ task, readyFn }} = args;
                            const taskID = task.id();
                            {debug_log_fn}('[{class_name}#suspendTask()]', {{ taskID }});

                            if (this.#getSuspendedTaskMeta(taskID)) {{
                                throw new Error('task [' + taskID + '] already suspended');
                            }}

                            const {{ promise, resolve }} = Promise.withResolvers();
                            this.#addSuspendedTaskMeta({{
                                task,
                                taskID,
                                readyFn,
                                resume: () => {{
                                    {debug_log_fn}('[{class_name}#suspendTask()] resuming suspended task', {{ taskID }});
                                    // TODO(threads): it's thread cancellation we should be checking for below, not task
                                    resolve(!task.isCancelled());
                                }},
                            }});

                            return promise;
                        }}

                        resumeTaskByID(taskID) {{
                            const meta = this.#removeSuspendedTaskMeta(taskID);
                            if (!meta) {{ return; }}
                            if (meta.taskID !== taskID) {{ throw new Error('task ID does not match'); }}
                            meta.resume();
                        }}

                        tick() {{
                            for (const taskID of this.#suspendedTaskIDs.filter(t => t !== null)) {{
                                const meta = this.#suspendedTasksByTaskID.get(taskID);
                                if (!meta || !meta.readyFn) {{
                                    throw new Error('missing/invalid task despite ID [' + taskID + '] being present');
                                }}
                                if (!meta.readyFn()) {{ continue; }}
                                this.resumeTaskByID(taskID);
                            }}
                        }}

                        addPendingTask(task) {{
                            this.#pendingTasks.push(task);
                        }}
                    }}
                    "#,
                    class_name = self.name(),
                ));
            }

            Self::GetOrCreateAsyncState => {
                let get_state_fn = Self::GetOrCreateAsyncState.name();
                let async_state_map = Self::GlobalAsyncStateMap.name();
                let component_async_state_class = Self::ComponentAsyncStateClass.name();
                output.push_str(&format!(
                    "
                    function {get_state_fn}(componentIdx, init) {{
                        if (!{async_state_map}.has(componentIdx)) {{
                            {async_state_map}.set(componentIdx, new {component_async_state_class}());
                        }}
                        return {async_state_map}.get(componentIdx);
                    }}
                "
                ));
            }

            // NOTE: LowerImport is called but is *not used* as a function,
            // instead having a chance to do some modification *before* the final
            // creation of instantiated modules' exports
            Self::LowerImport => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let lower_import_fn = Self::LowerImport.name();
                output.push_str(&format!(
                    "
                    function {lower_import_fn}(args) {{
                        {debug_log_fn}('[{lower_import_fn}()] args', args);
                        throw new Error('runtime LowerImport not implmented');
                    }}
                    "
                ));
            }
        }
    }
}
