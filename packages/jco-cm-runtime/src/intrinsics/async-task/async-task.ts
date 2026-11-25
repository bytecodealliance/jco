import { withConstructorStatics } from '../core/shared-class.js';
import { emptyFunc } from '../js-helper.js';
import type {
    AsyncTaskClassContext,
    AsyncTaskConstructor,
    TaskState,
    RuntimeMemory,
    TaskCallback,
    TaskPostReturn,
    AsyncSubtask as AsyncSubtaskType,
    TaskLowerFn,
    ResourceTable,
    AsyncThread as AsyncThreadType,
    AsyncTaskOptions,
    AsyncTask as AsyncTaskType,
    ComponentAsyncState,
    TaskSuspendOptions,
    CreateSubtaskOptions,
} from '../../runtime.js';
import { promiseWithResolvers } from '../core/promises.js';
import { withCurrentTaskMeta, withCurrentTaskMetaAsync, readTaskRegister } from '../task-context.js';
import { getOrCreateAsyncState, postReturnTrap } from '../component.js';
import { debugLog } from '../core/debug.js';
import { coinFlip as _coinFlip } from '../core.js';
import { clearCurrentThread, TASK_ALREADY_RESOLVED } from './task-operations.js';
import { syncContextSlots } from './context.js';

/** Stands in for a list that was never allocated. */
const NONE: readonly never[] = [];

const TASK_INITIAL = 'initial';
const TASK_CANCELLED = 'cancelled';
const TASK_CANCEL_PENDING = 'cancel-pending';
const TASK_CANCEL_DELIVERED = 'cancel-delivered';
const TASK_RESOLVED = 'resolved';

function defineAsyncTask() {
    return class AsyncTask {
        #context: AsyncTaskClassContext;
        // What one `initializeAsyncTaskClass` call shares between the instances it constructs.
        #store: { id: bigint; hostThreadID: number };

        static State = {
            INITIAL: TASK_INITIAL,
            CANCELLED: TASK_CANCELLED,
            CANCEL_PENDING: TASK_CANCEL_PENDING,
            CANCEL_DELIVERED: TASK_CANCEL_DELIVERED,
            RESOLVED: TASK_RESOLVED,
        } as const;
        static BlockResult = {
            CANCELLED: 'block.cancelled',
            NOT_CANCELLED: 'block.not-cancelled',
        } as const;
        // Keep task state private so bundlers can shorten its field names.
        #id!: bigint;
        #componentIdx!: number;
        #state!: TaskState;
        #isAsync!: boolean;
        #isManualAsync!: boolean;
        #callingWasmExport = true;
        #lockFreeEntry = false;
        #preserveFutureResult!: boolean;
        #entryFnName: string | undefined;
        // Most tasks never use the lists below, and every call creates a task, so
        // each list is only allocated once something is added to it.
        #onResolveHandlers: ((value: unknown) => void)[] | null = null;
        #progressWaiters: (() => void)[] | null = null;
        // The promises of a task are created when first needed: a sync task that
        // completes normally is never awaited, and every call creates a task.
        #completionPromise: Promise<unknown> | undefined;
        #resolveCompletionPromise: ((value: unknown) => void) | undefined;
        #rejectCompletionPromise: ((reason: unknown) => void) | undefined;
        #completionSettled = false;
        #completionValue: unknown;
        #completionReady = false;
        #rejected = false;
        #exitPromise: Promise<void> | undefined;
        #resolveExitPromise: (() => void) | undefined;
        #memoryIdx: number | null | undefined = null;
        #memory: RuntimeMemory | null | undefined = null;
        #liftMemory: RuntimeMemory | null | undefined = undefined;
        #callbackFn: TaskCallback | null = null;
        #callbackFnName: string | null | undefined = null;
        #postReturnFn: TaskPostReturn | null = null;
        #getCalleeParamsFn: (() => unknown[]) | null = null;
        #calleeIsAsync: boolean | null = null;
        #holdsEntrySlot = false;
        #funcTypeIsAsync = false;
        #syncCall = false;
        #returnResultTypeIdx: number | null = null;
        #returnStringEncoding: string | null = null;
        #parentSubtask: AsyncSubtaskType | null = null;
        #errHandling: unknown;
        #returnLowerFns: TaskLowerFn[] | null = null;
        #resourceScopeId!: number;
        #resourceBorrowCount = 0;
        #resourceLenders:
            | {
                  table: ResourceTable;
                  handle: number;
              }[]
            | null = null;
        #resourceScopeExited = false;
        #subtasks: AsyncSubtaskType[] | null = null;
        #threads: AsyncThreadType[] = [];
        #entered = false;
        #exited = false;
        #errored: unknown = null;

        get storage() {
            return this.defaultThread().storage;
        }
        cancelled = false;
        cancelRequested = false;
        alwaysTaskReturn = false;
        returnCalls = 0;
        tmpRetI64HighBits = 0 | 0;
        constructor(
            context: AsyncTaskClassContext,
            store: { id: bigint; hostThreadID: number },
            opts: AsyncTaskOptions,
        ) {
            this.#context = context;
            this.#store = store;
            this.#id = ++store.id;
            this.#resourceScopeId = ++this.#context.scopeCounter.value;
            this.#context.scopeTasks.set(this.#resourceScopeId, this);
            if (opts?.componentIdx === undefined) {
                throw new TypeError('missing component id during task creation');
            }
            this.#componentIdx = opts.componentIdx;
            this.#state = TASK_INITIAL;
            this.#isAsync = opts.isAsync ?? false;
            this.#isManualAsync = opts.isManualAsync ?? false;
            this.#preserveFutureResult = opts.preserveFutureResult ?? false;
            this.#entryFnName = opts.entryFnName;
            // Tasks that execute guest turns (export calls, fused
            // callees) default to true; import-handler tasks pass false
            // explicitly (they run host code nested inside the caller's
            // already-locked turn).
            this.#callingWasmExport = opts.callingWasmExport !== false;
            // Only an async task publishes its result through the completion promise,
            // so only such a task needs the promise, and the handler that records
            // the result, from the start.
            if (this.#isAsync || this.#isManualAsync) {
                this.#ensureCompletionPromise();
                (this.#onResolveHandlers ??= []).push((results) => {
                    if (this.#parentSubtask !== null) {
                        return;
                    }
                    this.#completionValue = results;
                    this.#completionReady = true;
                    // Publish after the current guest turn returns, so a trap
                    // in that turn can still reject the call. Do not wait for
                    // task exit: detached work may require further host calls
                    // or consumption of a returned resource's stream.
                });
            }
            if (opts.callbackFn) {
                this.#callbackFn = opts.callbackFn;
            }
            if (opts.callbackFnName) {
                this.#callbackFnName = opts.callbackFnName;
            }
            if (opts.getCalleeParamsFn) {
                this.#getCalleeParamsFn = opts.getCalleeParamsFn;
            }
            if (opts.parentSubtask) {
                this.#parentSubtask = opts.parentSubtask;
            }
            if (opts.errHandling) {
                this.#errHandling = opts.errHandling;
            }
            if (opts.stringEncoding) {
                this.#returnStringEncoding = opts.stringEncoding;
            }
        }
        taskState() {
            return this.#state;
        }
        id() {
            return this.#id;
        }
        componentIdx() {
            return this.#componentIdx;
        }
        entryFnName() {
            return this.#entryFnName;
        }
        resourceScopeId() {
            return this.#resourceScopeId;
        }
        addBorrowedHandle() {
            if (this.#resourceScopeExited) {
                throw new Error('cannot add a borrow to an exited resource scope');
            }
            this.#resourceBorrowCount++;
        }
        removeBorrowedHandle() {
            if (this.#resourceBorrowCount === 0) {
                throw new Error('resource borrow count underflow');
            }
            this.#resourceBorrowCount--;
        }
        addResourceLender(table: ResourceTable, handle: number) {
            if (this.#resourceScopeExited) {
                throw new Error('cannot add a lender to an exited resource scope');
            }
            (this.#resourceLenders ??= []).push({ table, handle });
        }
        validateResourceBorrowScope() {
            if (this.#resourceScopeExited) {
                return;
            }
            // Stopping abandons guest stacks, including borrows they
            // have not had a chance to drop. This is not a normal return.
            if (this.#context.storeTrap.stopped) {
                this.#resourceLenders = null;
                this.#resourceScopeExited = true;
                this.#context.scopeTasks.delete(this.#resourceScopeId);
                return;
            }
            if (this.#resourceBorrowCount !== 0) {
                throw new this.#context.RuntimeError('borrow handles still remain at the end of the call');
            }
            for (const { table, handle } of this.#resourceLenders ?? NONE) {
                const idx = handle * 2;
                const lendCount = table[idx];
                if (!Number.isInteger(lendCount) || lendCount <= 0 || lendCount >= 2 ** 30) {
                    throw new Error('invalid resource lender state at scope exit');
                }
                table[idx] = lendCount - 1;
            }
            this.#resourceLenders = null;
            this.#resourceScopeExited = true;
            this.#context.scopeTasks.delete(this.#resourceScopeId);
        }
        /**
         * Create the completion promise if it does not exist yet.
         *
         * @returns the promise that settles with the outcome of the task
         */
        #ensureCompletionPromise(): Promise<unknown> {
            if (this.#completionPromise === undefined) {
                const { promise, resolve, reject } = promiseWithResolvers();
                this.#completionPromise = promise;
                this.#resolveCompletionPromise = resolve;
                this.#rejectCompletionPromise = reject;
                // A nested rejection can reach the root task while its Wasm
                // entrypoint is still suspended, before the export wrapper awaits
                // this promise. Mark it handled immediately while preserving the
                // original rejected promise for the eventual caller.
                // Do not forward successful results into a derived promise: that
                // would assimilate a returned future and read it before the host.
                promise.then(emptyFunc, emptyFunc);
            }
            return this.#completionPromise;
        }

        /** Settle the completion promise, once, when the outcome of the task is known. */
        #settleCompletionPromise() {
            if (this.#completionSettled || !this.#completionReady) {
                return;
            }
            this.#completionSettled = true;
            this.#ensureCompletionPromise();
            const resolve = this.#resolveCompletionPromise!;
            const reject = this.#rejectCompletionPromise!;

            if (this.#errored !== null) {
                reject(this.#errored);
            } else if (this.#rejected) {
                reject(this.#completionValue);
            } else if (this.#preserveFutureResult && this.#completionValue instanceof this.#context.FutureValue) {
                this.#completionValue.resolveAsValue(resolve);
            } else {
                resolve(this.#completionValue);
            }
        }
        completionPromise() {
            return this.#ensureCompletionPromise();
        }
        settleCompletion() {
            this.#settleCompletionPromise();
        }
        exitPromise() {
            if (this.#exitPromise === undefined) {
                if (this.#exited) {
                    this.#exitPromise = Promise.resolve();
                } else {
                    const { promise, resolve } = promiseWithResolvers<void>();
                    this.#exitPromise = promise;
                    this.#resolveExitPromise = resolve;
                }
            }
            return this.#exitPromise;
        }
        waitForProgress() {
            const { promise, resolve } = promiseWithResolvers<void>();
            (this.#progressWaiters ??= []).push(resolve);
            return promise;
        }
        notifyProgress() {
            const waiters = this.#progressWaiters;
            if (waiters === null) {
                return;
            }
            this.#progressWaiters = null;
            for (const resolve of waiters) {
                resolve();
            }
        }
        isAsync() {
            return this.#isAsync;
        }
        isManualAsync() {
            return this.#isManualAsync;
        }
        isSync() {
            return !this.isAsync();
        }
        getErrHandling() {
            return this.#errHandling;
        }
        hasCallback() {
            return this.#callbackFn !== null;
        }
        getReturnMemoryIdx() {
            return this.#memoryIdx;
        }
        setReturnMemoryIdx(idx: number | null | undefined) {
            if (idx === null) {
                return;
            }
            this.#memoryIdx = idx;
        }
        getReturnMemory() {
            return this.#memory;
        }
        /** The string encoding of the lift, which `task.return` must match (null if unknown). */
        getReturnStringEncoding() {
            return this.#returnStringEncoding;
        }
        getLiftMemory() {
            return this.#liftMemory;
        }
        setLiftMemory(m: RuntimeMemory | null) {
            this.#liftMemory = m;
        }
        setReturnMemory(m: RuntimeMemory | null | undefined) {
            if (m === null) {
                return;
            }
            this.#memory = m;
        }
        setReturnLowerFns(fns: TaskLowerFn[]) {
            this.#returnLowerFns = fns;
        }
        getReturnLowerFns() {
            return this.#returnLowerFns;
        }
        setCalleeIsAsync(value: boolean) {
            if (typeof value !== 'boolean') {
                throw new TypeError('callee async state must be a boolean');
            }
            this.#calleeIsAsync = value;
        }
        setParentSubtask(subtask: AsyncSubtaskType | null) {
            if (!subtask || !(subtask instanceof this.#context.AsyncSubtask)) {
                return;
            }
            if (this.#parentSubtask) {
                throw new Error('parent subtask can only be set once');
            }
            this.#parentSubtask = subtask;
        }
        getParentSubtask() {
            return this.#parentSubtask;
        }
        // TODO(threads): this is very inefficient, we can pass along a root task,
        // and ideally do not need this once thread support is in place
        getRootTask(): AsyncTaskType {
            let currentSubtask = this.getParentSubtask();
            let task: AsyncTaskType = this;
            while (currentSubtask) {
                task = currentSubtask.getParentTask();
                currentSubtask = task.getParentSubtask();
            }
            return task;
        }
        setPostReturnFn(f?: TaskPostReturn | null) {
            if (!f) {
                return;
            }
            if (this.#postReturnFn) {
                throw new Error('postReturn fn can only be set once');
            }
            this.#postReturnFn = f;
        }
        setCallbackFn(f?: TaskCallback | null, name?: string | null) {
            if (!f) {
                return;
            }
            if (this.#callbackFn) {
                throw new Error('callback fn can only be set once');
            }
            this.#callbackFn = f;
            this.#callbackFnName = name;
        }
        getCallbackFnName() {
            if (!this.#callbackFnName) {
                return undefined;
            }
            return this.#callbackFnName;
        }
        runCallbackFn(...args: number[]) {
            if (!this.#callbackFn) {
                throw new Error('no callback function has been set for task');
            }
            if (this.#callbackFn._jcoMaySuspend === false) {
                return withCurrentTaskMeta(this.#context.registers, {
                    taskID: this.#id,
                    threadID: this.defaultThread().id(),
                    componentIdx: this.#componentIdx,
                    fn: () => this.#callbackFn!.apply(null, args),
                });
            }
            return withCurrentTaskMetaAsync(this.#context.registers, {
                taskID: this.#id,
                threadID: this.defaultThread().id(),
                componentIdx: this.#componentIdx,
                fn: () => {
                    return this.#callbackFn!.apply(null, args);
                },
            });
        }
        getCalleeParams() {
            if (!this.#getCalleeParamsFn) {
                throw new Error('missing/invalid getCalleeParamsFn');
            }
            return this.#getCalleeParamsFn();
        }
        // Whether this task's stack can suspend at all. Legacy manually-async
        // exports are sync-typed in the component but use JSPI precisely so
        // their guest stack may suspend. A sync-typed task whose stack can
        // suspend decides whether it may block when it blocks: it traps only
        // if none of its instance's threads is ready (see `beginSyncCall`).
        mayBlock() {
            return this.isAsync() || this.isManualAsync() || this.isResolvedState() || this.#funcTypeIsAsync;
        }
        // (an async-typed function may block however it was lifted)
        setFuncTypeIsAsync(v: boolean) {
            this.#funcTypeIsAsync = v;
        }
        /**
         * Record that this task is a call of a non-async-typed guest function,
         * in progress until the task resolves. Until then, only threads of its
         * instance are scheduled, and a block with none of them ready traps
         * (Canonical ABI `canon_lift`).
         */
        beginSyncCall() {
            if (this.#syncCall || this.#funcTypeIsAsync || this.#componentIdx === -1 || this.isResolvedState()) {
                return;
            }
            this.#syncCall = true;
            getOrCreateAsyncState(this.#context.lookup, this.#componentIdx).beginSyncCall(this);
        }
        // Tasks entered for host-side import handling are not guest calls.
        #beginGuestSyncCall() {
            if (this.#callingWasmExport) {
                this.beginSyncCall();
            }
        }
        #endSyncCall() {
            if (!this.#syncCall) {
                return;
            }
            this.#syncCall = false;
            getOrCreateAsyncState(this.#context.lookup, this.#componentIdx).endSyncCall(this);
        }
        // The interned result type of the task's function (checked by `task.return`)
        setReturnResultTypeIdx(v: number | null) {
            this.#returnResultTypeIdx = v;
        }
        returnResultTypeIdx() {
            return this.#returnResultTypeIdx;
        }
        mayEnter(task: AsyncTaskType) {
            const cstate = getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);
            if (cstate.hasBackpressure()) {
                DEBUG: debugLog('[AsyncTask#mayEnter()] disallowed due to backpressure', { taskID: this.#id });
                return false;
            }
            if (!cstate.callingSyncImport()) {
                DEBUG: debugLog('[AsyncTask#mayEnter()] disallowed due to sync import call', { taskID: this.#id });
                return false;
            }
            const callingSyncExportWithSyncPending = Reflect.get(cstate, 'callingSyncExport') && !task.isAsync;
            if (!callingSyncExportWithSyncPending) {
                DEBUG: debugLog('[AsyncTask#mayEnter()] disallowed due to sync export w/ sync pending', {
                    taskID: this.#id,
                });
                return false;
            }
            return true;
        }
        enterSync() {
            if (this.needsExclusiveLock()) {
                const cstate = getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);
                if (!cstate.isExclusivelyLocked()) {
                    cstate.exclusiveLock(this.#id);
                } else {
                    // A host-called sync export arriving while another
                    // task's turn holds the lock: synchronous entry
                    // cannot wait, and historically this entry silently
                    // stole the hold. Run without the lock instead --
                    // the holder's bookkeeping stays intact and its
                    // release still pairs
                    this.#lockFreeEntry = true;
                    DEBUG: debugLog('[AsyncTask#enterSync()] entering without exclusive lock', {
                        taskID: this.#id,
                        componentIdx: this.#componentIdx,
                    });
                }
            }
            this.#indexImplicitThread();
            this.#beginGuestSyncCall();
            return true;
        }
        tryEnter() {
            if (this.#entered) {
                throw new Error(`task with ID [${this.#id}] should not be entered twice`);
            }
            if (this.deliverPendingCancel({ cancellable: true })) {
                this.cancel();
                return false;
            }
            const cstate = getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);
            if (!this.#isAsyncEntry()) {
                this.#entered = true;
                this.#indexImplicitThread();
                this.#beginGuestSyncCall();
                return true;
            }
            // Canonical ABI `Task.enter_implicit_thread`: while other tasks
            // wait to enter, a new entry waits at least once as well.
            if (cstate.numWaitingToEnter() > 0 || !this.#mayEnter(cstate)) {
                return null;
            }
            if (this.needsExclusiveLock()) {
                cstate.exclusiveLock(this.#id);
            }
            if (this.deliverPendingCancel({ cancellable: true })) {
                cstate.exclusiveRelease(this.#id);
                this.cancel();
                return false;
            }
            this.#entered = true;
            this.#indexImplicitThread();
            this.#beginGuestSyncCall();
            return true;
        }
        async enter(opts?: { isHost?: boolean }) {
            DEBUG: debugLog('[AsyncTask#enter()] args', {
                taskID: this.#id,
                componentIdx: this.#componentIdx,
                subtaskID: this.getParentSubtask()?.id(),
                args: opts,
                entryFnName: this.#entryFnName,
            });

            if (opts?.isHost) {
                return this.enterHost();
            }

            if (this.#entered) {
                throw new Error(`task with ID [${this.#id}] should not be entered twice`);
            }

            // If cancellation was requested before the task was entered, resolve
            // as cancelled without ever running guest code
            if (this.deliverPendingCancel({ cancellable: true })) {
                this.cancel();
                return false;
            }

            const cstate = getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);

            // NOTE: concurrent task lifetimes within one component instance are
            // permitted by the Component Model: entry is governed by the
            // backpressure and exclusive-lock checks below (the lock is held per
            // execution turn, not for the task's lifetime).
            //
            // Serializing entire task lifetimes here (the former "execution slot" queue)
            // deadlocks pipelines where a parked long-lived task's progress depends on a
            // later entry into the same component.

            // Calls to sync-typed functions are not subject to backpressure or
            // the exclusive lock, and enter immediately.
            if (!this.#isAsyncEntry()) {
                this.#entered = true;
                this.#indexImplicitThread();
                this.#beginGuestSyncCall();
                return this.#entered;
            }

            let entered = false;
            try {
                entered = await this.#enterImplicitThread(cstate);
                return entered;
            } finally {
                if (!entered) {
                    this.endInitialInvocation();
                }
            }
        }
        // The initial invocation of this task ended (it returned, blocked or trapped):
        // the next entry into the instance may be admitted (Canonical ABI
        // `Store.invoke` runs a call until it first blocks or returns).
        endInitialInvocation() {
            if (!this.#holdsEntrySlot) {
                return;
            }
            this.#holdsEntrySlot = false;
            getOrCreateAsyncState(this.#context.lookup, this.#componentIdx).endEntry(this.#id);
        }
        /**
         * @deprecated Former name of `endInitialInvocation`, still called by
         * bindings from jco-transpile 0.24.0 and earlier. Remove in the next
         * breaking release.
         */
        endFirstSlice() {
            this.endInitialInvocation();
        }
        /**
         * The task's thread blocked: its initial invocation is over, and so is the
         * initial invocation of each caller that waits on it through a synchronous
         * lowering, since that caller's thread blocks with it (Canonical ABI
         * `canon_lower`, whose synchronous caller waits once the callee's
         * thread has blocked).
         */
        endInitialInvocationOnBlock() {
            let task: AsyncTaskType = this;
            for (;;) {
                task.endInitialInvocation();
                const subtask = task.getParentSubtask();
                if (!subtask || subtask.isAsync) {
                    return;
                }
                task = subtask.getParentTask();
            }
        }
        // Whether entry into this task's instance is subject to backpressure
        // and, when the task needs it, the exclusive lock. In the Canonical ABI
        // (`Task.enter_implicit_thread`) that is decided by the callee's
        // function type alone, not by how the caller lowered the call.
        #isAsyncEntry() {
            return this.#componentIdx !== -1 && this.#callingWasmExport && this.#funcTypeIsAsync;
        }
        // The condition an entering task waits for (Canonical ABI
        // `has_backpressure`), plus jco's entry slot (see `beginEntry`). A
        // stackful task does not need the exclusive lock, so it does not wait
        // for it.
        #mayEnter(cstate: ComponentAsyncState) {
            if (cstate.entrySlotBusy(this.#id) || cstate.hasBackpressure()) {
                return false;
            }
            return !this.needsExclusiveLock() || !cstate.isExclusivelyLocked();
        }
        // Canonical ABI `Task.enter_implicit_thread`. A task waits when it may
        // not enter yet or other tasks are already waiting to; it then waits
        // only for its own condition, so it is never held behind a waiting task
        // that needs the exclusive lock when it does not need the lock itself.
        async #enterImplicitThread(cstate: ComponentAsyncState) {
            // A task held back only by jco's entry slot is not waiting to
            // enter in the Canonical ABI's sense: the slot stands for the
            // initial invocation of an entry the Canonical ABI would have run to
            // completion already. It waits for its turn at the slot, then
            // checks its own condition like any other entry.
            if (cstate.numWaitingToEnter() === 0 && cstate.entrySlotBusy(this.#id)) {
                await cstate.waitForEntrySlotTurn(this.#id);
            }
            try {
                return await this.#enterImplicitThreadOnTurn(cstate);
            } finally {
                // Once entered the turn is used up; otherwise it passes on.
                cstate.passEntrySlotTurn(this.#id);
            }
        }
        async #enterImplicitThreadOnTurn(cstate: ComponentAsyncState) {
            // Cancelled before it started while it waited for its turn at the
            // entry slot: the task was retired already and must not run.
            if (this.isResolvedState() || this.isCancelled()) {
                return false;
            }
            let keepGoing = true;
            if (cstate.numWaitingToEnter() > 0 || !this.#mayEnter(cstate)) {
                // This task waits through the scheduler, so other entries
                // may take the slot meanwhile.
                cstate.passEntrySlotTurn(this.#id);
                cstate.addWaitingToEnter();
                try {
                    // Another entry may run between this task becoming ready and
                    // resuming, so the condition is checked again once resumed.
                    do {
                        keepGoing = await this.waitUntil({
                            readyFn: () => this.#mayEnter(cstate),
                            cancellable: true,
                        });
                    } while (keepGoing && !this.isResolvedState() && !this.isCancelled() && !this.#mayEnter(cstate));
                } finally {
                    cstate.removeWaitingToEnter();
                }
                // Cancelled before it started while it waited: the task was
                // retired already.
                if (this.isResolvedState() || this.isCancelled()) {
                    return false;
                }
                if (!keepGoing && this.#state === TASK_CANCEL_DELIVERED) {
                    this.cancel();
                    return false;
                }
            }

            // The store may have trapped (e.g. a deadlock was detected) while
            // this task waited to enter: it must not run, and its call fails
            // with that trap.
            try {
                cstate.throwIfInterrupted();
            } catch (err) {
                this.setErrored(err);
                return false;
            }
            if (!keepGoing) {
                return false;
            }

            // Cancellation can be requested while entry is waiting. Do not
            // execute the guest for a task that should no longer start.
            if (this.deliverPendingCancel({ cancellable: true })) {
                this.cancel();
                return false;
            }

            // The initial invocation runs under this hold, and the driver loop
            // releases and re-acquires it per turn thereafter.
            if (this.needsExclusiveLock()) {
                cstate.exclusiveLock(this.#id);
            }
            cstate.beginEntry(this.#id);
            this.#holdsEntrySlot = true;
            this.#entered = true;
            this.#indexImplicitThread();
            this.#beginGuestSyncCall();
            return this.#entered;
        }
        isRunningState() {
            return this.#state !== TASK_RESOLVED;
        }
        isResolvedState() {
            return this.#state === TASK_RESOLVED;
        }
        isResolved() {
            return this.#state === TASK_RESOLVED;
        }
        isExited() {
            return this.#exited;
        }
        hasEntered() {
            return this.#entered;
        }
        async waitUntil(opts: TaskSuspendOptions) {
            const { readyFn, cancellable } = opts;
            DEBUG: debugLog('[AsyncTask#waitUntil()] args', { taskID: this.#id, args: { cancellable } });
            // TODO(fix): check for cancel
            // TODO(fix): determinism
            // TODO(threads): add this thread to waiting list
            const keepGoing = await this.suspendUntil({
                readyFn,
                cancellable,
            });
            return keepGoing;
        }
        async yieldUntil(opts: TaskSuspendOptions) {
            const { readyFn, cancellable } = opts;
            DEBUG: debugLog('[AsyncTask#yieldUntil()]', {
                taskID: this.#id,
                args: {
                    cancellable,
                },
                componentIdx: this.#componentIdx,
            });
            // A callback YIELD is an explicit request to let other work run.
            // Unlike waits whose condition is already ready, it must always
            // suspend for at least one scheduler turn.
            const keepGoing = await this.immediateSuspend({ readyFn, cancellable });
            return {
                code: keepGoing ? this.#context.events.NONE : this.#context.events.TASK_CANCELLED,
                payload0: 0,
                payload1: 0,
            };
        }
        async suspendUntil(opts: TaskSuspendOptions) {
            const { cancellable, readyFn } = opts;
            DEBUG: debugLog('[AsyncTask#suspendUntil()] args', {
                taskID: this.#id,
                args: {
                    cancellable,
                },
                componentIdx: this.#componentIdx,
            });
            const pendingCancelled = this.deliverPendingCancel({ cancellable });
            if (pendingCancelled) {
                return false;
            }
            const completed = await this.immediateSuspendUntil({ readyFn, cancellable });
            return completed;
        }
        suspendUntilCallback(opts: TaskSuspendOptions, onResume: (keepGoing: boolean) => void) {
            const { cancellable, readyFn } = opts;
            if (this.deliverPendingCancel({ cancellable })) {
                onResume(false);
                return;
            }
            const cstate = getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);
            cstate.suspendTask({
                task: this,
                cancellable: !!cancellable,
                readyFn: () => {
                    if (cancellable && this.#state === TASK_CANCEL_PENDING) {
                        return true;
                    }
                    return readyFn();
                },
                onResume: (keepGoing) => {
                    if (keepGoing && this.deliverPendingCancel({ cancellable })) {
                        keepGoing = false;
                    }
                    onResume(keepGoing);
                },
            });
        }
        // TODO(threads): equivalent to thread.suspend_until()
        async immediateSuspendUntil(opts: TaskSuspendOptions) {
            const { cancellable, readyFn } = opts;
            DEBUG: debugLog('[AsyncTask#immediateSuspendUntil()] args', {
                args: {
                    cancellable,
                    readyFn,
                },
                taskID: this.#id,
                componentIdx: this.#componentIdx,
            });
            const ready = readyFn();
            if (ready && this.#context.determinism === 'random') {
                const coinFlip = _coinFlip();
                if (coinFlip) {
                    return true;
                }
            }
            const keepGoing = await this.immediateSuspend({ cancellable, readyFn });
            return keepGoing;
        }
        async immediateSuspend(opts: TaskSuspendOptions) {
            // Entry can wait on backpressure before a guest register window exists.
            const cstate = getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);
            const thread = this.#entered
                ? (cstate.threads.get(readTaskRegister(this.#context.registers, this.#componentIdx)!.threadID) as
                      | AsyncThreadType
                      | undefined)
                : this.defaultThread();
            if (!thread || thread.task() !== this) {
                throw new Error('invalid current thread for wait');
            }
            // Suspending a core Wasm stack retains the task's exclusive
            // lock. Only a callback return releases it between turns.
            return thread.suspend({ ...opts, releaseLock: false });
        }
        deliverPendingCancel(opts: { cancellable?: boolean }) {
            const { cancellable } = opts;
            DEBUG: debugLog('[AsyncTask#deliverPendingCancel()]', {
                args: { cancellable },
                taskID: this.#id,
                componentIdx: this.#componentIdx,
            });
            if (cancellable && this.#state === TASK_CANCEL_PENDING) {
                this.#state = TASK_CANCEL_DELIVERED;
                return true;
            }
            return false;
        }
        isCancelled() {
            return this.cancelled;
        }
        cancellationRequested() {
            return this.cancelRequested;
        }
        // Request cooperative cancellation of this task, called on behalf of a
        // supertask performing `subtask.cancel` on the subtask this task backs.
        //
        // The request is delivered at this task's next cancellable wait
        // (see suspendUntil/immediateSuspend), at which point the task is
        // expected to acknowledge via `task.cancel` or still resolve via
        // `task.return`.
        requestCancellation() {
            DEBUG: debugLog('[AsyncTask#requestCancellation()] args', {
                taskID: this.#id,
                componentIdx: this.#componentIdx,
                state: this.#state,
            });
            if (this.isResolvedState() || this.cancelRequested) {
                return;
            }
            this.cancelRequested = true;
            if (this.#state === TASK_INITIAL) {
                this.#state = TASK_CANCEL_PENDING;
                // A task still waiting for backpressure or its
                // initial instance lock has no guest thread to
                // resume. Cancellation is therefore delivered
                // and acknowledged eagerly as
                // CANCELLED_BEFORE_STARTED.
                if (!this.#entered) {
                    this.deliverPendingCancel({ cancellable: true });
                    this.cancel();
                    const cstate = getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);
                    // `enter()` may already be parked either in the scheduler's
                    // explicit-backpressure wait or in the exclusive-lock FIFO.
                    // Wake/remove that entry work now so it cannot retain a timer,
                    // waiter count, or lock-queue slot after cancellation.
                    cstate.resumeTaskByID(this.#id);
                    cstate.cancelExclusiveLockWaiter(this.#id);
                    // No guest thread was registered, so no driver loop will call
                    // `exit()`. Retire the task's JS bookkeeping explicitly.
                    this.exit({ skipExclusiveLockCheck: true });
                    return;
                }
            }
            // Nudge the component's tick loop so that any suspended cancellable
            // wait observes the pending cancellation promptly
            getOrCreateAsyncState(this.#context.lookup, this.#componentIdx).runTickLoop();
        }
        cancel(args?: { error?: unknown }) {
            DEBUG: debugLog('[AsyncTask#cancel()] args', {});
            if (this.taskState() !== TASK_CANCEL_DELIVERED) {
                throw new this.#context.RuntimeError('`task.cancel` called by task which has not been cancelled');
            }
            this.validateResourceBorrowScope();
            this.cancelled = true;
            // Cancelled tasks resolve with no value (spec: `Task.cancel` calls
            // `on_resolve(None)`); an explicit error is only present on the
            // host-driven rejection path (see `reject()`).
            this.onResolve(args?.error ?? null);
            this.#state = TASK_RESOLVED;
            this.#endSyncCall();
            // A task cancelled before entry has no driver loop that can
            // report its exit. Entered tasks notify after releasing their
            // component turn in `exit()`.
            if (!this.#entered) {
                this.notifyProgress();
            }
        }
        onResolve(taskValue: unknown) {
            const handlers = this.#onResolveHandlers ?? NONE;
            this.#onResolveHandlers = null;
            for (const f of handlers) {
                try {
                    f(taskValue);
                } catch (err) {
                    DEBUG: debugLog('[AsyncTask#onResolve] error during task resolve handler', err);
                    throw err;
                }
            }
            // Rejections are control-flow failures, not canonical ABI results.
            // Propagate them through the subtask chain without running return
            // lowering or post-return hooks for a successful result.
            if (this.#rejected) {
                this.#parentSubtask?.reject(taskValue);
                return;
            }
            // NOTE: if the parent subtask has already been resolved (e.g. it was
            // cancelled via `subtask.cancel` while this task was still pending),
            // this task's resolution must be discarded rather than delivered.
            const parentSubtaskPending = this.#parentSubtask && !this.#parentSubtask.isResolved();
            const taskReturned = !this.isCancelled();
            if (parentSubtaskPending && taskReturned) {
                const meta = this.#parentSubtask!.getCallMetadata();
                // Run the rturn fn if it has not already been called -- this *should* have happened in
                // `task.return`, but some paths do not go through task.return (e.g. async lower of sync fn
                // which goes through prepare + async-start-call)
                if (meta.returnFn && !meta.returnFnCalled) {
                    DEBUG: debugLog('[AsyncTask#onResolve()] running returnFn', {
                        componentIdx: this.#componentIdx,
                        taskID: this.#id,
                        subtaskID: this.#parentSubtask!.id(),
                    });
                    const callerTask = this.#parentSubtask!.getParentTask();
                    meta.returnFnResult = withCurrentTaskMeta(this.#context.registers, {
                        taskID: callerTask.id(),
                        threadID: meta.callerThreadID!,
                        componentIdx: callerTask.componentIdx(),
                        fn: () => meta.returnFn!.apply(null, [taskValue, meta.resultPtr]),
                    });
                    meta.returnFnCalled = true;
                }
            }
            if (this.#postReturnFn && taskReturned) {
                DEBUG: debugLog('[AsyncTask#onResolve()] running post return ', {
                    componentIdx: this.#componentIdx,
                    taskID: this.#id,
                });
                try {
                    withCurrentTaskMeta(this.#context.registers, {
                        taskID: this.#id,
                        threadID: this.defaultThread().id(),
                        componentIdx: this.#componentIdx,
                        fn: () => this.#postReturnFn!(taskValue),
                    });
                } catch (err) {
                    err = postReturnTrap(this.#context.postReturn, this.#componentIdx, err);
                    this.reject(err);
                    throw err;
                }
            }
            if (parentSubtaskPending) {
                this.#parentSubtask!.onResolve(taskValue);
            }
        }
        registerOnResolveHandler(f: (value: unknown) => void) {
            (this.#onResolveHandlers ??= []).push(f);
        }
        isRejected() {
            return this.#rejected;
        }
        isErrored() {
            return this.#errored;
        }
        setErrored(err: unknown) {
            // Preserve the originating trap when unwinding through
            // additional guest frames produces secondary traps (often
            // an `unreachable` after a call which was expected to trap).
            if (this.#errored === null) {
                this.#errored = err;
            }
        }
        stop(err: unknown) {
            this.reject(err);
            // Publish rejection even while a JSPI stack awaits a host import.
            this.#completionReady = true;
            this.#settleCompletionPromise();
        }
        reject(taskErr: unknown) {
            DEBUG: debugLog('[AsyncTask#reject()] args', {
                componentIdx: this.#componentIdx,
                taskID: this.#id,
                parentSubtask: this.#parentSubtask,
                parentSubtaskID: this.#parentSubtask?.id(),
                entryFnName: this.entryFnName(),
                callbackFnName: this.#callbackFnName,
                errMsg: (
                    taskErr as {
                        message?: unknown;
                    }
                ).message,
            });
            this.setErrored(taskErr);
            if (this.#rejected) {
                return;
            }
            // A task may call `task.return` before its callback exits.
            // A trap in cleanup or spawned work must still reject the
            // host call and poison the enclosing task chain.
            if (this.isResolvedState()) {
                this.#rejected = true;
                this.#errored = taskErr;
                const parentTask = this.#parentSubtask?.getParentTask();
                if (parentTask) {
                    parentTask.reject(taskErr);
                }
                return;
            }
            this.#rejected = true;
            this.cancelRequested = true;
            this.#state = TASK_CANCEL_PENDING;
            this.deliverPendingCancel({ cancellable: true });
            // TODO: do cleanup here to reset the machinery so we can run again?
            this.cancel({ error: taskErr });

            // A task whose threads all exited unresolved has no thread left to
            // settle its completion on exit, so settle it here.
            if (this.#exited && this.#threads.length === 0) {
                this.#settleCompletionPromise();
            }
        }
        resolve(results: unknown[]) {
            DEBUG: debugLog('[AsyncTask#resolve()] args', {
                componentIdx: this.#componentIdx,
                taskID: this.#id,
                entryFnName: this.entryFnName(),
                callbackFnName: this.#callbackFnName,
            });
            if (this.#state === TASK_RESOLVED) {
                if (this.#errored !== null) {
                    throw this.#errored;
                }
                throw new this.#context.RuntimeError(TASK_ALREADY_RESOLVED);
            }
            this.validateResourceBorrowScope();
            this.#state = TASK_RESOLVED;
            this.#endSyncCall();
            switch (results.length) {
                case 0:
                    this.onResolve(undefined);
                    break;
                case 1:
                    this.onResolve(results[0]);
                    break;
                default:
                    DEBUG: debugLog('[AsyncTask#resolve()] unexpected number of results', {
                        componentIdx: this.#componentIdx,
                        results,
                        taskID: this.#id,
                        subtaskID: this.#parentSubtask?.id(),
                        entryFnName: this.#entryFnName,
                        callbackFnName: this.#callbackFnName,
                    });
                    throw new Error('unexpected number of results');
            }
        }
        exit(args?: { skipExclusiveLockCheck?: boolean }) {
            DEBUG: debugLog('[AsyncTask#exit()]', {
                componentIdx: this.#componentIdx,
                taskID: this.#id,
            });

            this.endInitialInvocation();
            this.#endSyncCall();
            if (this.#exited) {
                throw new Error('task has already exited');
            }

            // Validate before publishing exit or running its handlers.
            // Otherwise a failed exit leaves #exited true, so the driver
            // cannot finish rejection cleanup and settle the host call.
            this.validateResourceBorrowScope();

            // Host (-1) tasks have no component instance (and so no async
            // state or exclusive lock); do not materialise one for them.
            const state =
                this.#componentIdx === -1 ? null : getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);
            if (!state && this.#componentIdx !== -1) {
                throw new Error('missing async state for component [' + this.#componentIdx + ']');
            }

            if (state && !args?.skipExclusiveLockCheck && !this.#lockFreeEntry) {
                if (this.needsExclusiveLock() && !state.exclusivelyLockedBy(this.#id)) {
                    throw new Error(
                        `task [${this.#id}] exit: component [${this.#componentIdx}] should have been exclusively locked by it`,
                    );
                }
            }

            // Ownership-checked: releases only this task's own hold (a
            // task exiting while another task's turn holds the lock no
            // longer clears the foreign hold).
            if (state) {
                state.exclusiveRelease(this.#id);
            }
            this.notifyProgress();

            try {
                if (this.#parentSubtask === null && (this.#isAsync || this.#isManualAsync)) {
                    this.#settleCompletionPromise();
                }
                this.#resolveExitPromise?.();
            } catch (err) {
                console.error('error during task exit handler', err);
                throw err;
            }

            this.#exited = true;
            this.removeThread(this.defaultThread());
            if (this.#threads.length > 0) {
                clearCurrentThread(this.#context.clearing, this.#componentIdx, this.#id, { preserveTask: true });
            }
        }
        needsExclusiveLock() {
            // Host (-1) tasks model host-side import handling: there is no
            // guest linear memory or executor state to protect, and host
            // calls from unrelated guest components would contend spuriously.
            if (this.#componentIdx === -1) {
                return false;
            }
            // Import-handler tasks (CallInterface) run host code nested
            // inside the calling guest turn, which already holds the
            // lock; only tasks that execute guest turns need it.
            if (!this.#callingWasmExport) {
                return false;
            }
            // Automatic backpressure only applies to async function
            // types. A sync-typed call may run ready callback threads
            // before returning, so holding this lock would deadlock it.
            if (!this.#funcTypeIsAsync) {
                return false;
            }
            // Canonical ABI `Task.needs_exclusive`: a sync-lifted or
            // callback-lifted callee needs the lock, a stackful one does not.
            // This depends on the callee's lift options, not on how the caller
            // lowered the call.
            return !this.#liftIsAsync() || this.hasCallback();
        }
        // Whether the callee was lifted async. Tasks that are not told the
        // lift options separately were created with them.
        #liftIsAsync() {
            return this.#calleeIsAsync ?? this.#isAsync;
        }
        createSubtask(args: CreateSubtaskOptions) {
            DEBUG: debugLog('[AsyncTask#createSubtask()] args', args);
            const { componentIdx, childTask, callMetadata, fnName, isAsync, isManualAsync } = args;
            const cstate = getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);
            if (!cstate) {
                throw new Error(`invalid/missing async state for component idx [${componentIdx}]`);
            }
            const waitable = new this.#context.Waitable({
                componentIdx: this.#componentIdx,
                target: `subtask (internal ID [${this.#id}])`,
            });
            const newSubtask = new this.#context.AsyncSubtask({
                componentIdx,
                childTask,
                parentTask: this,
                callMetadata,
                isAsync,
                isManualAsync,
                fnName,
                waitable,
            });
            (this.#subtasks ??= []).push(newSubtask);
            newSubtask.setTarget(
                `subtask (internal ID [${newSubtask.id()}], waitable [${waitable.idx()}], component [${componentIdx}])`,
            );
            // The subtask gets a handle index in this task's table only once the
            // guest is given it (see `AsyncSubtask#ensureHandle`).
            return newSubtask;
        }
        getLatestSubtask() {
            return this.#subtasks?.at(-1);
        }
        getSubtaskByWaitableRep(rep: number) {
            if (rep === undefined) {
                throw new TypeError('missing rep');
            }
            return this.#subtasks?.find((s) => s.waitableRep() === rep);
        }
        currentSubtask() {
            DEBUG: debugLog('[AsyncTask#currentSubtask()]');
            if (this.#subtasks === null || this.#subtasks.length === 0) {
                return undefined;
            }
            return this.#subtasks?.at(-1);
        }
        removeSubtask(subtask: AsyncSubtaskType) {
            const subtasks = this.#subtasks;
            if (subtasks === null || subtasks.length === 0) {
                throw new Error('cannot end current subtask: no current subtask');
            }

            // The subtask that ends is nearly always the one started last.
            if (subtasks[subtasks.length - 1] === subtask) {
                subtasks.pop();
            } else {
                this.#subtasks = subtasks.filter((t) => t !== subtask);
            }
            return subtask;
        }
        cancellationPending() {
            return this.#state === TASK_CANCEL_PENDING;
        }

        enterHost() {
            if (this.#entered) {
                throw new Error(`task with ID [${this.#id}] should not be entered twice`);
            }

            // If cancellation was requested before the task was entered, resolve
            // as cancelled without ever running host code
            if (this.deliverPendingCancel({ cancellable: true })) {
                this.cancel();
                return false;
            }

            getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);

            this.#entered = true;
            // A guest task may be synchronously blocked in this
            // host entry. Propagate that boundary so an async
            // cancellation driver can yield BLOCKED while the host
            // operation is outstanding.
            const parentTask = this.#parentSubtask?.getParentTask();
            if (parentTask?.taskState() === TASK_CANCEL_DELIVERED || (parentTask && !parentTask.hasCallback())) {
                parentTask.notifyProgress();
            }
            return this.#entered;
        }

        defaultThread() {
            return this.#threads[0];
        }

        removeThread(thread: AsyncThreadType) {
            this.settleCompletion();
            const cstate =
                this.#componentIdx === -1 ? null : getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);
            // A task that never entered holds no index to release.
            if (cstate && thread.hasIndex()) {
                cstate.threads.remove(thread.id());
            }
            if (this.#threads[this.#threads.length - 1] === thread) {
                this.#threads.pop();
            } else {
                this.#threads = this.#threads.filter((t) => t !== thread);
            }
            syncContextSlots(this.#context.registers);

            // The last thread of a task may exit before the task resolves. That
            // is not a trap (Canonical ABI `Task.exit_implicit_thread`,
            // component-model#767): the task stays unresolved for good, and only
            // a caller that waits on it is affected.
            if (cstate && this.#threads.length === 0 && !this.isResolvedState() && !this.isRejected()) {
                cstate.noteUnresolvedExit(this);
            }
            // A thread exiting returns control to a sync call in progress,
            // which goes on only if it can (Canonical ABI `canon_lift`).
            cstate?.checkSyncCallBlocked();

            if (this.#exited && this.#threads.length === 0) {
                clearCurrentThread(this.#context.clearing, this.#componentIdx, this.#id);
            }
        }

        addThread(thread: AsyncThreadType, opts?: { indexOnEntry?: boolean }) {
            // Host (-1) tasks model host-side import handling: there is no
            // component instance behind them, so no instance thread table to
            // register with (and none may be materialised on their behalf).
            if (this.#componentIdx === -1) {
                thread.setId(++this.#store.hostThreadID);
                this.#threads.push(thread);
                return thread;
            }
            this.#threads.push(thread);
            if (!opts?.indexOnEntry) {
                this.#insertThread(thread);
            }
            return thread;
        }

        #insertThread(thread: AsyncThreadType) {
            const cstate = getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);
            thread.setId(cstate.threads.insert(thread));
            syncContextSlots(this.#context.registers);
        }

        // Canonical ABI `Task.enter_implicit_thread`: the implicit thread gets
        // its index in the instance's thread table once the task enters,
        // after any wait for backpressure or the exclusive lock, so a task
        // that is still waiting holds no index.
        #indexImplicitThread() {
            const thread = this.defaultThread();
            if (this.#componentIdx === -1 || !thread || thread.hasIndex()) {
                return;
            }
            this.#insertThread(thread);
        }

        calleeIsAsync() {
            return this.#calleeIsAsync === true;
        }
    };
}
let sharedAsyncTask: ReturnType<typeof defineAsyncTask>;

export function initializeAsyncTaskClass(context: AsyncTaskClassContext): AsyncTaskConstructor {
    const AsyncTask = (sharedAsyncTask ??= defineAsyncTask());
    const store: { id: bigint; hostThreadID: number } = { id: 0n, hostThreadID: 0 };

    /**
     * Construct a task that uses the context.
     *
     * @param options - options of the task
     * @returns the task
     */
    class ContextAsyncTask extends AsyncTask {
        constructor(options: ConstructorParameters<typeof AsyncTask>[2]) {
            super(context, store, options);
        }
    }
    return withConstructorStatics(ContextAsyncTask, {
        _ID: {
            get: () => store.id,
            set: (id: bigint) => {
                store.id = id;
            },
            enumerable: true,
        },
        State: { value: { ...AsyncTask.State }, enumerable: true },
        BlockResult: { value: { ...AsyncTask.BlockResult }, enumerable: true },
    });
}
