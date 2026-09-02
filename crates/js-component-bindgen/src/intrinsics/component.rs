//! Intrinsics that represent helpers that manage per-component state

use std::fmt::Write as _;

use crate::intrinsics::p3::waitable::WaitableIntrinsic;
use crate::intrinsics::{Intrinsic, RenderIntrinsicsArgs};
use crate::source::Source;
use crate::uwriteln;
use wasmtime_environ::Trap;

/// This enum contains intrinsics that manage per-component state
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ComponentIntrinsic {
    /// Global that stores the canonical ABI `may_leave` global by component instance.
    GlobalInstanceFlagsMap,

    /// Shared trap state for all component instances in this generated store.
    GlobalStoreTrap,

    /// Shared scheduling state for all component instances in this generated store.
    GlobalStoreAsyncState,

    /// Schedule a store-wide deadlock check after queued guest work has drained.
    CheckForDeadlock,

    /// Track a possibly asynchronous host operation as an external wake source.
    TrackHostOperation,

    /// Normalize engine-specific core WebAssembly trap messages.
    NormalizeCoreTrap,

    /// Trap if the specified component instance may not currently leave.
    CheckMayLeave,

    /// Wrap a non-suspending canonical ABI trampoline with a `may_leave` check.
    GuardMayLeave,

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
    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        []
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::GlobalInstanceFlagsMap => "INSTANCE_FLAGS",
            Self::GlobalStoreTrap => "STORE_TRAP",
            Self::GlobalStoreAsyncState => "STORE_ASYNC_STATE",
            Self::CheckForDeadlock => "_checkForDeadlock",
            Self::TrackHostOperation => "_trackHostOperation",
            Self::NormalizeCoreTrap => "_normalizeCoreTrap",
            Self::CheckMayLeave => "_checkMayLeave",
            Self::GuardMayLeave => "_guardMayLeave",
            Self::GlobalAsyncStateMap => "ASYNC_STATE",
            Self::GetOrCreateAsyncState => "getOrCreateAsyncState",
            Self::BackpressureInc => "backpressureInc",
            Self::BackpressureDec => "backpressureDec",
            Self::ComponentAsyncStateClass => "ComponentAsyncState",
            Self::ComponentStateSetAllError => "_ComponentStateSetAllError",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source, render_args: &RenderIntrinsicsArgs<'_>) {
        match self {
            Self::GlobalInstanceFlagsMap => {
                let var_name = render_args.require_intrinsic(Self::GlobalInstanceFlagsMap);
                uwriteln!(output, r#"const {var_name} = new Map();"#);
            }

            Self::GlobalStoreTrap => {
                let var_name = render_args.require_intrinsic(Self::GlobalStoreTrap);
                uwriteln!(output, r#"const {var_name} = {{ error: null }};"#);
            }

            Self::GlobalStoreAsyncState => {
                let var_name = render_args.require_intrinsic(Self::GlobalStoreAsyncState);
                uwriteln!(
                    output,
                    r#"const {var_name} = {{ deadlockCheck: null, pendingHostOperations: 0 }};"#
                );
            }

            Self::CheckForDeadlock => {
                let check_for_deadlock_fn = render_args.require_intrinsic(Self::CheckForDeadlock);
                let async_state_map = render_args.require_intrinsic(Self::GlobalAsyncStateMap);
                let store_async_state = render_args.require_intrinsic(Self::GlobalStoreAsyncState);
                let store_trap = render_args.require_intrinsic(Self::GlobalStoreTrap);
                let runtime_error_class =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                output.push_str(&format!(
                    r#"
                    function {check_for_deadlock_fn}() {{
                        if ({store_async_state}.deadlockCheck !== null || {store_trap}.error !== null) {{ return; }}
                        {store_async_state}.deadlockCheck = setTimeout(() => {{
                            {store_async_state}.deadlockCheck = null;
                            if ({store_trap}.error !== null || {store_async_state}.pendingHostOperations > 0) {{ return; }}

                            const suspendedTasks = new Set();
                            for (const state of {async_state_map}.values()) {{
                                if (state.hasPendingSchedulerWork()) {{
                                    state.runTickLoop();
                                    return;
                                }}
                                for (const meta of state.suspendedTaskMetas()) {{
                                    suspendedTasks.add(meta.task);
                                }}
                            }}

                            const unresolvedRoots = new Set();
                            for (const task of suspendedTasks) {{
                                const root = task.getRootTask();
                                if (!root.isResolvedState()) {{ unresolvedRoots.add(root); }}
                            }}
                            if (unresolvedRoots.size === 0) {{ return; }}

                            const err = new {runtime_error_class}('wasm trap: deadlock detected: event loop cannot make further progress');
                            {store_trap}.error = err;
                            for (const root of unresolvedRoots) {{
                                root.setErrored(err);
                                root.reject(err);
                            }}
                            for (const task of suspendedTasks) {{
                                if (!task.isResolvedState() && unresolvedRoots.has(task.getRootTask())) {{
                                    task.setErrored(err);
                                    task.reject(err);
                                }}
                            }}
                            for (const state of {async_state_map}.values()) {{ state.runTickLoop(); }}
                        }}, 0);
                    }}
                    "#,
                ));
            }

            Self::TrackHostOperation => {
                let track_host_operation_fn =
                    render_args.require_intrinsic(Self::TrackHostOperation);
                let check_for_deadlock_fn = render_args.require_intrinsic(Self::CheckForDeadlock);
                let async_state_map = render_args.require_intrinsic(Self::GlobalAsyncStateMap);
                let store_async_state = render_args.require_intrinsic(Self::GlobalStoreAsyncState);
                output.push_str(&format!(
                    r#"
                    function {track_host_operation_fn}(operation) {{
                        const result = operation();
                        if (result === null ||
                            (typeof result !== 'object' && typeof result !== 'function') ||
                            typeof result.then !== 'function') {{
                            return result;
                        }}

                        {store_async_state}.pendingHostOperations++;
                        return Promise.resolve(result).finally(() => {{
                            {store_async_state}.pendingHostOperations--;
                            if ({store_async_state}.pendingHostOperations < 0) {{
                                throw new Error('negative pending host operation count');
                            }}
                            for (const state of {async_state_map}.values()) {{ state.runTickLoop(); }}
                            {check_for_deadlock_fn}();
                        }});
                    }}
                    "#,
                ));
            }

            Self::NormalizeCoreTrap => {
                let normalize_core_trap_fn = render_args.require_intrinsic(Self::NormalizeCoreTrap);
                let runtime_error_class =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                let unreachable = Trap::UnreachableCodeReached.to_string();
                let memory_oob = Trap::MemoryOutOfBounds.to_string();
                let integer_division_by_zero = Trap::IntegerDivisionByZero.to_string();
                let integer_overflow = Trap::IntegerOverflow.to_string();
                let bad_conversion = Trap::BadConversionToInteger.to_string();
                let table_oob = Trap::TableOutOfBounds.to_string();
                let bad_signature = Trap::BadSignature.to_string();
                let stack_overflow = Trap::StackOverflow.to_string();
                output.push_str(&format!(
                    r#"
                    const CORE_TRAP_MESSAGES = new Map([
                        ['unreachable', {unreachable:?}],
                        ['memory access out of bounds', {memory_oob:?}],
                        ['divide by zero', {integer_division_by_zero:?}],
                        ['remainder by zero', {integer_division_by_zero:?}],
                        ['divide result unrepresentable', {integer_overflow:?}],
                        ['float unrepresentable in integer range', {bad_conversion:?}],
                        ['table index is out of bounds', {table_oob:?}],
                        ['function signature mismatch', {bad_signature:?}],
                        ['call stack exhausted', {stack_overflow:?}],
                    ]);
                    function {normalize_core_trap_fn}(err) {{
                        if (!(err instanceof {runtime_error_class})) {{ return err; }}
                        const message = CORE_TRAP_MESSAGES.get(err.message);
                        if (message !== undefined) {{ err.message = message; }}
                        return err;
                    }}
                    "#,
                ));
            }

            Self::CheckMayLeave => {
                let check_may_leave_fn = render_args.require_intrinsic(Self::CheckMayLeave);
                let instance_flags = render_args.require_intrinsic(Self::GlobalInstanceFlagsMap);
                let runtime_error_class =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                output.push_str(&format!(
                    r#"
                    function {check_may_leave_fn}(componentIdx) {{
                        if ({instance_flags}.get(componentIdx)?.value !== 1) {{
                            throw new {runtime_error_class}('cannot leave component instance');
                        }}
                    }}
                    "#,
                ));
            }

            Self::GuardMayLeave => {
                let guard_may_leave_fn = render_args.require_intrinsic(Self::GuardMayLeave);
                let check_may_leave_fn = render_args.require_intrinsic(Self::CheckMayLeave);
                output.push_str(&format!(
                    r#"
                    function {guard_may_leave_fn}(componentIdx, fn) {{
                        return function (...args) {{
                            {check_may_leave_fn}(componentIdx);
                            return fn.apply(this, args);
                        }};
                    }}
                    "#,
                ));
            }

            Self::GlobalAsyncStateMap => {
                let var_name = render_args.require_intrinsic(Self::GlobalAsyncStateMap);
                uwriteln!(output, r#"const {var_name} = new Map();"#);
            }

            Self::BackpressureInc => {
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let backpressure_inc_fn = render_args.require_intrinsic(Self::BackpressureInc);
                let get_or_create_async_state_fn =
                    render_args.require_intrinsic(Self::GetOrCreateAsyncState);
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
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let backpressure_dec_fn = render_args.require_intrinsic(Self::BackpressureDec);
                let get_or_create_async_state_fn =
                    render_args.require_intrinsic(Self::GetOrCreateAsyncState);
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
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let rep_table_class = render_args.require_intrinsic(Intrinsic::RepTableClass);
                let waitable_class =
                    render_args.require_intrinsic(WaitableIntrinsic::WaitableClass);
                let promise_with_resolvers_fn =
                    render_args.require_intrinsic(Intrinsic::PromiseWithResolversPonyfill);
                let runtime_error_class =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                let normalize_core_trap_fn = render_args.require_intrinsic(Self::NormalizeCoreTrap);
                let instance_flags = render_args.require_intrinsic(Self::GlobalInstanceFlagsMap);
                let store_trap = render_args.require_intrinsic(Self::GlobalStoreTrap);
                let check_for_deadlock_fn = render_args.require_intrinsic(Self::CheckForDeadlock);
                let cannot_enter_component = Trap::CannotEnterComponent.to_string();

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
                        #trapped = false;
                        #backpressure = 0;
                        #backpressureWaiters = 0n;

                        #handlerMap = new Map();
                        #nextHandlerID = 0n;

                        #tickLoop = null;
                        #tickLoopInterval = null;

                        #onExclusiveReleaseHandlers = [];

                        #mayLeave = true;

                        handles;
                        subtasks;

                        constructor(args) {{
                            this.#componentIdx = args.componentIdx;
                            this.handles = new {rep_table_class}({{ target: `component [${{this.#componentIdx}}] handles (waitable objects)` }});
                            this.subtasks = new {rep_table_class}({{ target: `component [${{this.#componentIdx}}] subtasks` }});
                        }};

                        componentIdx() {{ return this.#componentIdx; }}

                        get mayLeave() {{
                            const flags = {instance_flags}.get(this.#componentIdx);
                            return flags === undefined ? this.#mayLeave : flags.value === 1;
                        }}
                        set mayLeave(value) {{
                            if (typeof value !== 'boolean') {{ throw new TypeError('mayLeave must be a boolean'); }}
                            this.#mayLeave = value;
                            const flags = {instance_flags}.get(this.#componentIdx);
                            if (flags !== undefined) {{ flags.value = value ? 1 : 0; }}
                        }}

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

                        markTrapped(err) {{
                            if (!(err instanceof {runtime_error_class})) {{
                                return false;
                            }}
                            err = {normalize_core_trap_fn}(err);
                            this.#trapped = true;
                            {debug_log_fn}('[{component_async_state_class}#markTrapped()] component trapped', {{ err, componentIdx: this.#componentIdx }});
                            if ({store_trap}.error === null) {{ {store_trap}.error = err; }}
                            return true;
                        }}

                        throwIfTrapped() {{
                            if (this.#trapped) {{
                                throw new {runtime_error_class}({cannot_enter_component:?});
                            }}
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

                            // A caller synchronously driving one task quantum (for
                            // example, subtask.cancel) waits for the resumed task to
                            // either resolve or suspend again.
                            task.notifyProgress();

                            this.runTickLoop();
                            {check_for_deadlock_fn}();

                            return promise;
                        }}

                        resumeTaskByID(taskID) {{
                            const meta = this.#removeSuspendedTaskMeta(taskID);
                            if (!meta) {{ return false; }}
                            if (meta.taskID !== taskID) {{ throw new Error('task ID does not match'); }}
                            meta.resume();
                            return true;
                        }}

                        suspendedTaskReady(taskID) {{
                            const meta = this.#getSuspendedTaskMeta(taskID);
                            if (!meta) {{ return false; }}
                            if (!meta.readyFn) {{
                                throw new Error(`suspended task [${{taskID}}] is missing a readiness function`);
                            }}
                            return meta.task.isRejected() || meta.readyFn();
                        }}

                        suspendedTaskMetas() {{
                            return this.#suspendedTasksByTaskID.values();
                        }}

                        hasPendingSchedulerWork() {{
                            if (this.#lockHandoffScheduled) {{ return true; }}
                            for (const meta of this.#suspendedTasksByTaskID.values()) {{
                                if (meta.task.isRejected() || meta.readyFn()) {{ return true; }}
                            }}
                            return false;
                        }}

                        async runTickLoop() {{
                            if (this.#tickLoop !== null) {{ return; }}
                            this.#tickLoop = 1;
                            setTimeout(async () => {{
                                let result = this.tick();
                                while (result !== {component_async_state_class}.TickResult.DONE) {{
                                    if (result === {component_async_state_class}.TickResult.IDLE) {{
                                        {check_for_deadlock_fn}();
                                    }}
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

                        createWaitable(args) {{
                            return new {waitable_class}({{ target: args?.target, }});
                        }}
                    }}
                    "#,
                ));
            }

            Self::GetOrCreateAsyncState => {
                let get_state_fn = render_args.require_intrinsic(Self::GetOrCreateAsyncState);
                let async_state_map = render_args.require_intrinsic(Self::GlobalAsyncStateMap);
                let component_async_state_class =
                    render_args.require_intrinsic(Self::ComponentAsyncStateClass);
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
                let debug_log_fn = render_args.require_intrinsic(Intrinsic::DebugLog);
                let async_state_map = render_args.require_intrinsic(Self::GlobalAsyncStateMap);
                let component_state_set_all_error_fn =
                    render_args.require_intrinsic(Self::ComponentStateSetAllError);
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
