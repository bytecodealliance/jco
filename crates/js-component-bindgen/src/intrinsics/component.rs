//! Intrinsics that represent helpers that manage per-component state

use std::fmt::Write as _;

use crate::intrinsics::p3::async_future::AsyncFutureIntrinsic;
use crate::intrinsics::p3::async_stream::AsyncStreamIntrinsic;
use crate::intrinsics::p3::async_task::AsyncTaskIntrinsic;
use crate::intrinsics::p3::waitable::WaitableIntrinsic;
use crate::intrinsics::resource::ResourceIntrinsic;
use crate::intrinsics::{Intrinsic, RenderIntrinsicsArgs};
use crate::source::Source;
use crate::uwriteln;
use wasmtime_environ::Trap;

/// The function that traps a store which cannot make progress, rendered with
/// [`ComponentIntrinsic::CheckSyncCallBlocked`].
const TRAP_BLOCKED_STORE_FN: &str = "_trapBlockedStore";

/// This enum contains intrinsics that manage per-component state
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ComponentIntrinsic {
    /// Global that stores the canonical ABI `may_leave` global by component instance.
    GlobalInstanceFlagsMap,

    /// Shared trap state for all component instances in this generated store.
    GlobalStoreTrap,

    /// Permanently stop this generated store and release its host resources.
    StopInstance,

    /// A promise settled once no guest task is left in this generated store, counting
    /// a task until it has exited, however long after returning; or once it has stopped
    /// or trapped, as nothing more will run.
    ///
    /// ```ts
    /// function _whenIdle(): Promise<void>;
    /// ```
    WhenIdle,

    /// Settles what [`Self::WhenIdle`] gave out, if that time has come.
    CheckIdle,

    /// Optional host invocation handles, independent of runtime provider state.
    CallTracking,

    /// Tells the host of a trap, once however many paths it unwinds through
    ///
    /// ```ts
    /// function _reportTrap(err: Error);
    /// ```
    ReportTrap,

    /// Shared scheduling state for all component instances in this generated store.
    GlobalStoreAsyncState,

    /// Schedule a store-wide deadlock check after queued guest work has drained.
    CheckForDeadlock,

    /// Trap a call of a non-async-typed function that blocked with no thread to switch to.
    ///
    /// ```ts
    /// function _checkSyncCallBlocked(): boolean;
    /// ```
    CheckSyncCallBlocked,

    /// Track a possibly asynchronous host operation as an external wake source.
    TrackHostOperation,

    /// Normalize engine-specific core WebAssembly trap messages.
    NormalizeCoreTrap,

    /// Convert failed post-return cleanup into a trap of its component.
    PostReturnTrap,

    /// Guard the synchronous post-return imports of fused adapters.
    GuardPostReturn,

    /// Trap if the specified component instance may not currently leave.
    CheckMayLeave,

    /// Wrap a non-suspending canonical ABI trampoline with a `may_leave` check.
    GuardMayLeave,

    /// Record a `WebAssembly.RuntimeError` as the store's trap, synchronously at the throw site
    RecordTrap,

    /// Wrap a non-suspending canonical ABI trampoline so that a trap it throws is recorded
    /// before it propagates (nothing in the store may run after a trap)
    GuardTrap,

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
    /// Implements `canon backpressure.inc`.
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
    /// Implements `canon backpressure.dec`.
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
        [
            "_postReturnTrap",
            "_guardPostReturn",
            "_stopInstance",
            "_reportTrap",
            "_whenIdle",
            "_checkIdle",
            "_isIdle",
            TRAP_BLOCKED_STORE_FN,
            "CALL_TRACKING",
            // Reserved so that an export named e.g. `backpressure-inc` is not
            // bound as a local that shadows the intrinsic its trampolines call.
            Self::GetOrCreateAsyncState.name(),
            Self::BackpressureInc.name(),
            Self::BackpressureDec.name(),
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::GlobalInstanceFlagsMap => "INSTANCE_FLAGS",
            Self::GlobalStoreTrap => "STORE_TRAP",
            Self::StopInstance => "_stopInstance",
            Self::ReportTrap => "_reportTrap",
            Self::WhenIdle => "_whenIdle",
            Self::CheckIdle => "_checkIdle",
            Self::CallTracking => "CALL_TRACKING",
            Self::GlobalStoreAsyncState => "STORE_ASYNC_STATE",
            Self::CheckForDeadlock => "_checkForDeadlock",
            Self::CheckSyncCallBlocked => "_checkSyncCallBlocked",
            Self::TrackHostOperation => "_trackHostOperation",
            Self::NormalizeCoreTrap => "_normalizeCoreTrap",
            Self::PostReturnTrap => "_postReturnTrap",
            Self::GuardPostReturn => "_guardPostReturn",
            Self::CheckMayLeave => "_checkMayLeave",
            Self::GuardMayLeave => "_guardMayLeave",
            Self::RecordTrap => "_recordTrap",
            Self::GuardTrap => "_guardTrap",
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
                let on_trap = if render_args.instantiation_occurred {
                    "options?.onTrap ?? null"
                } else {
                    "null"
                };
                uwriteln!(
                    output,
                    r#"const {var_name} = {{ error: null, stopped: false, resourceTables: [], stopWaiters: new Set(), disposed: new WeakSet(), onTrap: {on_trap}, trapsReported: new WeakSet() }};"#
                );
            }

            Self::WhenIdle => {
                let when_idle_fn = render_args.require_intrinsic(Self::WhenIdle);
                render_args.require_intrinsic(Self::CheckIdle);
                let scheduler = render_args.require_intrinsic(Self::GlobalStoreAsyncState);
                output.push_str(&format!(
                    r#"
                    function {when_idle_fn}() {{
                        if (_isIdle()) {{ return Promise.resolve(); }}
                        return new Promise((resolve) => {{ {scheduler}.idleWaiters.add(resolve); }});
                    }}
                    "#
                ));
            }

            Self::CallTracking => {
                let runtime_error =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                let store = render_args.require_intrinsic(Self::GlobalStoreTrap);
                let tasks =
                    render_args.require_intrinsic(AsyncTaskIntrinsic::GlobalAsyncCurrentTaskMap);
                output.push_str(
                    &include_str!("call_tracking.js")
                        .replace("$STORE", store)
                        .replace("$TASKS", tasks)
                        .replace("$RUNTIME_ERROR", runtime_error),
                );
            }

            Self::CheckIdle => {
                let check_idle_fn = render_args.require_intrinsic(Self::CheckIdle);
                let store = render_args.require_intrinsic(Self::GlobalStoreTrap);
                let scheduler = render_args.require_intrinsic(Self::GlobalStoreAsyncState);
                let tasks =
                    render_args.require_intrinsic(AsyncTaskIntrinsic::GlobalAsyncCurrentTaskMap);
                let check_calls = if render_args.call_tracking {
                    let tracking = render_args.require_intrinsic(Self::CallTracking);
                    format!("{tracking}.check();")
                } else {
                    String::new()
                };
                // (host tasks, under -1, stand for a host's own work, not a guest's)
                output.push_str(&format!(
                    r#"
                    function _isIdle() {{
                        if ({store}.error !== null) {{ return true; }}
                        for (const [componentIdx, metas] of {tasks}) {{
                            if (componentIdx !== -1 && metas.length > 0) {{ return false; }}
                        }}
                        return true;
                    }}
                    function {check_idle_fn}() {{
                        {check_calls}
                        if ({scheduler}.idleWaiters.size === 0 || !_isIdle()) {{ return; }}
                        const waiters = [...{scheduler}.idleWaiters];
                        {scheduler}.idleWaiters.clear();
                        for (const resolve of waiters) {{ resolve(); }}
                    }}
                    "#
                ));
            }

            Self::ReportTrap => {
                let report_trap_fn = render_args.require_intrinsic(Self::ReportTrap);
                let store = render_args.require_intrinsic(Self::GlobalStoreTrap);
                let normalize_core_trap =
                    render_args.intrinsic_call(Self::NormalizeCoreTrap, "err");
                let runtime_error_class =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                output.push_str(&format!(
                    r#"
                    function {report_trap_fn}(err) {{
                        // Stopping an instance goes through the same path as a trap
                        if ({store}.onTrap === null || {store}.stopped) {{ return; }}
                        if (!(err instanceof {runtime_error_class}) || {store}.trapsReported.has(err)) {{ return; }}
                        {store}.trapsReported.add(err);
                        err = {normalize_core_trap};
                        // Not the runtime's to handle, whose own unwinding is under way
                        try {{ {store}.onTrap(err); }} catch (e) {{ queueMicrotask(() => {{ throw e; }}); }}
                    }}
                    "#
                ));
            }

            Self::StopInstance => {
                let name = self.name();
                let store = render_args.require_intrinsic(Self::GlobalStoreTrap);
                let states = render_args.require_intrinsic(Self::GlobalAsyncStateMap);
                let scheduler = render_args.require_intrinsic(Self::GlobalStoreAsyncState);
                let tasks =
                    render_args.require_intrinsic(AsyncTaskIntrinsic::GlobalAsyncCurrentTaskMap);
                let runtime_error =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                let dispose = render_args.require_intrinsic(Intrinsic::SymbolDispose);
                let own = render_args.require_intrinsic(ResourceIntrinsic::ResourceTableOwnFlag);
                let flag = render_args.require_intrinsic(ResourceIntrinsic::ResourceTableFlag);
                let streams = render_args.require_intrinsic(AsyncStreamIntrinsic::GlobalStreamMap);
                let futures = render_args.require_intrinsic(AsyncFutureIntrinsic::GlobalFutureMap);
                let rep_table = render_args.require_intrinsic(Intrinsic::RepTableClass);
                uwriteln!(
                    output,
                    r#"
                    function {name}() {{
                        if ({store}.stopped) {{ return; }}
                        {store}.stopped = true;
                        const err = new {runtime_error}('component instance has been stopped');
                        {store}.error ??= err;
                        clearTimeout({scheduler}.deadlockCheck);
                        {scheduler}.deadlockCheck = null;

                        // Poison every component before releasing any continuation or
                        // calling host cleanup, which can reenter the instance.
                        for (const state of {states}.values()) {{ state.markTrapped(err); }}
                        for (const reject of {store}.stopWaiters) {{ reject(err); }}
                        {store}.stopWaiters.clear();
                        const pending = [...{tasks}.values()].flat().map(meta => meta.task);
                        for (const task of pending) {{ task.stop(err); }}
                        for (const state of {states}.values()) {{ state.stop(); }}

                        // Both ends of every stream and future, whichever side either end is on.
                        const errors = [];
                        for (const channels of [{streams}, {futures}]) {{
                            // data() is part of both inline and external table contracts.
                            for (let i = 2, data = channels.data(); i < data.length; i += 2) {{
                                const channel = data[i];
                                if (channel === undefined || channel === {rep_table}.FREE) {{ continue; }}
                                // (what a host has lifted is only a view of one of these)
                                try {{ channel.onInstanceStop?.(); }} catch (e) {{ errors.push(e); }}
                            }}
                        }}

                        // A capture table also contains borrowed resources. Only live
                        // owned handles belong to the guest; lifting an own back to the
                        // host removes its capture. Shared tables/reps are deduplicated.
                        const resources = new Set();
                        for (const {{ handles, captures }} of {store}.resourceTables) {{
                            for (let i = 2; i < handles.length; i += 2) {{
                                if ((handles[i] & {flag}) !== 0 || !(handles[i + 1] >= {own})) {{ continue; }}
                                const resource = captures.get(handles[i + 1] - {own});
                                if (resource !== undefined) {{ resources.add(resource); }}
                            }}
                        }}
                        for (const {{ captures }} of {store}.resourceTables) {{ captures.clear(); }}
                        {store}.resourceTables.length = 0;
                        for (const resource of resources) {{
                            // A guest holding it twice may have dropped the other handle.
                            if ({store}.disposed.has(resource)) {{ continue; }}
                            try {{ resource[{dispose}]?.(); }}
                            catch (error) {{ errors.push(error); }}
                        }}
                        if (errors.length) {{ throw new AggregateError(errors, 'failed to dispose stopped instance resources'); }}
                    }}
                "#
                );
            }

            Self::GlobalStoreAsyncState => {
                let var_name = render_args.require_intrinsic(Self::GlobalStoreAsyncState);
                uwriteln!(
                    output,
                    r#"const {var_name} = {{ deadlockCheck: null, pendingHostOperations: 0, hostOperationsByComponent: null, idleWaiters: new Set(), syncCalls: [], heldResumptions: [] }};"#
                );
            }

            Self::CheckForDeadlock => {
                let check_for_deadlock_fn = render_args.require_intrinsic(Self::CheckForDeadlock);
                let check_sync_call_blocked_fn =
                    render_args.require_intrinsic(Self::CheckSyncCallBlocked);
                let trap_blocked_store_fn = TRAP_BLOCKED_STORE_FN;
                let async_state_map = render_args.require_intrinsic(Self::GlobalAsyncStateMap);
                let store_async_state = render_args.require_intrinsic(Self::GlobalStoreAsyncState);
                let store_trap = render_args.require_intrinsic(Self::GlobalStoreTrap);
                output.push_str(&format!(
                    r#"
                    function {check_for_deadlock_fn}() {{
                        if ({store_async_state}.deadlockCheck !== null || {store_trap}.error !== null) {{ return; }}
                        {store_async_state}.deadlockCheck = setTimeout(() => {{
                            {store_async_state}.deadlockCheck = null;
                            if ({store_trap}.error !== null) {{ return; }}
                            // A call of a non-async-typed function decides for itself whether it
                            // can go on: host work of the instances it holds back cannot help it.
                            const syncCall = {store_async_state}.syncCalls.at(-1);
                            if (syncCall !== undefined && !syncCall.task.isResolvedState() && !syncCall.task.isRejected()) {{
                                {check_sync_call_blocked_fn}();
                                return;
                            }}
                            if ({store_async_state}.pendingHostOperations > 0) {{ return; }}
                            for (const state of {async_state_map}.values()) {{
                                if (state.hasPendingSchedulerWork()) {{
                                    state.runTickLoop();
                                    return;
                                }}
                            }}
                            {trap_blocked_store_fn}(undefined);
                        }}, 0);
                    }}
                    "#,
                ));
            }

            Self::CheckSyncCallBlocked => {
                let check_sync_call_blocked_fn =
                    render_args.require_intrinsic(Self::CheckSyncCallBlocked);
                let trap_blocked_store_fn = TRAP_BLOCKED_STORE_FN;
                let async_state_map = render_args.require_intrinsic(Self::GlobalAsyncStateMap);
                let store_async_state = render_args.require_intrinsic(Self::GlobalStoreAsyncState);
                let store_trap = render_args.require_intrinsic(Self::GlobalStoreTrap);
                let runtime_error_class =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                output.push_str(&format!(
                    r#"
                    // Trap a call of a non-async-typed function that can no longer go on.
                    //
                    // In the Canonical ABI (`canon_lift`, `not ft.async_`), whenever a thread of
                    // such a call blocks or exits without switching to another thread, the call
                    // resumes a ready thread of its instance, and traps if there is none. The
                    // decision is taken where the thread blocks, so this runs as each thread
                    // within the call blocks or exits, and when the deadlock check runs.
                    //
                    // The call goes on while a thread of its instance is ready; while a stack
                    // within the call has not blocked (it is running, about to resume, or in a
                    // host call, where the host is still running on it); or while host work its
                    // instance started is pending, which may make one of its threads ready.
                    // Threads of other instances are never candidates.
                    function {check_sync_call_blocked_fn}() {{
                        if ({store_trap}.error !== null || {store_trap}.stopped) {{ return false; }}
                        const call = {store_async_state}.syncCalls.at(-1);
                        if (call === undefined || call.task.isResolvedState() || call.task.isRejected()) {{ return false; }}
                        const hostOperations = {store_async_state}.hostOperationsByComponent;
                        // (host work of an unknown instance may be the call's)
                        if (hostOperations?.has(call.componentIdx) || hostOperations?.has(-1)) {{
                            return false;
                        }}
                        for (const state of {async_state_map}.values()) {{
                            if (state.componentIdx() === call.componentIdx && state.hasSyncCallCandidate()) {{ return false; }}
                            if (state.hasRunningStackWithin(call)) {{ return false; }}
                        }}
                        {trap_blocked_store_fn}(call);
                        return true;
                    }}

                    // Trap the store because it cannot make progress, failing every unresolved
                    // task that waits. `syncCall` is the call of a non-async-typed function that
                    // blocked, when that is why the store cannot make progress.
                    function {trap_blocked_store_fn}(syncCall) {{
                        const suspendedTasks = new Set();
                        for (const state of {async_state_map}.values()) {{
                            for (const meta of state.suspendedTaskMetas()) {{
                                suspendedTasks.add(meta.task);
                            }}
                        }}

                        const unresolvedRoots = new Set();
                        for (const task of suspendedTasks) {{
                            const root = task.getRootTask();
                            if (!root.isResolvedState()) {{ unresolvedRoots.add(root); }}
                        }}
                        // A task whose threads have all exited unresolved is not pending work:
                        // it can never run again. Whoever waits on it is blocked for good.
                        const exitedTasks = new Set();
                        for (const state of {async_state_map}.values()) {{
                            for (const task of state.unresolvedExitedTasks()) {{
                                exitedTasks.add(task);
                                unresolvedRoots.add(task.getRootTask());
                            }}
                        }}

                        // With a call of a non-async-typed function in progress, nothing but
                        // its instance's threads may run until it returns, so running out of
                        // ready threads is that call blocking with none to switch to (Canonical
                        // ABI `canon_lift`), rather than a deadlock of the event loop.
                        if (syncCall !== undefined) {{
                            unresolvedRoots.add(syncCall.task.getRootTask());
                        }}
                        if (unresolvedRoots.size === 0) {{ return; }}

                        const err = new {runtime_error_class}(
                            syncCall === undefined
                                ? 'wasm trap: deadlock detected: event loop cannot make further progress'
                                : 'cannot block a synchronous task before returning'
                        );
                        // Which tasks were waiting, and on whose behalf. The message stays
                        // exactly what the Canonical ABI calls for, so this rides alongside
                        // it: a deadlock reported from a real program is otherwise a bare
                        // sentence, and the state that produced it is gone by the time
                        // anyone reads the failure.
                        const describeTask = (task) => ({{
                            taskID: task.id(),
                            componentIdx: task.componentIdx(),
                            state: task.taskState(),
                            rootTaskID: task.getRootTask().id(),
                        }});
                        err.deadlockDetail = {{
                            pendingHostOperations: {store_async_state}.pendingHostOperations,
                            suspendedTasks: [...suspendedTasks].map(describeTask),
                            // (a task whose threads all exited unresolved is often what the
                            // others wait on)
                            exitedTasks: [...exitedTasks].map(describeTask),
                            unresolvedRootTaskIDs: [...unresolvedRoots].map((root) => root.id()),
                        }};
                        {store_trap}.error = err;
                        for (const root of unresolvedRoots) {{
                            root.setErrored(err);
                            root.reject(err);
                        }}
                        // Exited tasks are rejected too: a synchronous caller waits on the
                        // callee task itself, not on its own root.
                        for (const task of [...suspendedTasks, ...exitedTasks]) {{
                            if (!task.isResolvedState() && unresolvedRoots.has(task.getRootTask())) {{
                                task.setErrored(err);
                                task.reject(err);
                            }}
                        }}
                        // A deadlock is a trap of the whole store: no instance may be entered again.
                        for (const state of {async_state_map}.values()) {{ state.markTrapped(err); }}
                        for (const state of {async_state_map}.values()) {{
                            state.abandonLockWaiters();
                            state.abandonEntrySlotWaiters();
                        }}
                        for (const state of {async_state_map}.values()) {{ state.runTickLoop(); }}
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
                let symbol_dispose = render_args.require_intrinsic(Intrinsic::SymbolDispose);
                let store = render_args.require_intrinsic(Self::GlobalStoreTrap);
                output.push_str(&format!(
                    r#"
                    // `componentIdx` is the instance the operation is for, if known: the one
                    // whose threads its completion may make ready.
                    function {track_host_operation_fn}(operation, componentIdx) {{
                        if ({store}.stopped) {{ throw {store}.error; }}
                        const result = operation();
                        if (result === null ||
                            (typeof result !== 'object' && typeof result !== 'function') ||
                            typeof result.then !== 'function') {{
                            if ({store}.stopped) {{ throw {store}.error; }}
                            return result;
                        }}

                        {store_async_state}.pendingHostOperations++;
                        const owner = componentIdx ?? -1;
                        // (allocated on first use, so a store without host work pays nothing for it)
                        const byComponent = ({store_async_state}.hostOperationsByComponent ??= new Map());
                        byComponent.set(owner, (byComponent.get(owner) ?? 0) + 1);
                        let rejectStopped;
                        const stopped = new Promise((_, reject) => {{ rejectStopped = reject; }});
                        {store}.stopWaiters.add(rejectStopped);
                        if ({store}.stopped) {{ rejectStopped({store}.error); }}
                        const tracked = Promise.race([result, stopped]).finally(() => {{
                            {store}.stopWaiters.delete(rejectStopped);
                            {store_async_state}.pendingHostOperations--;
                            const remaining = (byComponent.get(owner) ?? 0) - 1;
                            if (remaining > 0) {{ byComponent.set(owner, remaining); }} else {{ byComponent.delete(owner); }}
                            if ({store_async_state}.pendingHostOperations < 0) {{
                                throw new Error('negative pending host operation count');
                            }}
                            for (const state of {async_state_map}.values()) {{ state.runTickLoop(); }}
                            {check_for_deadlock_fn}();
                        }});

                        // Forward disposal to the host's value, so it is notified if a guest
                        // discards the value (e.g. a future) produced from this operation
                        for (const sym of [Symbol.asyncDispose, {symbol_dispose}]) {{
                            if (typeof sym === 'symbol' && typeof result[sym] === 'function') {{
                                tracked[sym] = () => result[sym]();
                            }}
                        }}

                        return tracked;
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

            Self::PostReturnTrap => {
                let post_return_trap_fn = render_args.require_intrinsic(Self::PostReturnTrap);
                let get_state = render_args.require_intrinsic(Self::GetOrCreateAsyncState);
                let runtime_error_class =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                let stack_overflow = Trap::StackOverflow.to_string();
                let uncaught_exception = Trap::UncaughtException.to_string();
                output.push_str(&format!(
                    r#"
                    function {post_return_trap_fn}(componentIdx, err) {{
                        // Core exceptions and stack exhaustion are fatal during cleanup.
                        if (!(err instanceof {runtime_error_class})) {{
                            const message = /call stack|stack overflow|too much recursion/i.test(err?.message ?? '')
                                ? {stack_overflow:?} : {uncaught_exception:?};
                            err = new {runtime_error_class}(message, {{ cause: err }});
                        }}
                        {get_state}(componentIdx).markTrapped(err);
                        return err;
                    }}
                    "#,
                ));
            }

            Self::GuardPostReturn => {
                let guard = render_args.require_intrinsic(Self::GuardPostReturn);
                let trap = render_args.require_intrinsic(Self::PostReturnTrap);
                output.push_str(&format!(
                    r#"
                    function {guard}(componentIdx, fn) {{
                        return (...args) => {{
                            try {{ return fn(...args); }}
                            catch (err) {{ throw {trap}(componentIdx, err); }}
                        }};
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

            Self::RecordTrap => {
                let record_trap_fn = render_args.require_intrinsic(Self::RecordTrap);
                let get_or_create_async_state_fn =
                    render_args.require_intrinsic(Self::GetOrCreateAsyncState);
                let global_current_thread_meta_obj =
                    render_args.require_intrinsic(Intrinsic::GlobalCurrentThreadMeta);
                let runtime_error_class =
                    render_args.require_intrinsic(Intrinsic::WebAssemblyRuntimeError);
                output.push_str(&format!(
                    r#"
                    function {record_trap_fn}(componentIdx, err, convertsRangeErrors = false) {{
                        // A built-in reading or writing guest memory past its end fails with a
                        // DataView RangeError: that is the Canonical ABI's out-of-bounds trap.
                        if (convertsRangeErrors && err instanceof RangeError) {{
                            err = new {runtime_error_class}('out of bounds memory access');
                        }}
                        if (err instanceof {runtime_error_class}) {{
                            // (a trampoline without a static instance records against the
                            // component whose guest code is running)
                            const idx = componentIdx ?? {global_current_thread_meta_obj}.current?.componentIdx;
                            if (idx !== undefined && idx !== null) {{
                                {get_or_create_async_state_fn}(idx).markTrapped(err);
                            }}
                        }}
                        return err;
                    }}
                    "#,
                ));
            }

            Self::GuardTrap => {
                let guard_trap_fn = render_args.require_intrinsic(Self::GuardTrap);
                let record_trap_fn = render_args.require_intrinsic(Self::RecordTrap);
                output.push_str(&format!(
                    r#"
                    function {guard_trap_fn}(componentIdx, fn, convertsRangeErrors = false) {{
                        return function (...args) {{
                            try {{
                                return fn.apply(this, args);
                            }} catch (err) {{
                                throw {record_trap_fn}(componentIdx, err, convertsRangeErrors);
                            }}
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
                let get_handle_index_space_fn = render_args.intrinsic_call(
                    Intrinsic::Resource(ResourceIntrinsic::GetHandleIndexSpace),
                    "this.#componentIdx",
                );
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
                let check_sync_call_blocked_fn =
                    render_args.require_intrinsic(Self::CheckSyncCallBlocked);
                let cannot_enter_component = Trap::CannotEnterComponent.to_string();
                let report_trap_fn = render_args.require_intrinsic(Self::ReportTrap);
                let check_idle_fn = render_args.require_intrinsic(Self::CheckIdle);
                let store_async_state = render_args.require_intrinsic(Self::GlobalStoreAsyncState);
                let async_state_map = render_args.require_intrinsic(Self::GlobalAsyncStateMap);

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
                        #numWaitingToEnter = 0;
                        #enteringTaskID = null;
                        #entrySlotWaiters = [];
                        #entrySlotTurnTaskID = null;
                        #lockHandoffScheduled = false;
                        #pendingTaskStarts = 0;
                        #parkedTasks = new Map();
                        // Suspended threads, oldest first (a Map iterates in insertion
                        // order, so no separate queue is kept for them).
                        #suspendedThreadsByRef = new Map();
                        // Tasks whose threads all exited before they resolved.
                        #unresolvedExits = new Set();
                        #errored = null;
                        #trapped = false;
                        #trapError = null;
                        #backpressure = 0;
                        #backpressureWaiters = 0n;

                        #handlerMap = new Map();
                        #nextHandlerID = 0n;

                        // Cancels the scheduled tick while the tick loop runs.
                        #tickLoop = null;

                        // Runs the callback on the next macrotask, after the current microtasks have
                        // drained, as setTimeout(callback, 0) would, but without its minimum delay:
                        // Node.js clamps it to 1 ms and browsers to 4 ms once timers nest, which a
                        // guest that yields often pays on every yield. Returns a cancel function.
                        static #onNextMacrotask(callback) {{
                            if (typeof setImmediate === 'function') {{
                                const handle = setImmediate(callback);
                                return () => clearImmediate(handle);
                            }}
                            if (typeof MessageChannel === 'function') {{
                                const channel = new MessageChannel();
                                let cancelled = false;
                                channel.port1.onmessage = () => {{
                                    channel.port1.close();
                                    if (!cancelled) {{ callback(); }}
                                }};
                                channel.port2.postMessage(null);
                                return () => {{ cancelled = true; channel.port1.close(); }};
                            }}
                            const handle = setTimeout(callback, 0);
                            return () => clearTimeout(handle);
                        }}

                        static #afterDelay(callback, ms) {{
                            const handle = setTimeout(callback, ms);
                            return () => clearTimeout(handle);
                        }}

                        #onExclusiveReleaseHandlers = [];

                        #mayLeave = true;

                        handles;
                        subtasks;
                        threads;

                        constructor(args) {{
                            this.#componentIdx = args.componentIdx;
                            this.handles = new {rep_table_class}({{
                                target: `component [${{this.#componentIdx}}] handles (waitable objects)`,
                                space: {get_handle_index_space_fn},
                            }});
                            this.subtasks = new {rep_table_class}({{ target: `component [${{this.#componentIdx}}] subtasks` }});
                            this.threads = new {rep_table_class}({{ target: `component [${{this.#componentIdx}}] threads` }});
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
                            if (this.#trapError === null) {{ this.#trapError = err; }}
                            {debug_log_fn}('[{component_async_state_class}#markTrapped()] component trapped', {{ err, componentIdx: this.#componentIdx }});
                            if ({store_trap}.error === null) {{ {store_trap}.error = err; }}
                            {report_trap_fn}(err);
                            {check_idle_fn}();
                            return true;
                        }}

                        isTrapped() {{ return this.#trapped; }}
                        // For work that was already under way or queued when the instance
                        // trapped: it fails with that trap (nothing runs after a trap).
                        throwIfInterrupted() {{
                            if ({store_trap}.stopped) {{ throw {store_trap}.error; }}
                            if (this.#trapped) {{
                                throw this.#trapError ?? new {runtime_error_class}({cannot_enter_component:?});
                            }}
                        }}
                        throwIfTrapped() {{
                            if ({store_trap}.stopped) {{ throw {store_trap}.error; }}
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
                            for (const handler of [...(this.#handlerMap.get('backpressure-change') ?? [])]) {{
                                handler.fn(v);
                            }}
                            return this.#backpressure;
                        }}
                        getBackpressure() {{ return this.#backpressure; }}

                        incrementBackpressure() {{
                            const current = this.#backpressure;
                            if (current < 0 || current > 2**16) {{
                                throw new Error(`invalid current backpressure value [${{current}}]`);
                            }}
                            const newValue = this.getBackpressure() + 1;
                            if (newValue >= 2**16) {{
                                throw new {runtime_error_class}('backpressure counter overflow');
                            }}
                            return this.setBackpressure(newValue);
                        }}

                        decrementBackpressure() {{
                            const current = this.#backpressure;
                            if (current < 0 || current > 2**16) {{
                                throw new Error(`invalid current backpressure value [${{current}}]`);
                            }}
                            // Canonical ABI `backpressure.dec`: trap if the counter would go
                            // below zero.
                            const newValue = current - 1;
                            if (newValue < 0) {{
                                throw new {runtime_error_class}('backpressure counter underflow');
                            }}
                            return this.setBackpressure(newValue);
                        }}
                        hasBackpressure() {{ return this.#backpressure > 0; }}

                        waitForBackpressure() {{
                            if (!this.hasBackpressure()) {{ return Promise.resolve(null); }}
                            this.addBackpressureWaiter();
                            return new Promise((resolve) => {{
                                let pending = true;
                                const handlerID = this.registerHandler({{
                                    event: 'backpressure-change',
                                    fn: (bp) => {{
                                        if (bp !== 0 || !pending) {{ return; }}
                                        pending = false;
                                        this.removeHandler({{ event: 'backpressure-change', handlerID }});
                                        this.removeBackpressureWaiter();
                                        resolve(null);
                                    }},
                                }});
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

                        // The per-turn mutual-exclusion lock for guest execution in this
                        // component instance. Guest turns (callback invocations and
                        // sync-lifted bodies) must be atomic per component even across the
                        // JSPI suspensions jco introduces for host imports: wit-bindgen's
                        // executors publish per-task state in single linear-memory cells
                        // (the wasip3-task pointer, context-local storage discipline) that
                        // an interleaved turn of the same component corrupts
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
                        acquireExclusiveLock(taskID) {{
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
                            return new Promise((resolve) => {{
                                this.#lockWaiters.push({{ taskID, resolve }});
                            }});
                        }}

                        // Canonical ABI `num_waiting_to_enter` (`Task.enter_implicit_thread`):
                        // while any task waits to enter this instance, a new entry waits at
                        // least once, then only for its own condition. A task that may enter
                        // is never held behind one that may not.
                        numWaitingToEnter() {{ return this.#numWaitingToEnter; }}
                        addWaitingToEnter() {{ this.#numWaitingToEnter++; }}
                        removeWaitingToEnter() {{
                            if (this.#numWaitingToEnter === 0) {{
                                throw new Error('unexpectedly negative number of tasks waiting to enter');
                            }}
                            this.#numWaitingToEnter--;
                        }}

                        // The Canonical ABI runs an entered task until it first returns or
                        // blocks before anything else enters. A task entered through `enter()`
                        // runs only once that resolves, so it holds this slot until its first
                        // turn ends, and later entries observe that turn's effects (e.g.
                        // backpressure it set).
                        hasEnteringTask() {{ return this.#enteringTaskID !== null; }}
                        // Whether the slot keeps the given task from entering: another task
                        // holds it, or other tasks wait for it ahead of this one.
                        entrySlotBusy(taskID) {{
                            if (this.#enteringTaskID !== null) {{ return true; }}
                            if (this.#entrySlotTurnTaskID !== null) {{ return this.#entrySlotTurnTaskID !== taskID; }}
                            return this.#entrySlotWaiters.length > 0;
                        }}
                        // In the Canonical ABI, a call whose entry finds the slot held would
                        // run after that entry's initial invocation, before any other thread of the
                        // instance. Tasks waiting only for the slot therefore get it in
                        // arrival order as soon as it is free, without going through the
                        // scheduler, which could resume other threads of the instance first.
                        // The returned promise resolves when it is the task's turn; the task
                        // then enters (`beginEntry`) or passes the turn on (`passEntrySlotTurn`).
                        waitForEntrySlotTurn(taskID) {{
                            return new Promise((resolve) => {{ this.#entrySlotWaiters.push({{ taskID, resolve }}); }});
                        }}
                        passEntrySlotTurn(taskID) {{
                            if (this.#entrySlotTurnTaskID !== taskID) {{ return false; }}
                            this.#entrySlotTurnTaskID = null;
                            this.#handOffEntrySlot();
                            return true;
                        }}
                        #handOffEntrySlot() {{
                            if (this.#enteringTaskID !== null || this.#entrySlotTurnTaskID !== null) {{ return; }}
                            const next = this.#entrySlotWaiters.shift();
                            if (!next) {{
                                // Tasks waiting to enter through the scheduler may enter now.
                                if (this.#suspendedThreadsByRef.size > 0) {{ this.runTickLoop(); }}
                                return;
                            }}
                            this.#entrySlotTurnTaskID = next.taskID;
                            next.resolve();
                        }}
                        abandonEntrySlotWaiters() {{
                            this.#entrySlotTurnTaskID = null;
                            for (const waiter of this.#entrySlotWaiters.splice(0)) {{ waiter.resolve(); }}
                        }}
                        beginEntry(taskID) {{
                            if (this.#enteringTaskID !== null) {{
                                throw new Error(`task [${{taskID}}] cannot enter component [${{this.#componentIdx}}] while task [${{this.#enteringTaskID}}] is entering`);
                            }}
                            if (this.#entrySlotTurnTaskID === taskID) {{ this.#entrySlotTurnTaskID = null; }}
                            this.#enteringTaskID = taskID;
                        }}
                        endEntry(taskID) {{
                            if (this.#enteringTaskID !== taskID) {{ return false; }}
                            this.#enteringTaskID = null;
                            this.#handOffEntrySlot();
                            return true;
                        }}

                        abandonLockWaiters() {{
                            const waiters = this.#lockWaiters.splice(0);
                            for (const waiter of waiters) {{ waiter.resolve(); }}
                        }}

                        cancelExclusiveLockWaiter(taskID) {{
                            const idx = this.#lockWaiters.findIndex(waiter => waiter.taskID === taskID);
                            if (idx === -1) {{ return false; }}
                            const [waiter] = this.#lockWaiters.splice(idx, 1);
                            // Release the awaiting `enter()` continuation without granting
                            // ownership. It observes the task's resolved cancellation state
                            // before attempting to execute guest code.
                            waiter.resolve();
                            return true;
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
                            // asynchronous guest turn.
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
                                // first opportunity to use the unlocked component. Its own
                                // release schedules the next handoff; re-queueing one here
                                // would spin the microtask queue for as long as the holder
                                // stays blocked (e.g. in a synchronous wait), starving every
                                // timer, the deadlock detector included.
                                if (this.#lockHolderTaskID !== null) {{ return; }}
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

                        // Callback drivers refer to the implicit thread by task ID.
                        // Stackful built-ins pass their current thread directly.
                        #getSuspendedTaskMeta(taskID) {{
                            const metas = [...this.#suspendedThreadsByRef.values()].filter(meta => meta.thread.taskID() === taskID);
                            return metas.find(meta => meta.cancellable && this.suspendedThreadReady(meta.thread)) ?? metas[0];
                        }}

                        suspendTask(args) {{
                            const {{ task, ...opts }} = args;
                            task.endInitialInvocationOnBlock();
                            return this.suspendThread({{ thread: task.defaultThread(), ...opts }});
                        }}

                        resumeTaskByID(taskID) {{
                            const meta = this.#getSuspendedTaskMeta(taskID);
                            return meta ? this.resumeThread(meta.thread) : false;
                        }}

                        suspendedTaskReady(taskID) {{
                            const meta = this.#getSuspendedTaskMeta(taskID);
                            return meta ? this.suspendedThreadReady(meta.thread) : false;
                        }}

                        suspendedTaskCancellable(taskID) {{
                            return !!this.#getSuspendedTaskMeta(taskID)?.cancellable;
                        }}

                        isTaskSuspended(taskID) {{
                            return !!this.#getSuspendedTaskMeta(taskID);
                        }}

                        *suspendedTaskMetas() {{
                            for (const meta of this.#suspendedThreadsByRef.values()) {{
                                yield {{ ...meta, task: meta.thread.task() }};
                            }}
                        }}

                        // Record a task whose last thread exited before it resolved. Nothing
                        // can resolve it any more, so let the deadlock detector account for
                        // whoever waits on it.
                        noteUnresolvedExit(task) {{
                            this.#unresolvedExits.add(task);
                            {check_for_deadlock_fn}();
                        }}

                        // Tasks whose threads all exited unresolved while their root task is
                        // still unresolved. Tasks under a resolved root are forgotten: no
                        // caller can be blocked on them any more.
                        *unresolvedExitedTasks() {{
                            for (const task of this.#unresolvedExits) {{
                                const root = task.getRootTask();
                                if (root.isResolvedState() || root.isRejected()) {{
                                    this.#unresolvedExits.delete(task);
                                }} else {{
                                    yield task;
                                }}
                            }}
                        }}

                        #removeSuspendedThreadMeta(thread) {{
                            const meta = this.#suspendedThreadsByRef.get(thread);
                            this.#suspendedThreadsByRef.delete(thread);
                            return meta;
                        }}

                        suspendThread(args) {{
                            const {{ thread, readyFn, cancellable, onResume, suspended = false, switching = false }} = args;
                            {debug_log_fn}('[{component_async_state_class}#suspendThread()]', {{
                                threadID: thread.id(),
                                taskID: thread.taskID(),
                                componentIdx: this.#componentIdx,
                            }});

                            if (thread.componentIdx() !== this.#componentIdx) {{
                                throw new Error('assert: thread component idx should match async state');
                            }}
                            if (this.#suspendedThreadsByRef.has(thread)) {{
                                throw new Error(`thread [${{thread.id()}}] already suspended`);
                            }}

                            let promise;
                            let resume;
                            if (onResume) {{
                                resume = () => onResume(!thread.isCancelled() && !thread.isRejected() && !this.isTrapped());
                            }} else {{
                                const resolvers = {promise_with_resolvers_fn}();
                                promise = resolvers.promise;
                                resume = () => resolvers.resolve(!thread.isCancelled() && !thread.isRejected() && !this.isTrapped());
                            }}
                            if ({store_trap}.stopped) {{
                                this.markTrapped({store_trap}.error);
                                resume();
                                return promise;
                            }}
                            this.#suspendedThreadsByRef.set(thread, {{ thread, cancellable, readyFn, resume, suspended }});

                            thread.notifyProgress();

                            this.runTickLoop();
                            {check_for_deadlock_fn}();
                            // A thread blocking returns control to a sync call in progress,
                            // which goes on only if it can (Canonical ABI `canon_lift`). A
                            // thread switching straight to another one does not.
                            if (!switching) {{ this.checkSyncCallBlocked(); }}

                            return promise;
                        }}

                        resumeThread(thread) {{
                            const meta = this.#removeSuspendedThreadMeta(thread);
                            if (!meta) {{ return false; }}
                            meta.resume();
                            return true;
                        }}

                        markThreadReady(thread) {{
                            const meta = this.#suspendedThreadsByRef.get(thread);
                            if (!meta || !meta.suspended) {{ return false; }}
                            meta.suspended = false;
                            meta.readyFn = () => true;
                            this.runTickLoop();
                            return true;
                        }}

                        isThreadSuspended(thread) {{
                            return this.#suspendedThreadsByRef.get(thread)?.suspended ?? false;
                        }}

                        // Readiness as `thread.{{suspend,yield}}-then-promote` sees it: the same
                        // condition the scheduler uses, including the exclusive lock (Canonical
                        // ABI `Thread.ready`, whose callback readiness waits for the lock).
                        isThreadReady(thread) {{
                            const meta = this.#suspendedThreadsByRef.get(thread);
                            return !!meta && !meta.suspended && this.suspendedThreadReady(thread);
                        }}

                        suspendedThreadReady(thread) {{
                            const meta = this.#suspendedThreadsByRef.get(thread);
                            if (!meta) {{ return false; }}
                            if (!meta.readyFn) {{
                                throw new Error(`suspended thread [${{thread.id()}}] is missing a readiness function`);
                            }}
                            if (this.isTrapped() || meta.thread.isRejected()) {{ return true; }}
                            if (!meta.readyFn()) {{ return false; }}
                            // Only the implicit thread of a task that takes the exclusive lock
                            // waits for it; threads made by `thread.new-indirect` never do.
                            if (!meta.thread.isImplicit()) {{ return true; }}
                            const task = meta.thread.task();
                            return !task.needsExclusiveLock()
                                || !this.isExclusivelyLocked()
                                || this.exclusivelyLockedBy(task.id());
                        }}

                        addPendingTaskStart() {{ this.#pendingTaskStarts++; }}
                        removePendingTaskStart() {{ this.#pendingTaskStarts--; }}

                        hasPendingSchedulerWork() {{
                            if (this.#pendingTaskStarts > 0) {{ return true; }}
                            if (this.#lockHandoffScheduled) {{ return true; }}
                            if (this.#heldBySyncCall()) {{ return false; }}
                            for (const meta of this.#suspendedThreadsByRef.values()) {{
                                if (this.suspendedThreadReady(meta.thread)) {{ return true; }}
                            }}
                            return false;
                        }}

                        // A thread of this instance that a sync call into it may resume: a
                        // ready thread of an entered task (Canonical ABI `canon_lift` picks
                        // among the ready threads of `inst.threads`, which a task joins as it
                        // enters). The thread of a task still waiting to enter is no candidate.
                        hasSyncCallCandidate() {{
                            for (const thread of this.#suspendedThreadsByRef.keys()) {{
                                if (!thread.hasIndex()) {{ continue; }}
                                if (this.suspendedThreadReady(thread)) {{ return true; }}
                            }}
                            return false;
                        }}

                        // Whether a stack of this instance within the sync call has not
                        // blocked: it runs, is about to resume, or is in a host call. Such a
                        // stack is still running in the Canonical ABI, so the call has not yet
                        // reached the point where it decides whether to trap.
                        hasRunningStackWithin(call) {{
                            // A task start or lock handoff in flight runs guest code next.
                            if (this.#pendingTaskStarts > 0 || this.#lockHandoffScheduled) {{ return true; }}
                            const data = this.threads.data();
                            for (let i = 2; i < data.length; i += 2) {{
                                const thread = data[i];
                                if (thread === null || typeof thread !== 'object') {{ continue; }}
                                if (this.#suspendedThreadsByRef.has(thread)) {{ continue; }}
                                if (!{component_async_state_class}.#isWithinSyncCall(thread.task(), call)) {{ continue; }}
                                const callee = thread.awaitedCallee();
                                if (callee !== null && !this.#calleeLetsCallerRun(callee)) {{ continue; }}
                                return true;
                            }}
                            return false;
                        }}

                        // Whether a thread that waits on a callee through a synchronous
                        // lowering is about to resume or runs the callee's code. Once the
                        // callee has entered, its own threads tell whether it still runs. A
                        // callee that waits to enter through the scheduler is blocked.
                        #calleeLetsCallerRun(callee) {{
                            if (callee.isResolvedState() || callee.isRejected()) {{ return true; }}
                            if (callee.hasEntered()) {{ return false; }}
                            const state = {async_state_map}.get(callee.componentIdx());
                            return state === undefined || !state.isTaskSuspended(callee.id());
                        }}

                        checkSyncCallBlocked() {{
                            return {check_sync_call_blocked_fn}();
                        }}

                        // Calls of non-async-typed functions (Canonical ABI `canon_lift` with
                        // `not ft.async_`) are tracked store-wide, innermost last. Until such a
                        // call's task resolves, the spec resumes only ready threads of the
                        // callee's instance, and traps if there are none; nothing else in the
                        // store runs.
                        beginSyncCall(task) {{
                            {store_async_state}.syncCalls.push({{ componentIdx: this.#componentIdx, task }});
                        }}

                        endSyncCall(task) {{
                            const syncCalls = {store_async_state}.syncCalls;
                            const idx = syncCalls.findIndex((call) => call.task === task);
                            if (idx === -1) {{ return; }}
                            syncCalls.splice(idx, 1);
                            // Stacks held back by the call resume in the order their promises
                            // settled, unless another sync call still holds them back.
                            const top = syncCalls.at(-1);
                            const held = {store_async_state}.heldResumptions;
                            for (let i = 0; i < held.length; ) {{
                                const {{ task: heldTask, resume }} = held[i];
                                if (top !== undefined && !{component_async_state_class}.#isWithinSyncCall(heldTask, top)) {{
                                    i++;
                                    continue;
                                }}
                                held.splice(i, 1);
                                resume();
                            }}
                            // Instances held back by the call may run again.
                            for (const state of {async_state_map}.values()) {{
                                if (state.hasPendingSchedulerWork()) {{ state.runTickLoop(); }}
                            }}
                        }}

                        // Whether a task runs on behalf of a sync call: it belongs to the call's
                        // instance, or the call waits on it through synchronous lowerings (its
                        // stack is part of the call's stack).
                        static #isWithinSyncCall(task, call) {{
                            let current = task;
                            for (;;) {{
                                if (current === call.task || current.componentIdx() === call.componentIdx) {{ return true; }}
                                const subtask = current.getParentSubtask();
                                if (!subtask || subtask.isAsync) {{ return false; }}
                                current = subtask.getParentTask();
                            }}
                        }}

                        // Resume a stack of this instance that waited on a promise of the
                        // host. While a sync call into another instance is in progress, only
                        // that instance runs (Canonical ABI `canon_lift`, `not ft.async_`):
                        // the stack resumes once the call has returned.
                        resumeWhenNotHeld(task, resume) {{
                            const call = {store_async_state}.syncCalls.at(-1);
                            if (call === undefined || task === null || task === undefined
                                || {component_async_state_class}.#isWithinSyncCall(task, call)) {{
                                resume();
                                return;
                            }}
                            {store_async_state}.heldResumptions.push({{ task, resume }});
                        }}

                        // Whether a call of a non-async-typed function into another instance
                        // is in progress, so that this instance's threads may not be resumed.
                        #heldBySyncCall() {{
                            const top = {store_async_state}.syncCalls.at(-1);
                            return top !== undefined && top.componentIdx !== this.#componentIdx;
                        }}

                        stop() {{
                            this.#tickLoop?.();
                            this.#tickLoop = null;
                            this.abandonLockWaiters();
                            this.abandonEntrySlotWaiters();
                            // Stacks held back by a sync call resume too, to observe the stop.
                            const held = {store_async_state}.heldResumptions;
                            for (let i = 0; i < held.length; ) {{
                                if (held[i].task.componentIdx() !== this.#componentIdx) {{
                                    i++;
                                    continue;
                                }}
                                const [{{ resume }}] = held.splice(i, 1);
                                resume();
                            }}
                            for (const thread of [...this.#suspendedThreadsByRef.keys()]) {{
                                this.resumeThread(thread);
                            }}
                        }}

                        runTickLoop() {{
                            if ({store_trap}.stopped || this.#tickLoop !== null) {{ return; }}
                            const run = () => {{
                                if ({store_trap}.stopped) {{ this.#tickLoop = null; return; }}
                                const result = this.tick();
                                if ({store_trap}.stopped || result === {component_async_state_class}.TickResult.DONE) {{
                                    this.#tickLoop = null;
                                    return;
                                }}
                                if (result === {component_async_state_class}.TickResult.IDLE) {{
                                    // This also runs while a synchronous call into another
                                    // instance holds this one back: the loop keeps polling, so
                                    // that it notices readiness and takes part in the store-wide
                                    // idle check both during the call and after it ends.
                                    {check_for_deadlock_fn}();
                                }}
                                // Let resumed microtasks drain before the next turn;
                                // otherwise poll at the idle cadence.
                                this.#tickLoop = result === {component_async_state_class}.TickResult.RESUMED
                                    ? {component_async_state_class}.#onNextMacrotask(run)
                                    : {component_async_state_class}.#afterDelay(run, 10);
                            }};
                            this.#tickLoop = {component_async_state_class}.#onNextMacrotask(run);
                        }}

                        tick() {{
                            // (resuming returns immediately below, so the map is never
                            // mutated while this loop is still iterating it)
                            const held = this.#heldBySyncCall();
                            for (const [thread, meta] of this.#suspendedThreadsByRef) {{
                                if (!meta || !meta.readyFn) {{
                                    throw new Error(`missing/invalid thread meta despite thread [${{thread.id()}}] being present`);
                                }}

                                if (this.isTrapped() || meta.thread.isRejected()) {{
                                    {debug_log_fn}('[{component_async_state_class}#tick()] detected thread rejection, leaving early', {{ meta }});
                                    this.resumeThread(thread);
                                    return {component_async_state_class}.TickResult.RESUMED;
                                }}

                                if (held || !this.suspendedThreadReady(thread)) {{ continue; }}

                                {debug_log_fn}('[{component_async_state_class}#tick()] resuming thread via tick', {{
                                    threadID: thread.id(),
                                    componentIdx: this.#componentIdx,
                                }});
                                this.resumeThread(thread);

                                // Resume only one thread per tick so its current-thread
                                // register window closes before another continuation runs.
                                return {component_async_state_class}.TickResult.RESUMED;
                            }}

                            const idle = this.#suspendedThreadsByRef.size > 0;
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
