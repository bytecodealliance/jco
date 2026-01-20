//! Intrinsics that represent helpers that implement waitable sets

use super::async_task::AsyncTaskIntrinsic;
use crate::intrinsics::component::ComponentIntrinsic;
use crate::intrinsics::p3::host::HostIntrinsic;
use crate::intrinsics::{AsyncDeterminismProfile, Intrinsic, RenderIntrinsicsArgs};
use crate::source::Source;

/// This enum contains intrinsics that enable waitable sets
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum WaitableIntrinsic {
    /// The definition of the `WaitableSet` JS class
    WaitableSetClass,

    /// The definition of the `Waitable` JS class
    WaitableClass,

    /// Create a new waitable set
    ///
    /// Guest code uses this to create new waitable/pollable groups of events that can be waited on.
    /// The waitable set is tied to the implicit current task
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// function waitableSetNew(componentInstanceId: number): i32;
    /// ```
    ///
    /// The function returns the index of the waitable set that was created, so it can be used later (e.g. waitableSetWait)
    WaitableSetNew,

    /// Wait on a given waitable
    ///
    /// Guest code uses this to wait on a waitable that has been already created
    /// The waitable set index is relevant to the implicit current task.
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-waitable-setwait
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function waitableSetWait(
    ///     componentInstanceID: i32,
    ///     isAsync: boolean,
    ///     memory: i32,
    ///     waitableSetRep: i32,
    ///     resultPtr: i32
    /// );
    /// ```
    ///
    /// The results of the poll should be set in the provided pointer
    WaitableSetWait,

    /// Poll a given waitable set
    ///
    /// Guest code uses this builtin to poll whether a waitable set is finished or not,
    /// yielding to other tasks while doing so.
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-waitable-setpoll
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// function waitableSetPoll(
    ///     componentInstanceID: i32,
    ///     isAsync: boolean,
    ///     memory: i32,
    ///     waitableSetRep: i32,
    ///     resultPtr: i32
    /// );
    /// ```
    ///
    /// The results of the poll should be set in the provided pointer
    WaitableSetPoll,

    /// Drop a given waitable set
    ///
    /// Guest code uses this builtin to remove the waitable set in it's entirety from a component instance's tables.
    /// The component instance is known via the current task.
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-waitable-setdrop
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// function waitableSetDrop(componentInstanceID: i32, waitableSetRep: i32);
    /// ```
    WaitableSetDrop,

    /// JS helper function for removing a waitable set
    RemoveWaitableSet,

    /// Join a given waitable set
    ///
    /// Guest code uses this builtin to add a provided waitable to an existing waitable set.
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-waitablejoin
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// function waitableJoin(componentInstanceID: i32, waitableSetRep: i32, waitableRep: i32);
    /// ```
    ///
    /// If the waitable set index is zero (an otherwise invalid table index), join should *remove* the given waitable from any sets
    /// that it may be a part of (of which there should only be one).
    WaitableJoin,
}

impl WaitableIntrinsic {
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
            Self::RemoveWaitableSet => "_removeWaitableSet",
            Self::WaitableSetNew => "waitableSetNew",
            Self::WaitableSetWait => "waitableSetWait",
            Self::WaitableSetPoll => "waitableSetPoll",
            Self::WaitableSetDrop => "waitableSetDrop",
            Self::WaitableJoin => "waitableJoin",
            Self::WaitableSetClass => "WaitableSet",
            Self::WaitableClass => "Waitable",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source, args: &RenderIntrinsicsArgs<'_>) {
        match self {
            Self::WaitableSetClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let waitable_set_class = Self::WaitableSetClass.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();

                let maybe_shuffle = if args.determinism == AsyncDeterminismProfile::Random {
                    "this.shuffleWaitables();"
                } else {
                    ""
                };

                output.push_str(&format!(r#"
                    class {waitable_set_class} {{
                        #componentInstanceID;
                        #waitables = [];
                        #pendingEvent = null;
                        #waiting = 0;

                        constructor(componentInstanceID) {{
                            this.#componentInstanceID = componentInstanceID;
                        }}

                        numWaitables() {{ return this.#waitables.length; }}
                        numWaiting() {{ return this.#waiting; }}

                        incrementNumWaiting(n) {{ this.#waiting += n ?? 1; }}
                        decrementNumWaiting(n) {{ this.#waiting -= n ?? 1; }}

                        shuffleWaitables() {{
                            this.#waitables = this.#waitables
                                .map(value => ({{ value, sort: Math.random() }}))
                                .sort((a, b) => a.sort - b.sort)
                                .map(({{ value }}) => value);
                        }}

                        removeWaitable(waitable) {{
                            const existing = this.#waitables.find(w => w === waitable);
                            if (!existing) {{ return undefined; }}
                            this.#waitables = this.#waitables.filter(w => w !== waitable);
                            return waitable;
                        }}

                        addWaitable(waitable) {{
                            this.removeWaitable(waitable);
                            this.#waitables.push(waitable);
                        }}

                        hasPendingEvent() {{
                            {debug_log_fn}('[{waitable_set_class}#hasPendingEvent()] args', {{
                                componentIdx: this.#componentInstanceID
                            }});
                            const waitable = this.#waitables.find(w => w.hasPendingEvent());
                            return waitable !== undefined;
                        }}

                        getPendingEvent() {{
                            {debug_log_fn}('[{waitable_set_class}#getPendingEvent()] args', {{
                                componentIdx: this.#componentInstanceID
                            }});
                            for (const waitable of this.#waitables) {{
                                if (!waitable.hasPendingEvent()) {{ continue; }}
                                return waitable.getPendingEvent();
                            }}
                            throw new Error('no waitables had a pending event');
                        }}

                        async poll() {{
                            {debug_log_fn}('[{waitable_set_class}#poll()] args', {{
                                componentIdx: this.#componentInstanceID
                            }});

                            const state = {get_or_create_async_state_fn}(this.#componentInstanceID);

                            {maybe_shuffle}

                            for (const waitableRep of this.#waitables) {{
                                const w = state.waitables.get(waitableRep);
                                if (!w) {{ throw new Error('no waitable with rep [' + waitableRep + ']'); }}
                                waitables.push(w);
                            }}

                            const event = await Promise.race(waitables.map((w) => w.promise));

                            throw new Error('{waitable_set_class}#poll() not implemented');
                        }}
                    }}
                "#));
            }

            Self::WaitableClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let waitable_class = Self::WaitableClass.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!(r#"
                    class {waitable_class} {{
                        static _ID =  0n; // NOTE: this id is *not* the component model representation (aka 'rep')

                        #id;
                        #componentInstanceID;
                        #pendingEventFn = null;
                        #waitableSet;
                        #promise;

                        constructor({{ promise, componentInstanceID }}) {{
                            this.#id = ++{waitable_class}._ID;
                            this.#componentInstanceID = componentInstanceID;
                            this.#promise = promise;
                        }}

                        hasPendingEvent() {{
                            {debug_log_fn}('[{waitable_class}#hasPendingEvent()]', {{
                                componentIdx: this.#componentInstanceID,
                                waitableSet: this.#waitableSet,
                                hasPendingEvent: this.#pendingEventFn,
                            }});
                            return this.#pendingEventFn !== null;
                        }}

                        setPendingEventFn(fn) {{
                            {debug_log_fn}('[{waitable_class}#setPendingEvent()] args', {{ }});
                            this.#pendingEventFn = fn;
                        }}

                        getPendingEvent() {{
                            {debug_log_fn}('[{waitable_class}#getPendingEvent()] args', {{ }});
                            if (this.#pendingEventFn === null) {{ return null; }}
                            const e = this.#pendingEventFn();
                            this.#pendingEventFn = null;
                            return e;
                        }}

                        async poll() {{
                            {debug_log_fn}('[{waitable_class}#poll()] args', {{
                                componentIdx: this.#componentInstanceID,
                                _id: this.#id,
                            }});

                            const state = {get_or_create_async_state_fn}(this.#componentInstanceID);
                            if (!state) {{
                                throw new Error('invalid/missing async state for component instance [' + componentInstanceID + ']');
                            }}

                            const waitables = [];
                            for (const waitableRep in waitableSet.waitables) {{
                                const w = state.waitables.get(waitableRep);
                                if (!w) {{ throw new Error('no waitable with rep [' + waitableRep + ']'); }}
                                waitables.push(w);
                            }}

                            const event = await Promise.race(waitables.map((w) => w.promise));

                            throw new Error('{waitable_class}#poll() not implemented');
                        }}

                        join(waitableSet) {{
                            if (this.#waitableSet) {{ this.#waitableSet.removeWaitable(this); }}
                            if (!waitableSet) {{
                                this.#waitableSet = null;
                                return;
                            }}
                            waitableSet.addWaitable(this);
                            this.#waitableSet = waitableSet;
                        }}

                        drop() {{
                            {debug_log_fn}('[{waitable_class}#drop()] args', {{
                                componentIdx: this.#componentInstanceID,
                                _id: this.#id,
                            }});
                            if (this.hasPendingEvent()) {{
                                throw new Error('waitables with pending events cannot be dropped');
                            }}
                            this.join(null);
                        }}

                    }}
                "#
                ));
            }

            Self::WaitableSetNew => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let waitable_set_class = Self::WaitableSetClass.name();
                let waitable_set_new_fn = Self::WaitableSetNew.name();
                output.push_str(&format!("
                    function {waitable_set_new_fn}(componentInstanceID) {{
                        {debug_log_fn}('[{waitable_set_new_fn}()] args', {{ componentInstanceID }});
                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state) {{ throw new Error('invalid/missing async state for component instance [' + componentInstanceID + ']'); }}
                        const rep = state.waitableSets.insert(new {waitable_set_class}(componentInstanceID));
                        if (typeof rep !== 'number') {{ throw new Error('invalid/missing waitable set rep [' + rep + ']'); }}
                        return rep;
                    }}
                "));
            }

            Self::WaitableSetWait => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let waitable_set_wait_fn = Self::WaitableSetWait.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let write_async_event_to_memory_fn = Intrinsic::WriteAsyncEventToMemory.name();
                output.push_str(&format!(r#"
                    async function {waitable_set_wait_fn}(componentInstanceID, isAsync, memory, waitableSetRep, resultPtr) {{
                        {debug_log_fn}('[{waitable_set_wait_fn}()] args', {{ componentInstanceID, isAsync, memory, waitableSetRep, resultPtr }});
                        const task = {current_task_get_fn}(componentInstanceID);
                        if (!task) {{ throw Error('invalid/missing async task'); }}
                        if (task.componentIdx !== componentInstanceID) {{
                            throw Error(['task component idx [' + task.componentIdx + '] != component instance ID [' + componentInstanceID + ']');
                        }}
                        const event = await task.waitForEvent({{ waitableSetRep, isAsync }});
                        {write_async_event_to_memory_fn}(memory, task, event, resultPtr);
                    }}
                "#));
            }

            Self::WaitableSetPoll => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let waitable_set_poll_fn = Self::WaitableSetPoll.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let store_event_in_component_memory_fn =
                    HostIntrinsic::StoreEventInComponentMemory.name();
                let async_event_code_enum = Intrinsic::AsyncEventCodeEnum.name();
                output.push_str(&format!(r#"
                    async function {waitable_set_poll_fn}(ctx, waitableSetRep, resultPtr) {{
                        const {{ componentIdx, memoryIdx, getMemoryFn, isAsync, isCancellable }} = ctx;
                        {debug_log_fn}('[{waitable_set_poll_fn}()] args', {{
                            componentIdx,
                            memoryIdx,
                            waitableSetRep,
                            resultPtr,
                            waitableSetRep,
                            resultPtr
                        }});

                        const taskMeta = {current_task_get_fn}(componentIdx);
                        if (!taskMeta) {{ throw Error('invalid/missing current task meta'); }}
                        if (taskMeta.componentIdx !== componentIdx) {{
                            throw Error('task component idx [' + task.componentIdx + '] != component instance ID [' + componentIdx + ']');
                        }}

                        const task = taskMeta.task;
                        if (!task) {{ throw Error('invalid/missing async task in task meta'); }}

                        if (task.componentIdx() !== componentIdx) {{
                            throw Error(`task component idx [${{task.componentIdx()}}] does not match generated [${{componentIdx}}]`);
                        }}

                        const cstate = {get_or_create_async_state_fn}(task.componentIdx());
                        const wset = cstate.waitableSets.get(waitableSetRep);
                        if (!wset) {{
                            throw new Error(`missing waitable set [${{waitableSetRep}}] in component [${{componentIdx}}]`);
                        }}

                        let event;
                        const cancelDelivered = task.deliverPendingCancel({{ cancelalble: isCancellable }});
                        if (cancelDelivered) {{
                            event = {{ code: {async_event_code_enum}.TASK_CANCELLED, index: 0, result: 0 }};
                        }} else if (!wset.hasPendingEvent()) {{
                            event = {{ code: {async_event_code_enum}.NONE, index: 0, result: 0 }};
                        }} else {{
                            event = wset.getPendingEvent();
                        }}

                        return {store_event_in_component_memory_fn}({{ event, ptr: resultPtr, memory: getMemoryFn() }});
                    }}
                "#));
            }

            Self::WaitableSetDrop => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let waitable_set_drop_fn = Self::WaitableSetDrop.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let remove_waitable_set_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!("
                    function {waitable_set_drop_fn}(componentInstanceID, waitableSetRep) {{
                        {debug_log_fn}('[{waitable_set_drop_fn}()] args', {{ componentInstanceID, waitableSetRep }});
                        const task = {current_task_get_fn}(componentInstanceID);

                        if (!task) {{ throw new Error('invalid/missing async task'); }}
                        if (task.componentIdx !== componentInstanceID) {{
                            throw Error('task component idx [' + task.componentIdx + '] != component instance ID [' + componentInstanceID + ']');
                        }}

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave, cannot be cancelled'); }}

                        {remove_waitable_set_fn}({{ state, waitableSetRep, task }});
                    }}
                "));
            }

            Self::RemoveWaitableSet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let remove_waitable_set_fn = Self::RemoveWaitableSet.name();
                output.push_str(&format!("
                    function {remove_waitable_set_fn}({{ state, waitableSetRep, task }}) {{
                        {debug_log_fn}('[{remove_waitable_set_fn}()] args', {{ componentInstanceID, waitableSetRep }});

                        const ws = state.waitableSets.get(waitableSetRep);
                        if (!ws) {{
                            throw new Error('cannot remove waitable set: no set present with rep [' + waitableSetRep + ']');
                        }}
                        if (waitableSet.hasPendingEvent()) {{ throw new Error('waitable set cannot be removed with pending items remaining'); }}

                        const waitableSet = state.waitableSets.get(waitableSetRep);
                        if (waitableSet.numWaitables() > 0) {{
                            throw new Error('waitable set still contains waitables');
                        }}
                        if (waitableSet.numWaiting() > 0) {{
                            throw new Error('waitable set still has other tasks waiting on it');
                        }}

                        state.waitableSets.remove(waitableSetRep);
                    }}
                "));
            }

            Self::WaitableJoin => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let waitable_join_fn = Self::WaitableJoin.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!("
                    function {waitable_join_fn}(componentInstanceID, waitableRep, waitableSetRep) {{
                        {debug_log_fn}('[{waitable_join_fn}()] args', {{ componentInstanceID, waitableSetRep, waitableRep }});

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state) {{
                           throw new Error('invalid/missing async state for component instance [' + componentInstanceID + ']');
                        }}

                        if (!state.mayLeave) {{
                            throw new Error('component instance is not marked as may leave, cannot join waitable');
                        }}

                        const waitable = state.waitables.get(waitableRep);
                        if (!waitable) {{
                            throw new Error('failed to find waitable [' + waitableRep + '] in component instance [' + componentInstanceID + ']');
                        }}

                        const waitableSet = waitableSetRep === 0 ? null : state.waitableSets.get(waitableSetRep);
                        if (waitableSetRep !== 0 && !waitableSet) {{
                            throw new Error('failed to find waitable set [' + waitableSetRep + '] in component instance [' + componentInstanceID + ']');
                        }}

                        waitable.join(waitableSet);
                    }}
                "));
            }
        }
    }
}
