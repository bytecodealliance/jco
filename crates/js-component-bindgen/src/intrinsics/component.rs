//! Intrinsics that represent helpers that manage per-component state

use std::fmt::Write as _;

use crate::intrinsics::p3::async_future::AsyncFutureIntrinsic;
use crate::intrinsics::p3::async_stream::AsyncStreamIntrinsic;
use crate::intrinsics::p3::waitable::WaitableIntrinsic;
use crate::intrinsics::{Intrinsic, RenderIntrinsicsArgs};
use crate::source::Source;
use crate::uwriteln;

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
    pub fn render(&self, output: &mut Source, _render_args: &RenderIntrinsicsArgs<'_>) {
        match self {
            Self::GlobalAsyncStateMap => {
                let var_name = Self::GlobalAsyncStateMap.name();
                uwriteln!(output, r#"const {var_name} = new Map();"#);
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
                let internal_future_class = AsyncFutureIntrinsic::InternalFutureClass.name();
                let global_future_map = AsyncFutureIntrinsic::GlobalFutureMap.name();
                let global_future_table_map = AsyncFutureIntrinsic::GlobalFutureTableMap.name();
                let waitable_class = Intrinsic::Waitable(WaitableIntrinsic::WaitableClass).name();
                let get_or_create_async_state_fn = Self::GetOrCreateAsyncState.name();
                let promise_with_resolvers_fn = Intrinsic::PromiseWithResolversPonyfill.name();
                let stream_readable_end_class =
                    Intrinsic::AsyncStream(AsyncStreamIntrinsic::StreamReadableEndClass).name();

                output.push_str(&format!(
                    r#"
                    class {component_async_state_class} {{
                        static EVENT_HANDLER_EVENTS = [ 'backpressure-change' ];

                        static TickResult = {{
                            // no suspended tasks remain
                            DONE: 'done',
                            // a suspended task was resumed (more may be ready)
                            RESUMED: 'resumed',
                            // suspended tasks remain but none were ready
                            IDLE: 'idle',
                        }};

                        #componentIdx;
                        #callingAsyncImport = false;
                        #syncImportWait = {promise_with_resolvers_fn}();
                        #lockHolderTaskID = null;
                        #lockWaiters = [];
                        #lockHandoffScheduled = false;
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
                            this.#syncImportWait = {promise_with_resolvers_fn}();
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

                        // The per-slice mutual-exclusion lock for guest execution in this
                        // component instance. Guest slices (callback invocations and
                        // sync-lifted bodies) must be atomic per component even across the
                        // JSPI suspensions jco introduces for host imports: wit-bindgen's
                        // executors publish per-task state in single linear-memory cells
                        // (the wasip3-task pointer, context-local storage discipline) that
                        // an interleaved slice of the same component corrupts
                        //
                        // The lock is *owned*: acquisition records the holder task and
                        // release is a no-op for anyone else, so a task exiting can no
                        // longer drop a hold it does not own (blind acquire/release-any
                        // was the previous discipline). Contended acquisition queues
                        // FIFO; release hands the lock to the next waiter directly.
                        isExclusivelyLocked() {{ return this.#lockHolderTaskID !== null; }}
                        exclusivelyLockedBy(taskID) {{ return this.#lockHolderTaskID === taskID; }}

                        exclusiveLock(taskID) {{
                            {debug_log_fn}('[{component_async_state_class}#exclusiveLock()]', {{
                                holder: this.#lockHolderTaskID,
                                requester: taskID,
                                componentIdx: this.#componentIdx,
                            }});
                            if (taskID === undefined || taskID === null) {{
                                throw new Error('exclusive lock requires the acquiring task id');
                            }}
                            if (this.#lockHolderTaskID !== null) {{
                                throw new Error(`component [${{this.#componentIdx}}] exclusive lock held by task [${{this.#lockHolderTaskID}}], requested by [${{taskID}}]`);
                            }}
                            this.#lockHolderTaskID = taskID;
                        }}

                        // Awaitable acquisition: takes the lock immediately when free,
                        // otherwise queues FIFO behind the current holder and earlier
                        // waiters. The resolved promise implies ownership.
                        async acquireExclusiveLock(taskID) {{
                            if (taskID === undefined || taskID === null) {{
                                throw new Error('exclusive lock requires the acquiring task id');
                            }}
                            if (this.#lockHolderTaskID === null) {{
                                this.#lockHolderTaskID = taskID;
                                {debug_log_fn}('[{component_async_state_class}#acquireExclusiveLock()] acquired', {{
                                    holder: taskID,
                                    componentIdx: this.#componentIdx,
                                }});
                                return;
                            }}
                            if (this.#lockHolderTaskID === taskID) {{
                                throw new Error(`task [${{taskID}}] already holds the lock for component [${{this.#componentIdx}}]`);
                            }}
                            {debug_log_fn}('[{component_async_state_class}#acquireExclusiveLock()] waiting', {{
                                holder: this.#lockHolderTaskID,
                                requester: taskID,
                                componentIdx: this.#componentIdx,
                                queued: this.#lockWaiters.length,
                            }});
                            await new Promise((resolve) => {{
                                this.#lockWaiters.push({{ taskID, resolve }});
                            }});
                        }}

                        exclusiveRelease(taskID) {{
                            {debug_log_fn}('[{component_async_state_class}#exclusiveRelease()] args', {{
                                holder: this.#lockHolderTaskID,
                                releaser: taskID,
                                componentIdx: this.#componentIdx,
                            }});
                            if (this.#lockHolderTaskID !== taskID) {{
                                // Ownerless releases were the historical behavior; a foreign
                                // release now leaves the hold intact
                                {debug_log_fn}('[{component_async_state_class}#exclusiveRelease()] ignoring foreign release', {{
                                    holder: this.#lockHolderTaskID,
                                    releaser: taskID,
                                    componentIdx: this.#componentIdx,
                                }});
                                return false;
                            }}

                            // Make the release observable before handing the lock to the next
                            // asynchronous guest slice.
                            //
                            // Release handlers may expose a lifted value whose consumer immediately
                            // performs a synchronous call on the same component; that call must run
                            // while the instance is genuinely unlocked, not via enterSync's
                            // lock-free fallback code.
                            this.#lockHolderTaskID = null;

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
                            this.#scheduleLockHandoff();
                            return true;
                        }}

                        #scheduleLockHandoff() {{
                            if (this.#lockHandoffScheduled || this.#lockWaiters.length === 0) {{ return; }}
                            this.#lockHandoffScheduled = true;
                            queueMicrotask(() => {{
                                this.#lockHandoffScheduled = false;
                                // A synchronous call triggered by a release handler gets the
                                // first opportunity to use the unlocked component.
                                //
                                // Its release will leave this queued handoff in place.
                                if (this.#lockHolderTaskID !== null) {{
                                    this.#scheduleLockHandoff();
                                    return;
                                }}
                                const next = this.#lockWaiters.shift();
                                if (!next) {{ return; }}
                                this.#lockHolderTaskID = next.taskID;
                                next.resolve();
                            }});
                        }}

                        onNextExclusiveRelease(fn) {{
                            {debug_log_fn}('[{component_async_state_class}#()onNextExclusiveRelease] registering');
                            this.#onExclusiveReleaseHandlers.push(fn);
                        }}

                        async waitForExclusiveRelease() {{
                            while (this.isExclusivelyLocked()) {{
                                await new Promise(resolve => this.onNextExclusiveRelease(resolve));
                            }}
                        }}

                        #getSuspendedTaskMeta(taskID) {{
                            return this.#suspendedTasksByTaskID.get(taskID);
                        }}

                        #removeSuspendedTaskMeta(taskID) {{
                            {debug_log_fn}('[{component_async_state_class}#removeSuspendedTaskMeta()] removing suspended task', {{
                                taskID,
                                componentIdx: this.#componentIdx,
                            }});
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
                            const componentIdx = task.componentIdx();
                            {debug_log_fn}('[{component_async_state_class}#suspendTask()]', {{
                                taskID,
                                componentIdx: this.#componentIdx,
                                taskEntryFnName: task.entryFnName(),
                                subtask: task.getParentSubtask(),
                            }});

                            if (componentIdx !== this.#componentIdx) {{
                                throw new Error('assert: task component idx should match async state');
                            }}

                            if (this.#getSuspendedTaskMeta(taskID)) {{
                                throw new Error(`task [${{taskID}}] already suspended`);
                            }}

                            const {{ promise, resolve, reject }} = {promise_with_resolvers_fn}();
                            this.#addSuspendedTaskMeta({{
                                task,
                                taskID,
                                readyFn,
                                resume: () => {{
                                    {debug_log_fn}('[{component_async_state_class}] resuming suspended task', {{
                                        taskID,
                                        componentIdx: this.#componentIdx,
                                    }});
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
                                let result = this.tick();
                                while (result !== {component_async_state_class}.TickResult.DONE) {{
                                    // After resuming a task, re-tick as soon as the resumed
                                    // slice's microtask continuations have drained (timeout 0)
                                    // so queued sibling resumptions aren't charged the idle
                                    // polling interval; otherwise poll at the idle cadence.
                                    const delay = result === {component_async_state_class}.TickResult.RESUMED ? 0 : 10;
                                    await new Promise((resolve) => setTimeout(resolve, delay));
                                    result = this.tick();
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
                                    {debug_log_fn}('[{component_async_state_class}#tick()] detected task rejection, leaving early', {{ meta }});
                                    this.resumeTaskByID(taskID);
                                    return {component_async_state_class}.TickResult.RESUMED;
                                }}

                                const isReady = meta.readyFn();
                                if (!isReady) {{ continue; }}

                                {debug_log_fn}('[{component_async_state_class}#tick()] resuming task via tick', {{
                                    taskID,
                                    componentIdx: this.#componentIdx,
                                }});
                                this.resumeTaskByID(taskID);

                                // NOTE: during single-flight resumption, we should resume at most one task per
                                // tick so that the resumed slice (a microtask continuation)
                                // runs -- and its current-task register window opens and
                                // closes -- before any sibling task of this component is
                                // resumed.
                                //
                                // Resuming multiple suspended tasks in one synchronous
                                // cascade interleaves their register save/restore windows
                                // ([restoreA, restoreB, resumeA, resumeB]), re-entering wasm
                                // with the register naming the wrong task, and the
                                // 'known residual' of the JSPI current-task register
                                // fix); with concurrent task lifetimes per component this
                                // corrupts guest context-local storage.
                                return {component_async_state_class}.TickResult.RESUMED;
                            }}

                            const idle = this.#suspendedTaskIDs.filter(t => t !== null).length > 0;
                            return idle
                                ? {component_async_state_class}.TickResult.IDLE
                                : {component_async_state_class}.TickResult.DONE;
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

                        createReadableStreamEnd(args) {{
                            {debug_log_fn}('[{component_async_state_class}#createStreamEnd()] args', args);
                            const {{ tableIdx, elemMeta, hostInjectFn }} = args;

                            const {{ table: localStreamTable, componentIdx }} = {global_stream_table_map}[tableIdx];
                            if (!localStreamTable) {{
                                throw new Error(`missing global stream table lookup for table [${{tableIdx}}] while creating stream`);
                            }}
                            if (componentIdx !== this.#componentIdx) {{
                                throw new Error('component idx mismatch while creating stream');
                            }}

                            const waitable = this.createWaitable();
                            const streamEnd = new {stream_readable_end_class}({{
                                tableIdx,
                                elemMeta,
                                hostInjectFn,
                                pendingBufferMeta: {{}},
                                target: `stream read end (lowered, @init)`,
                                waitable,
                            }});

                            streamEnd.setWaitableIdx(this.handles.insert(streamEnd));
                            streamEnd.setHandle(localStreamTable.insert(streamEnd));
                            if (streamEnd.streamTableIdx() !== tableIdx) {{
                                throw new Error("unexpectedly mismatched stream table");
                            }}
                            const streamEndWaitableIdx = streamEnd.waitableIdx();
                            const streamEndHandle = streamEnd.handle();
                            waitable.setTarget(`waitable for stream read end (lowered, waitable [${{streamEndWaitableIdx}}])`);
                            streamEnd.setTarget(`stream read end (lowered, waitable [${{streamEndWaitableIdx}}])`);

                            return {{
                                waitableIdx: streamEndWaitableIdx,
                                handle: streamEndHandle,
                                streamEnd,
                            }};
                        }}

                        createStream(args) {{
                            {debug_log_fn}('[{component_async_state_class}#createStream()] args', args);
                            const {{ tableIdx, elemMeta, hostInjectFn }} = args;
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
                                elemMeta,
                                readWaitable,
                                writeWaitable,
                                hostInjectFn,
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
                                writeEnd,
                                writeEndWaitableIdx,
                                writeEndHandle,
                                readEndWaitableIdx,
                                readEndHandle,
                                readEnd,
                            }};
                        }}

                        getStreamEnd(args) {{
                            {debug_log_fn}('[{component_async_state_class}#getStreamEnd()] args', args);
                            const {{ tableIdx, streamEndHandle, streamEndWaitableIdx }} = args;
                            if (tableIdx === undefined) {{
                                throw new Error('missing table idx while getting stream end');
                            }}

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

                        createFuture(args) {{
                            {debug_log_fn}('[{component_async_state_class}#createFuture()] args', args);
                            const {{ tableIdx, elemMeta, hostInjectFn }} = args;
                            if (tableIdx === undefined) {{ throw new Error("missing table idx while adding future"); }}
                            if (elemMeta === undefined) {{ throw new Error("missing element metadata while adding future"); }}

                            const {{ table: futureTable, componentIdx }} = {global_future_table_map}[tableIdx];
                            if (!futureTable) {{
                                throw new Error(`missing global future table lookup for table [${{tableIdx}}] while creating future`);
                            }}
                            if (componentIdx !== this.#componentIdx) {{
                                throw new Error('component idx mismatch while creating future');
                            }}

                            const readWaitable = this.createWaitable();
                            const writeWaitable = this.createWaitable();

                            const future = new {internal_future_class}({{
                                tableIdx,
                                componentIdx: this.#componentIdx,
                                elemMeta,
                                readWaitable,
                                writeWaitable,
                                hostInjectFn,
                            }});
                            future.setGlobalFutureMapRep({global_future_map}.insert(future));

                            const writeEnd = future.writeEnd();
                            writeEnd.setWaitableIdx(this.handles.insert(writeEnd));
                            writeEnd.setHandle(futureTable.insert(writeEnd));
                            if (writeEnd.futureTableIdx() !== tableIdx) {{ throw new Error("unexpectedly mismatched future table"); }}

                            const writeEndWaitableIdx = writeEnd.waitableIdx();
                            const writeEndHandle = writeEnd.handle();
                            writeWaitable.setTarget(`waitable for future write end (waitable [${{writeEndWaitableIdx}}])`);
                            writeEnd.setTarget(`future write end (waitable [${{writeEndWaitableIdx}}])`);

                            const readEnd = future.readEnd();
                            readEnd.setWaitableIdx(this.handles.insert(readEnd));
                            readEnd.setHandle(futureTable.insert(readEnd));
                            if (readEnd.futureTableIdx() !== tableIdx) {{ throw new Error("unexpectedly mismatched future table"); }}

                            const readEndWaitableIdx = readEnd.waitableIdx();
                            const readEndHandle = readEnd.handle();
                            readWaitable.setTarget(`waitable for read end (waitable [${{readEndWaitableIdx}}])`);
                            readEnd.setTarget(`future read end (waitable [${{readEndWaitableIdx}}])`);

                            return {{
                                writeEnd,
                                writeEndWaitableIdx,
                                writeEndHandle,
                                readEndWaitableIdx,
                                readEndHandle,
                                readEnd,
                            }};
                        }}

                        getFutureEnd(args) {{
                            {debug_log_fn}('[{component_async_state_class}#getFutureEnd()] args', args);
                            const {{ tableIdx, futureEndHandle, futureEndWaitableIdx }} = args;
                            if (tableIdx === undefined) {{
                                throw new Error('missing table idx while getting future end');
                            }}

                            const {{ table, componentIdx }} = {global_future_table_map}[tableIdx];
                            const cstate = {get_or_create_async_state_fn}(componentIdx);

                            let futureEnd;
                            if (futureEndWaitableIdx !== undefined) {{
                                futureEnd = cstate.handles.get(futureEndWaitableIdx);
                            }} else if (futureEndHandle !== undefined) {{
                                if (!table) {{ throw new Error(`missing/invalid table [${{tableIdx}}] while getting future end`); }}
                                futureEnd = table.get(futureEndHandle);
                            }} else {{
                                throw new TypeError("must specify either waitable idx or handle to retrieve future");
                            }}

                            if (!futureEnd) {{
                                throw new Error(`missing future end (tableIdx [${{tableIdx}}], handle [${{futureEndHandle}}], waitableIdx [${{futureEndWaitableIdx}}])`);
                            }}
                            if (tableIdx && futureEnd.futureTableIdx() !== tableIdx) {{
                                throw new Error(`future end table idx [${{futureEnd.futureTableIdx()}}] does not match [${{tableIdx}}]`);
                            }}

                            return futureEnd;
                        }}

                        addFutureEndToTable(args) {{
                            {debug_log_fn}('[{component_async_state_class}#addFutureEndToTable()] args', args);
                            const {{ tableIdx, futureEnd }} = args;
                            if (typeof futureEnd === 'number') {{ throw new Error("INSERTING BAD FUTUREEND"); }}

                            let {{ table, componentIdx }} = {global_future_table_map}[tableIdx];
                            if (componentIdx === undefined || !table) {{
                                throw new Error(`invalid global future table state for table [${{tableIdx}}]`);
                            }}

                            const handle = table.insert(futureEnd);
                            futureEnd.setHandle(handle);
                            futureEnd.setFutureTableIdx(tableIdx);

                            const cstate = {get_or_create_async_state_fn}(componentIdx);
                            const waitableIdx = cstate.handles.insert(futureEnd);
                            futureEnd.setWaitableIdx(waitableIdx);

                            {debug_log_fn}('[{component_async_state_class}#addFutureEndToTable()] added future end', {{
                                tableIdx,
                                table,
                                handle,
                                futureEnd,
                                destComponentIdx: componentIdx,
                            }});

                            return {{ handle, waitableIdx }};
                        }}

                        removeFutureEndFromTable(args) {{
                            {debug_log_fn}('[{component_async_state_class}#removeFutureEndFromTable()] args', args);
                            const {{ tableIdx, futureWaitableIdx }} = args;
                            if (tableIdx === undefined) {{ throw new Error("missing table idx while removing future end"); }}
                            if (futureWaitableIdx === undefined) {{
                                throw new Error("missing future end waitable idx while removing future end");
                            }}

                            const {{ table, componentIdx }} = {global_future_table_map}[tableIdx];
                            if (!table) {{ throw new Error(`missing/invalid table [${{tableIdx}}] while removing future end`); }}

                            const cstate = {get_or_create_async_state_fn}(componentIdx);

                            const futureEnd = cstate.handles.get(futureWaitableIdx);
                            if (!futureEnd) {{
                                throw new Error(`missing future end (handle [${{futureWaitableIdx}}], table [${{tableIdx}}])`);
                            }}
                            const handle = futureEnd.handle();

                            let removed = cstate.handles.remove(futureWaitableIdx);
                            if (!removed) {{
                                throw new Error(`failed to remove futureEnd from handles (waitable idx [${{futureWaitableIdx}}]), component [${{componentIdx}}])`);
                            }}

                            removed = table.remove(handle);
                            if (!removed) {{
                                throw new Error(`failed to remove futureEnd from table (handle [${{handle}}]), table [${{tableIdx}}], component [${{componentIdx}}])`);
                            }}

                            return futureEnd;
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
