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

    /// A class that encapsulates component-level async state
    ComponentAsyncStateClass,
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
            Self::ComponentAsyncStateClass => "ComponentAsyncState",
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

            Self::ComponentAsyncStateClass => {
                let rep_table_class = Intrinsic::RepTableClass.name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                output.push_str(&format!(
                    "
                    class {class_name} {{
                        #callingAsyncImport = false;
                        #syncImportWait = Promise.withResolvers();
                        #lock = null;

                        mayLeave = false;
                        waitableSets = new {rep_table_class}();
                        waitables = new {rep_table_class}();

                        #parkedTasks = new Map();

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
                            this.#syncImportWait = Promise.withResolvers();
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

                            const {{ promise, resolve }} = Promise.withResolvers();
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

                    }}
                    ",
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
        }
    }
}
