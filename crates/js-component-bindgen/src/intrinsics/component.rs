//! Intrinsics that represent helpers that manage per-component state

use crate::{
    intrinsics::{Intrinsic, p3::async_stream::AsyncStreamIntrinsic},
    source::Source,
};

/// This enum contains intrinsics that manage per-component state
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
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

    /// Increment the backpressure for a given component instance
    ///
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function backpressureInc(componentIdx: number);
    /// ```
    BackpressureInc,

    /// Decrement the backpressure for a given component instance
    ///
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function backpressureDec(componentIdx: number);
    /// ```
    BackpressureDec,

    /// A class that encapsulates component-level async state
    ComponentAsyncStateClass,

    /// Intrinsic used to set all component async states to error.
    ///
    /// Practically, this stops all individual component event loops (`AsyncComponentState#tick()`)
    /// and will usually allow the JS event loop which would otherwise be running `tick()` intervals
    /// forever.
    ///
    ComponentStateSetAllError,
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
            Self::BackpressureInc => "backpressureInc",
            Self::BackpressureDec => "backpressureDec",
            Self::ComponentAsyncStateClass => "ComponentAsyncState",
            Self::ComponentStateSetAllError => "_ComponentStateSetAllError",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::GlobalAsyncStateMap => {
                let var_name = Self::GlobalAsyncStateMap.name();
                output.push_str(&format!("const {var_name} = new Map();\n"));
            }

            Self::BackpressureInc => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let backpressure_inc_fn = Self::BackpressureInc.name();
                let get_or_create_async_state_fn = Self::GetOrCreateAsyncState.name();
                output.push_str(&format!(
                    "
                    function {backpressure_inc_fn}(componentIdx) {{
                        {debug_log_fn}('[{backpressure_inc_fn}()] args', {{ componentIdx }});
                        const state = {get_or_create_async_state_fn}(componentIdx);
                        state.incrementBackpressure();
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
                    function {backpressure_dec_fn}(componentIdx) {{
                        {debug_log_fn}('[{backpressure_dec_fn}()] args', {{ componentIdx }});
                        const state = {get_or_create_async_state_fn}(componentIdx);
                        state.decrementBackpressure();
                    }}
                "
                ));
            }

            Self::ComponentAsyncStateClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                let internal_stream_class = AsyncStreamIntrinsic::InternalStreamClass.name();
                let global_stream_map = AsyncStreamIntrinsic::GlobalStreamMap.name();

                output.push_str(&format!(
                    r#"
                    class {class_name} {{
                        static EVENT_HANDLER_EVENTS = [ 'backpressure-change' ];

                        #componentIdx;
                        #callingAsyncImport = false;
                        #syncImportWait = promiseWithResolvers();
                        #locked = false;
                        #parkedTasks = new Map();
                        #suspendedTasksByTaskID = new Map();
                        #suspendedTaskIDs = [];
                        #errored = null;

                        #backpressure = 0;
                        #backpressureWaiters = 0n;

                        #handlerMap = new Map();
                        #nextHandlerID = 0n;

                        #streams;

                        #tickLoop = null;
                        #tickLoopInterval = null;

                        mayLeave = true;

                        waitableSets;
                        waitables;
                        subtasks;

                        constructor(args) {{
                            this.#componentIdx = args.componentIdx;
                            this.waitableSets = new {rep_table_class}({{ target: `component [${{this.#componentIdx}}] waitable sets` }});
                            this.waitables = new {rep_table_class}({{ target: `component [${{this.#componentIdx}}] waitable objects` }});
                            this.subtasks = new {rep_table_class}({{ target: `component [${{this.#componentIdx}}] subtasks` }});
                            this.#streams = new Map();
                        }};

                        componentIdx() {{ return this.#componentIdx; }}
                        streams() {{ return this.#streams; }}

                        errored() {{ return this.#errored !== null; }}
                        setErrored(err) {{
                            {debug_log_fn}('[{class_name}#setErrored()] component errored', {{ err, componentIdx: this.#componentIdx }});
                            if (this.#errored) {{ return; }}
                            if (!err) {{
                                err = new Error('error elswehere (see other component instance error)')
                                err.componentIdx = this.#componentIdx;
                            }}
                            this.#errored = err;
                        }}

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

                        setBackpressure(v) {{ this.#backpressure = v; }}
                        getBackpressure(v) {{ return this.#backpressure; }}
                        incrementBackpressure() {{
                            const newValue = this.getBackpressure() + 1;
                            if (newValue > 2**16) {{ throw new Error("invalid backpressure value, overflow"); }}
                            this.setBackpressure(newValue);
                        }}
                        decrementBackpressure() {{
                            this.setBackpressure(Math.max(0, this.getBackpressure() - 1));
                        }}
                        hasBackpressure() {{ return this.#backpressure > 0; }}

                        waitForBackpressure() {{
                            let backpressureCleared = false;
                            const cstate = this;
                            cstate.addBackpressureWaiter();
                            const handlerID = this.registerHandler({{
                                event: 'backpressure-change',
                                fn: (bp) => {{
                                    if (bp === 0) {{
                                        cstate.removeHandler(handlerID);
                                        backpressureCleared = true;
                                    }}
                                }}
                            }});
                            return new Promise((resolve) => {{
                                const interval = setInterval(() => {{
                                    if (backpressureCleared) {{ return; }}
                                    clearInterval(interval);
                                    cstate.removeBackpressureWaiter();
                                    resolve(null);
                                }}, 0);
                            }});
                        }}

                        registerHandler(args) {{
                            const {{ event, fn }} = args;
                            if (!event) {{ throw new Error("missing handler event"); }}
                            if (!fn) {{ throw new Error("missing handler fn"); }}

                            if (!{class_name}.EVENT_HANDLER_EVENTS.includes(event)) {{
                                throw new Error(`unrecognized event handler [${{event}}]`);
                            }}

                            const handlerID = this.#nextHandlerID++;
                            let handlers = this.#handlerMap.get(event);
                            if (!handlers) {{
                                handlers = [];
                                this.#handlerMap.set(event, handlers)
                            }}

                            handlers.push({{ id: handlerID, fn, event }});
                            return handlerID;
                        }}

                        removeHandler(args) {{
                            const {{ event, handlerID }} = args;
                            const registeredHandlers = this.#handlerMap.get(event);
                            if (!registeredHandlers) {{ return; }}
                            const found = registeredHandlers.find(h => h.id === handlerID);
                            if (!found) {{ return; }}
                            this.#handlerMap.set(event, this.#handlerMap.get(event).filter(h => h.id !== handlerID));
                        }}

                        getBackpressureWaiters() {{ return this.#backpressureWaiters; }}
                        addBackpressureWaiter() {{ this.#backpressureWaiters++; }}
                        removeBackpressureWaiter() {{
                            this.#backpressureWaiters--;
                            if (this.#backpressureWaiters < 0) {{
                                throw new Error("unexepctedly negative number of backpressure waiters");
                            }}
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

                        isExclusivelyLocked() {{ return this.#locked === true; }}
                        setLocked(locked) {{ this.#locked = locked; }}
                        // TODO(fix): we might want to check for pre-locked status here, we should be deterministically
                        // going from locked -> unlocked and vice versa
                        exclusiveLock() {{
                            {debug_log_fn}('[{class_name}#exclusiveLock()]', {{
                                locked: this.#locked,
                                componentIdx: this.#componentIdx,
                            }});
                            this.setLocked(true);
                        }}
                        exclusiveRelease() {{
                            {debug_log_fn}('[{class_name}#exclusiveRelease()]', {{
                                locked: this.#locked,
                                componentIdx: this.#componentIdx,
                            }});
                            this.setLocked(false);
                        }}

                        #getSuspendedTaskMeta(taskID) {{
                            return this.#suspendedTasksByTaskID.get(taskID);
                        }}

                        #removeSuspendedTaskMeta(taskID) {{
                            {debug_log_fn}('[{class_name}#removeSuspendedTaskMeta()] removing suspended task', {{ taskID }});
                            const idx = this.#suspendedTaskIDs.findIndex(t => t === taskID);
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

                        // TODO(threads): readyFn is normally on the thread
                        suspendTask(args) {{
                            const {{ task, readyFn }} = args;
                            const taskID = task.id();
                            {debug_log_fn}('[{class_name}#suspendTask()]', {{ taskID }});

                            if (this.#getSuspendedTaskMeta(taskID)) {{
                                throw new Error(`task [${{taskID}}] already suspended`);
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

                            this.runTickLoop();

                            return promise;
                        }}

                        resumeTaskByID(taskID) {{
                            const meta = this.#removeSuspendedTaskMeta(taskID);
                            if (!meta) {{ return; }}
                            if (meta.taskID !== taskID) {{ throw new Error('task ID does not match'); }}
                            meta.resume();
                        }}

                        async runTickLoop() {{
                            if (this.#tickLoop !== null) {{ await this.#tickLoop; }}
                            this.#tickLoop = new Promise(async (resolve) => {{
                                let done = this.tick();
                                while (!done) {{
                                    await new Promise((resolve) => setTimeout(resolve, 0));
                                    done = this.tick();
                                }}
                                this.#tickLoop = null;
                                resolve();
                            }});
                        }}

                        tick() {{
                            {debug_log_fn}('[{class_name}#tick()]', {{ suspendedTaskIDs: this.#suspendedTaskIDs }});
                            const resumableTasks = this.#suspendedTaskIDs.filter(t => t !== null);
                            for (const taskID of resumableTasks) {{
                                const meta = this.#suspendedTasksByTaskID.get(taskID);
                                if (!meta || !meta.readyFn) {{
                                    throw new Error(`missing/invalid task despite ID [${{taskID}}] being present`);
                                }}

                                const isReady = meta.readyFn();
                                if (!isReady) {{ continue; }}

                                this.resumeTaskByID(taskID);
                            }}

                            return this.#suspendedTaskIDs.filter(t => t !== null).length === 0;
                        }}

                        addStreamEnd(args) {{
                            {debug_log_fn}('[{class_name}#addStreamEnd()] args', args);
                            const {{ tableIdx, streamEnd }} = args;

                            let tbl = this.#streams.get(tableIdx);
                            if (!tbl) {{
                                tbl = new {rep_table_class}({{ target: `stream table (idx [${{tableIdx}}], component [${{this.#componentIdx}}])` }});
                                this.#streams.set(tableIdx, tbl);
                            }}

                            // TODO(fix): streams are waitables so need to go there
                            const streamIdx = tbl.insert(streamEnd);
                            return streamIdx;
                        }}

                        createStream(args) {{
                            {debug_log_fn}('[{class_name}#createStream()] args', args);
                            const {{ tableIdx, elemMeta }} = args;
                            if (tableIdx === undefined) {{ throw new Error("missing table idx while adding stream"); }}
                            if (elemMeta === undefined) {{ throw new Error("missing element metadata while adding stream"); }}

                            let localStreamTable = this.#streams.get(tableIdx);
                            if (!localStreamTable) {{
                                localStreamTable = new {rep_table_class}({{ target: `component [${{this.#componentIdx}}] streams` }});
                                this.#streams.set(tableIdx, localStreamTable);
                            }}

                            const stream = new {internal_stream_class}({{
                                tableIdx,
                                componentIdx: this.#componentIdx,
                                elemMeta,
                                localStreamTable,
                                globalStreamMap: {global_stream_map},
                            }});

                            const writeEndIdx = this.waitables.insert(stream.writeEnd());
                            stream.setWriteEndWaitableIdx(writeEndIdx);

                            const readEndIdx = this.waitables.insert(stream.readEnd());
                            stream.setReadEndWaitableIdx(readEndIdx);

                            return {{ writeEndIdx, readEndIdx }};
                        }}

                        getStreamEnd(args) {{
                            {debug_log_fn}('[{class_name}#getStreamEnd()] args', args);
                            const {{ tableIdx, streamEndIdx }} = args;
                            if (tableIdx === undefined) {{ throw new Error('missing table idx while getting stream end'); }}
                            if (streamEndIdx === undefined) {{ throw new Error('missing stream idx while getting stream end'); }}

                            const streamEnd = this.waitables.get(streamEndIdx);
                            if (!streamEnd) {{
                                throw new Error(`missing stream table [${{tableIdx}}] in component [${{this.#componentIdx}}] while getting stream`);
                            }}
                            if (streamEnd.streamTableIdx() !== tableIdx) {{
                                throw new Error(`stream end table idx [${{streamEnd.streamTableIdx()}}] does not match [${{tableIdx}}]`);
                            }}

                            return streamEnd;
                        }}

                        // TODO(fix): local/global stream table checks could be simplified/removed, if we centralize tracking
                        removeStreamEnd(args) {{
                            {debug_log_fn}('[{class_name}#removeStreamEnd()] args', args);
                            const {{ tableIdx, streamEndIdx }} = args;
                            if (tableIdx === undefined) {{ throw new Error("missing table idx while removing stream end"); }}
                            if (streamEndIdx === undefined) {{ throw new Error("missing stream idx while removing stream end"); }}

                            const streamEnd = this.waitables.get(streamEndIdx);
                            if (!streamEnd) {{
                                throw new Error(`missing stream table [${{tableIdx}}] in component [${{this.#componentIdx}}] while getting stream`);
                            }}
                            if (streamEnd.streamTableIdx() !== tableIdx) {{
                                throw new Error(`stream end table idx [${{streamEnd.streamTableIdx()}}] does not match [${{tableIdx}}]`);
                            }}

                            const removed = this.waitables.remove(streamEnd.waitableIdx());
                            if (!removed) {{
                                 throw new Error(`failed to remove stream [${{streamEndIdx}}] waitable obj in component [${{this.#componentIdx}}] while removing stream end`);
                            }}

                            return streamEnd;
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
                    r#"
                    function {get_state_fn}(componentIdx, init) {{
                        if (!{async_state_map}.has(componentIdx)) {{
                            const newState = new {component_async_state_class}({{ componentIdx }});
                            {async_state_map}.set(componentIdx, newState);
                        }}
                        return {async_state_map}.get(componentIdx);
                    }}
                   "#
                ));
            }

            Self::ComponentStateSetAllError => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let async_state_map = Self::GlobalAsyncStateMap.name();
                let component_state_set_all_error_fn = Self::ComponentStateSetAllError.name();
                output.push_str(&format!(
                    r#"
                    function {component_state_set_all_error_fn}() {{
                        {debug_log_fn}('[{component_state_set_all_error_fn}()]');
                        for (const state of {async_state_map}.values()) {{
                            state.setErrored();
                        }}
                    }}
                    "#
                ));
            }
        }
    }
}
