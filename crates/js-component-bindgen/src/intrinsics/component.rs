//! Intrinsics that represent helpers that manage per-component state

use crate::{
    intrinsics::{
        Intrinsic,
        p3::{async_stream::AsyncStreamIntrinsic, waitable::WaitableIntrinsic},
    },
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
                    r#"
                    function {backpressure_inc_fn}(componentIdx) {{
                        {debug_log_fn}('[{backpressure_inc_fn}()] args', {{ componentIdx }});
                        const state = {get_or_create_async_state_fn}(componentIdx);
                        if (!state) {{ throw new Error(`missing component state for component [${{componentIdx}}]`); }}
                        const newValue = state.incrementBackpressure();
                        {debug_log_fn}('[{backpressure_inc_fn}()] incremented', {{ componentIdx, newValue }});
                    }}
                    "#,
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
                        const newValue = state.decrementBackpressure();
                        {debug_log_fn}('[{backpressure_dec_fn}()] decremented', {{ componentIdx, newValue }});
                    }}
                "
                ));
            }

            Self::ComponentAsyncStateClass => {
                let component_async_state_class = self.name();
                let debug_log_fn = Intrinsic::DebugLog.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                let internal_stream_class = AsyncStreamIntrinsic::InternalStreamClass.name();
                let global_stream_map = AsyncStreamIntrinsic::GlobalStreamMap.name();
                let global_stream_table_map = AsyncStreamIntrinsic::GlobalStreamTableMap.name();
                let waitable_class = Intrinsic::Waitable(WaitableIntrinsic::WaitableClass).name();
                let get_or_create_async_state_fn = Self::GetOrCreateAsyncState.name();

                output.push_str(&format!(
                    r#"
                    class {component_async_state_class} {{
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

                        #tickLoop = null;
                        #tickLoopInterval = null;

                        #onExclusiveReleaseHandlers = [];

                        mayLeave = true;

                        handles;
                        subtasks;

                        constructor(args) {{
                            this.#componentIdx = args.componentIdx;
                            this.handles = new {rep_table_class}({{ target: `component [${{this.#componentIdx}}] handles (waitable objects)` }});
                            this.subtasks = new {rep_table_class}({{ target: `component [${{this.#componentIdx}}] subtasks` }});
                        }};

                        componentIdx() {{ return this.#componentIdx; }}

                        errored() {{ return this.#errored !== null; }}
                        setErrored(err) {{
                            {debug_log_fn}('[{component_async_state_class}#setErrored()] component errored', {{ err, componentIdx: this.#componentIdx }});
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

                        setBackpressure(v) {{
                            this.#backpressure = v;
                            return this.#backpressure
                        }}
                        getBackpressure() {{ return this.#backpressure; }}

                        incrementBackpressure() {{
                            const current = this.#backpressure;
                            if (current < 0 || current > 2**16) {{
                                throw new Error(`invalid current backpressure value [${{current}}]`);
                            }}
                            const newValue = this.getBackpressure() + 1;
                            if (newValue >= 2**16) {{
                                throw new Error(`invalid new backpressure value [${{newValue}}], overflow`);
                            }}
                            return this.setBackpressure(newValue);
                        }}

                        decrementBackpressure() {{
                            const current = this.#backpressure;
                            if (current < 0 || current > 2**16) {{
                                throw new Error(`invalid current backpressure value [${{current}}]`);
                            }}
                            const newValue = Math.max(0, current - 1);
                            if (newValue < 0) {{
                                throw new Error(`invalid new backpressure value [${{newValue}}], underflow`);
                            }}
                            return this.setBackpressure(newValue);
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

                            if (!{component_async_state_class}.EVENT_HANDLER_EVENTS.includes(event)) {{
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

                        isExclusivelyLocked() {{ return this.#locked === true; }}
                        setLocked(locked) {{
                            this.#locked = locked;
                        }}

                        // TODO(fix): we might want to check for pre-locked status here, we should be deterministically
                        // going from locked -> unlocked and vice versa
                        exclusiveLock() {{
                            {debug_log_fn}('[{component_async_state_class}#exclusiveLock()]', {{
                                locked: this.#locked,
                                componentIdx: this.#componentIdx,
                            }});
                            this.setLocked(true);
                        }}

                        exclusiveRelease() {{
                            {debug_log_fn}('[{component_async_state_class}#exclusiveRelease()] args', {{
                                locked: this.#locked,
                                componentIdx: this.#componentIdx,
                            }});
                            this.setLocked(false);

                            this.#onExclusiveReleaseHandlers = this.#onExclusiveReleaseHandlers.filter(v => !!v);
                            for (const [idx, f] of this.#onExclusiveReleaseHandlers.entries()) {{
                                try {{
                                    this.#onExclusiveReleaseHandlers[idx] = null;
                                    f();
                                }} catch (err) {{
                                    {debug_log_fn}("error while executing handler for next exclusive release", err);
                                    throw err;
                                }}
                            }}
                        }}

                        onNextExclusiveRelease(fn) {{
                            {debug_log_fn}('[{component_async_state_class}#()onNextExclusiveRelease] registering');
                            this.#onExclusiveReleaseHandlers.push(fn);
                        }}

                        #getSuspendedTaskMeta(taskID) {{
                            return this.#suspendedTasksByTaskID.get(taskID);
                        }}

                        #removeSuspendedTaskMeta(taskID) {{
                            {debug_log_fn}('[{component_async_state_class}#removeSuspendedTaskMeta()] removing suspended task', {{ taskID }});
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
                            {debug_log_fn}('[{component_async_state_class}#suspendTask()]', {{
                                taskID,
                                componentIdx: this.#componentIdx,
                                taskEntryFnName: task.entryFnName(),
                                subtask: task.getParentSubtask(),
                            }});

                            if (this.#getSuspendedTaskMeta(taskID)) {{
                                throw new Error(`task [${{taskID}}] already suspended`);
                            }}

                            const {{ promise, resolve, reject }} = Promise.withResolvers();
                            this.#addSuspendedTaskMeta({{
                                task,
                                taskID,
                                readyFn,
                                resume: () => {{
                                    {debug_log_fn}('[{component_async_state_class}#suspendTask()] resuming suspended task', {{ taskID }});
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
                            if (this.#tickLoop !== null) {{ return; }}
                            this.#tickLoop = 1;
                            setTimeout(async () => {{
                                let done = this.tick();
                                while (!done) {{
                                    await new Promise((resolve) => setTimeout(resolve, 30));
                                    done = this.tick();
                                }}
                                this.#tickLoop = null;
                            }}, 10);
                        }}

                        tick() {{
                            // {debug_log_fn}('[{component_async_state_class}#tick()]', {{ suspendedTaskIDs: this.#suspendedTaskIDs }});

                            const resumableTasks = this.#suspendedTaskIDs.filter(t => t !== null);
                            for (const taskID of resumableTasks) {{
                               const meta = this.#suspendedTasksByTaskID.get(taskID);
                                if (!meta || !meta.readyFn) {{
                                    throw new Error(`missing/invalid task despite ID [${{taskID}}] being present`);
                                }}

                                // If the task failed via any means, allow the task to resume because
                                // it's been cancelled -- the callback should immediately exit as well
                                if (meta.task.isRejected()) {{
                                    {debug_log_fn}('[{component_async_state_class}#suspendTask()] detected task rejection, leaving early', {{ meta }});
                                    this.resumeTaskByID(taskID);
                                    return;
                                }}

                                const isReady = meta.readyFn();
                                if (!isReady) {{ continue; }}

                                this.resumeTaskByID(taskID);
                            }}

                            return this.#suspendedTaskIDs.filter(t => t !== null).length === 0;
                        }}

                        addStreamEndToTable(args) {{
                            {debug_log_fn}('[{component_async_state_class}#addStreamEnd()] args', args);
                            const {{ tableIdx, streamEnd }} = args;
                            if (typeof streamEnd === 'number') {{ throw new Error("INSERTING BAD STREAMEND"); }}

                            let {{ table, componentIdx }} = {global_stream_table_map}[tableIdx];
                            if (componentIdx === undefined || !table) {{
                                throw new Error(`invalid global stream table state for table [${{tableIdx}}]`);
                            }}

                            const handle = table.insert(streamEnd);
                            streamEnd.setHandle(handle);
                            streamEnd.setStreamTableIdx(tableIdx);

                            const cstate = {get_or_create_async_state_fn}(componentIdx);
                            const waitableIdx = cstate.handles.insert(streamEnd);
                            streamEnd.setWaitableIdx(waitableIdx);

                            {debug_log_fn}('[{component_async_state_class}#addStreamEnd()] added stream end', {{
                                tableIdx,
                                table,
                                handle,
                                streamEnd,
                                destComponentIdx: componentIdx,
                            }});

                            return {{ handle, waitableIdx }};
                        }}

                        createWaitable(args) {{
                            return new {waitable_class}({{ target: args?.target, }});
                        }}

                        createStream(args) {{
                            {debug_log_fn}('[{component_async_state_class}#createStream()] args', args);
                            const {{ tableIdx, elemMeta }} = args;
                            if (tableIdx === undefined) {{ throw new Error("missing table idx while adding stream"); }}
                            if (elemMeta === undefined) {{ throw new Error("missing element metadata while adding stream"); }}

                            const {{ table: localStreamTable, componentIdx }} = {global_stream_table_map}[tableIdx];
                            if (!localStreamTable) {{
                                throw new Error(`missing global stream table lookup for table [${{tableIdx}}] while creating stream`);
                            }}
                            if (componentIdx !== this.#componentIdx) {{
                                throw new Error('component idx mismatch while creating stream');
                            }}

                            const readWaitable = this.createWaitable();
                            const writeWaitable = this.createWaitable();

                            const stream = new {internal_stream_class}({{
                                tableIdx,
                                componentIdx: this.#componentIdx,
                                elemMeta,
                                readWaitable,
                                writeWaitable,
                            }});
                            stream.setGlobalStreamMapRep({global_stream_map}.insert(stream));

                            const writeEnd = stream.writeEnd();
                            writeEnd.setWaitableIdx(this.handles.insert(writeEnd));
                            writeEnd.setHandle(localStreamTable.insert(writeEnd));
                            if (writeEnd.streamTableIdx() !== tableIdx) {{ throw new Error("unexpectedly mismatched stream table"); }}

                            const writeEndWaitableIdx = writeEnd.waitableIdx();
                            const writeEndHandle = writeEnd.handle();
                            writeWaitable.setTarget(`waitable for stream write end (waitable [${{writeEndWaitableIdx}}])`);
                            writeEnd.setTarget(`stream write end (waitable [${{writeEndWaitableIdx}}])`);

                            const readEnd = stream.readEnd();
                            readEnd.setWaitableIdx(this.handles.insert(readEnd));
                            readEnd.setHandle(localStreamTable.insert(readEnd));
                            if (readEnd.streamTableIdx() !== tableIdx) {{ throw new Error("unexpectedly mismatched stream table"); }}

                            const readEndWaitableIdx = readEnd.waitableIdx();
                            const readEndHandle = readEnd.handle();
                            readWaitable.setTarget(`waitable for read end (waitable [${{readEndWaitableIdx}}])`);
                            readEnd.setTarget(`stream read end (waitable [${{readEndWaitableIdx}}])`);

                            return {{
                                writeEndWaitableIdx,
                                writeEndHandle,
                                readEndWaitableIdx,
                                readEndHandle,
                            }};
                        }}

                        getStreamEnd(args) {{
                            {debug_log_fn}('[{component_async_state_class}#getStreamEnd()] args', args);
                            const {{ tableIdx, streamEndHandle, streamEndWaitableIdx }} = args;
                            if (tableIdx === undefined) {{ throw new Error('missing table idx while getting stream end'); }}

                            const {{ table, componentIdx }} = {global_stream_table_map}[tableIdx];
                            const cstate = {get_or_create_async_state_fn}(componentIdx);

                            let streamEnd;
                            if (streamEndWaitableIdx !== undefined) {{
                                streamEnd = cstate.handles.get(streamEndWaitableIdx);
                            }} else if (streamEndHandle !== undefined) {{
                                if (!table) {{ throw new Error(`missing/invalid table [${{tableIdx}}] while getting stream end`); }}
                                streamEnd = table.get(streamEndHandle);
                            }} else {{
                                throw new TypeError("must specify either waitable idx or handle to retrieve stream");
                            }}

                            if (!streamEnd) {{
                                throw new Error(`missing stream end (tableIdx [${{tableIdx}}], handle [${{streamEndHandle}}], waitableIdx [${{streamEndWaitableIdx}}])`);
                            }}
                            if (tableIdx && streamEnd.streamTableIdx() !== tableIdx) {{
                                throw new Error(`stream end table idx [${{streamEnd.streamTableIdx()}}] does not match [${{tableIdx}}]`);
                            }}

                            return streamEnd;
                        }}

                        deleteStreamEnd(args) {{
                            {debug_log_fn}('[{component_async_state_class}#deleteStreamEnd()] args', args);
                            const {{ tableIdx, streamEndWaitableIdx }} = args;
                            if (tableIdx === undefined) {{ throw new Error("missing table idx while removing stream end"); }}
                            if (streamEndWaitableIdx === undefined) {{ throw new Error("missing stream idx while removing stream end"); }}

                            const {{ table, componentIdx }} = {global_stream_table_map}[tableIdx];
                            const cstate = {get_or_create_async_state_fn}(componentIdx);

                            const streamEnd = cstate.handles.get(streamEndWaitableIdx);
                            if (!streamEnd) {{
                                throw new Error(`missing stream end [${{streamEndWaitableIdx}}] in component handles while deleting stream`);
                            }}
                            if (streamEnd.streamTableIdx() !== tableIdx) {{
                                throw new Error(`stream end table idx [${{streamEnd.streamTableIdx()}}] does not match [${{tableIdx}}]`);
                            }}

                            let removed = cstate.handles.remove(streamEnd.waitableIdx());
                            if (!removed) {{
                                 throw new Error(`failed to remove stream end [${{streamEndWaitableIdx}}] waitable obj in component [${{componentIdx}}]`);
                            }}

                            removed = table.remove(streamEnd.handle());
                            if (!removed) {{
                                 throw new Error(`failed to remove stream end with handle [${{streamEnd.handle()}}] from stream table [${{tableIdx}}] in component [${{componentIdx}}]`);
                            }}

                            return streamEnd;
                        }}

                        removeStreamEndFromTable(args) {{
                            {debug_log_fn}('[{component_async_state_class}#removeStreamEndFromTable()] args', args);

                            const {{ tableIdx, streamWaitableIdx }} = args;
                            if (tableIdx === undefined) {{ throw new Error("missing table idx while removing stream end"); }}
                            if (streamWaitableIdx === undefined) {{
                                throw new Error("missing stream end waitable idx while removing stream end");
                            }}

                            const {{ table, componentIdx }} = {global_stream_table_map}[tableIdx];
                            if (!table) {{ throw new Error(`missing/invalid table [${{tableIdx}}] while removing stream end`); }}

                            const cstate = {get_or_create_async_state_fn}(componentIdx);

                            const streamEnd = cstate.handles.get(streamWaitableIdx);
                            if (!streamEnd) {{
                                throw new Error(`missing stream end (handle [${{streamWaitableIdx}}], table [${{tableIdx}}])`);
                            }}
                            const handle = streamEnd.handle();

                            let removed = cstate.handles.remove(streamWaitableIdx);
                            if (!removed) {{
                                throw new Error(`failed to remove streamEnd from handles (waitable idx [${{streamWaitableIdx}}]), component [${{componentIdx}}])`);
                            }}

                            removed = table.remove(handle);
                            if (!removed) {{
                                throw new Error(`failed to remove streamEnd from table (handle [${{handle}}]), table [${{tableIdx}}], component [${{componentIdx}}])`);
                            }}

                            return streamEnd;
                        }}
                    }}
                    "#,
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
