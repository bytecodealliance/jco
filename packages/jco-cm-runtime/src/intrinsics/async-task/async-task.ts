import type {
    AsyncTaskClassContext,
    AsyncTaskConstructor,
    TaskState,
    RuntimeMemory,
    TaskCallback,
    TaskPostReturn,
    AdmissionTicket,
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
import { promiseWithResolvers } from '../core-promises.js';
import { withCurrentTaskMeta, withCurrentTaskMetaAsync, getCurrentTaskMeta } from '../task-context.js';
import { getOrCreateAsyncState, postReturnTrap, recordTrap } from '../component.js';
import { debugLog } from '../core-debug.js';
import { coinFlip as _coinFlip } from '../core.js';
import { clearCurrentThread } from './task-operations.js';

export function initializeAsyncTaskClass(context: AsyncTaskClassContext): AsyncTaskConstructor {
    const {
        lookup: _lookup,
        registers: _registers,
        clearing: _clearing,
        RuntimeError: _RuntimeError,
        AsyncSubtask: _Subtask,
        Waitable: _Waitable,
        events: _events,
        determinism: _determinism,
        isFutureValue: _isFutureValue,
        scopeCounter: _scopeCounter,
        scopeTasks: _scopeTasks,
    } = context;
    class AsyncTask {
        static _ID = 0n;
        static _HOST_THREAD_ID = 0;
        static State = {
            INITIAL: 'initial',
            CANCELLED: 'cancelled',
            CANCEL_PENDING: 'cancel-pending',
            CANCEL_DELIVERED: 'cancel-delivered',
            RESOLVED: 'resolved',
        } as const;
        static BlockResult = {
            CANCELLED: 'block.cancelled',
            NOT_CANCELLED: 'block.not-cancelled',
        } as const;
        // Keep the private brand per store; initialize its slots with one private record.
        #fields: {
            id: bigint;
            componentIdx: number;
            state: TaskState;
            isAsync: boolean;
            isManualAsync: boolean;
            callingWasmExport: boolean;
            lockFreeEntry: boolean;
            preserveFutureResult: boolean;
            entryFnName: string | undefined;
            onResolveHandlers: ((value: unknown) => void)[];
            progressWaiters: (() => void)[];
            completionPromise: Promise<unknown>;
            completionValue: unknown;
            completionReady: boolean;
            settleCompletionPromise: () => void;
            rejected: boolean;
            exitPromise: Promise<void>;
            onExitHandlers: (() => void)[];
            memoryIdx: number | null | undefined;
            memory: RuntimeMemory | null | undefined;
            callbackFn: TaskCallback | null;
            callbackFnName: string | null | undefined;
            postReturnFn: TaskPostReturn | null;
            getCalleeParamsFn: (() => unknown[]) | null;
            calleeIsAsync: boolean | null;
            admissionTicket: AdmissionTicket | null;
            funcTypeIsAsync: boolean;
            returnResultTypeIdx: number | null;
            stringEncoding: string | null;
            parentSubtask: AsyncSubtaskType | null;
            errHandling: unknown;
            backpressurePromise: Promise<unknown> | undefined;
            backpressureWaiters: bigint;
            returnLowerFns: TaskLowerFn[] | null;
            resourceScopeId: number;
            resourceBorrowCount: number;
            resourceLenders: {
                table: ResourceTable;
                handle: number;
            }[];
            resourceScopeExited: boolean;
            subtasks: AsyncSubtaskType[];
            threads: AsyncThreadType[];
            entered: boolean;
            exited: boolean;
            errored: unknown;
        } = {
            id: undefined!,
            componentIdx: undefined!,
            state: undefined!,
            isAsync: undefined!,
            isManualAsync: undefined!,
            callingWasmExport: true,
            lockFreeEntry: false,
            preserveFutureResult: undefined!,
            entryFnName: undefined,
            onResolveHandlers: [],
            progressWaiters: [],
            completionPromise: undefined!,
            completionValue: undefined!,
            completionReady: false,
            settleCompletionPromise: undefined!,
            rejected: false,
            exitPromise: undefined!,
            onExitHandlers: [],
            memoryIdx: null,
            memory: null,
            callbackFn: null,
            callbackFnName: null,
            postReturnFn: null,
            getCalleeParamsFn: null,
            calleeIsAsync: null,
            admissionTicket: null,
            funcTypeIsAsync: false,
            returnResultTypeIdx: null,
            stringEncoding: null,
            parentSubtask: null,
            errHandling: undefined!,
            backpressurePromise: undefined!,
            backpressureWaiters: 0n,
            returnLowerFns: null,
            resourceScopeId: undefined!,
            resourceBorrowCount: 0,
            resourceLenders: [],
            resourceScopeExited: false,
            subtasks: [],
            threads: [],
            entered: false,
            exited: false,
            errored: null,
        };

        get storage() {
            return this.defaultThread().storage;
        }
        cancelled = false;
        cancelRequested = false;
        alwaysTaskReturn = false;
        returnCalls = 0;
        tmpRetI64HighBits = 0 | 0;
        constructor(opts: AsyncTaskOptions) {
            this.#fields.id = ++AsyncTask._ID;
            this.#fields.resourceScopeId = ++_scopeCounter.value;
            _scopeTasks.set(this.#fields.resourceScopeId, this);
            if (opts?.componentIdx === undefined) {
                throw new TypeError('missing component id during task creation');
            }
            this.#fields.componentIdx = opts.componentIdx;
            this.#fields.state = AsyncTask.State.INITIAL;
            this.#fields.isAsync = opts?.isAsync ?? false;
            this.#fields.isManualAsync = opts?.isManualAsync ?? false;
            this.#fields.preserveFutureResult = opts?.preserveFutureResult ?? false;
            this.#fields.entryFnName = opts.entryFnName;
            // Tasks that execute guest slices (export calls, fused
            // callees) default to true; import-handler tasks pass false
            // explicitly (they run host code nested inside the caller's
            // already-locked slice).
            this.#fields.callingWasmExport = opts?.callingWasmExport !== false;
            const {
                promise: completionPromise,
                resolve: resolveCompletionPromise,
                reject: rejectCompletionPromise,
            } = promiseWithResolvers();
            this.#fields.completionPromise = completionPromise;
            // A nested rejection can reach the root task while its Wasm
            // entrypoint is still suspended, before the export wrapper awaits
            // this promise. Mark it handled immediately while preserving the
            // original rejected promise for the eventual caller.
            // Do not forward successful results into a derived promise: that
            // would assimilate a returned future and read it before the host.
            completionPromise.then(
                () => {},
                () => {},
            );
            let completionSettled = false;
            const settleCompletionPromise = () => {
                if (completionSettled || !this.#fields.completionReady) {
                    return;
                }
                completionSettled = true;
                if (this.#fields.errored !== null) {
                    rejectCompletionPromise(this.#fields.errored);
                } else if (this.#fields.rejected) {
                    rejectCompletionPromise(this.#fields.completionValue);
                } else if (this.#fields.preserveFutureResult && _isFutureValue(this.#fields.completionValue)) {
                    this.#fields.completionValue.resolveAsValue(resolveCompletionPromise);
                } else {
                    resolveCompletionPromise(this.#fields.completionValue);
                }
            };
            this.#fields.settleCompletionPromise = settleCompletionPromise;
            this.#fields.onResolveHandlers.push((results) => {
                if (this.#fields.parentSubtask !== null) {
                    return;
                }
                if (!this.#fields.isAsync && !this.#fields.isManualAsync) {
                    return;
                }
                this.#fields.completionValue = results;
                this.#fields.completionReady = true;
                // Publish after the current guest slice returns, so a trap
                // in that slice can still reject the call. Do not wait for
                // task exit: detached work may require further host calls
                // or consumption of a returned resource's stream.
            });
            const { promise: exitPromise, resolve: resolveExitPromise } = promiseWithResolvers<void>();
            this.#fields.exitPromise = exitPromise;
            this.#fields.onExitHandlers.push(() => {
                if (this.#fields.parentSubtask === null && (this.#fields.isAsync || this.#fields.isManualAsync)) {
                    settleCompletionPromise();
                }
                resolveExitPromise();
            });
            if (opts.callbackFn) {
                this.#fields.callbackFn = opts.callbackFn;
            }
            if (opts.callbackFnName) {
                this.#fields.callbackFnName = opts.callbackFnName;
            }
            if (opts.getCalleeParamsFn) {
                this.#fields.getCalleeParamsFn = opts.getCalleeParamsFn;
            }
            if (opts.stringEncoding) {
                this.#fields.stringEncoding = opts.stringEncoding;
            }
            if (opts.parentSubtask) {
                this.#fields.parentSubtask = opts.parentSubtask;
            }
            if (opts.errHandling) {
                this.#fields.errHandling = opts.errHandling;
            }
        }
        taskState() {
            return this.#fields.state;
        }
        id() {
            return this.#fields.id;
        }
        componentIdx() {
            return this.#fields.componentIdx;
        }
        entryFnName() {
            return this.#fields.entryFnName;
        }
        resourceScopeId() {
            return this.#fields.resourceScopeId;
        }
        addBorrowedHandle() {
            if (this.#fields.resourceScopeExited) {
                throw new Error('cannot add a borrow to an exited resource scope');
            }
            this.#fields.resourceBorrowCount++;
        }
        removeBorrowedHandle() {
            if (this.#fields.resourceBorrowCount === 0) {
                throw new Error('resource borrow count underflow');
            }
            this.#fields.resourceBorrowCount--;
        }
        addResourceLender(table: ResourceTable, handle: number) {
            if (this.#fields.resourceScopeExited) {
                throw new Error('cannot add a lender to an exited resource scope');
            }
            this.#fields.resourceLenders.push({ table, handle });
        }
        validateResourceBorrowScope() {
            if (this.#fields.resourceScopeExited) {
                return;
            }
            if (this.#fields.resourceBorrowCount !== 0) {
                throw new _RuntimeError('borrow handles still remain at the end of the call');
            }
            for (const { table, handle } of this.#fields.resourceLenders) {
                const idx = handle << 1;
                const lendCount = table[idx];
                if (!Number.isInteger(lendCount) || lendCount <= 0 || lendCount >= 2 ** 30) {
                    throw new Error('invalid resource lender state at scope exit');
                }
                table[idx] = lendCount - 1;
            }
            this.#fields.resourceLenders = [];
            this.#fields.resourceScopeExited = true;
            _scopeTasks.delete(this.#fields.resourceScopeId);
        }
        completionPromise() {
            return this.#fields.completionPromise;
        }
        settleCompletion() {
            this.#fields.settleCompletionPromise();
        }
        exitPromise() {
            return this.#fields.exitPromise;
        }
        waitForProgress() {
            const { promise, resolve } = promiseWithResolvers<void>();
            this.#fields.progressWaiters.push(resolve);
            return promise;
        }
        notifyProgress() {
            const waiters = this.#fields.progressWaiters;
            this.#fields.progressWaiters = [];
            for (const resolve of waiters) {
                resolve();
            }
        }
        isAsync() {
            return this.#fields.isAsync;
        }
        isManualAsync() {
            return this.#fields.isManualAsync;
        }
        isSync() {
            return !this.isAsync();
        }
        getErrHandling() {
            return this.#fields.errHandling;
        }
        hasCallback() {
            return this.#fields.callbackFn !== null;
        }
        getReturnMemoryIdx() {
            return this.#fields.memoryIdx;
        }
        setReturnMemoryIdx(idx: number | null | undefined) {
            if (idx === null) {
                return;
            }
            this.#fields.memoryIdx = idx;
        }
        getReturnMemory() {
            return this.#fields.memory;
        }
        setReturnMemory(m: RuntimeMemory | null | undefined) {
            if (m === null) {
                return;
            }
            this.#fields.memory = m;
        }
        setReturnLowerFns(fns: TaskLowerFn[]) {
            this.#fields.returnLowerFns = fns;
        }
        getReturnLowerFns() {
            return this.#fields.returnLowerFns;
        }
        setCalleeIsAsync(value: boolean) {
            if (typeof value !== 'boolean') {
                throw new TypeError('callee async state must be a boolean');
            }
            this.#fields.calleeIsAsync = value;
        }
        setParentSubtask(subtask: AsyncSubtaskType | null) {
            if (!subtask || !(subtask instanceof _Subtask)) {
                return;
            }
            if (this.#fields.parentSubtask) {
                throw new Error('parent subtask can only be set once');
            }
            this.#fields.parentSubtask = subtask;
        }
        getParentSubtask() {
            return this.#fields.parentSubtask;
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
            if (this.#fields.postReturnFn) {
                throw new Error('postReturn fn can only be set once');
            }
            this.#fields.postReturnFn = f;
        }
        setCallbackFn(f?: TaskCallback | null, name?: string | null) {
            if (!f) {
                return;
            }
            if (this.#fields.callbackFn) {
                throw new Error('callback fn can only be set once');
            }
            this.#fields.callbackFn = f;
            this.#fields.callbackFnName = name;
        }
        getCallbackFnName() {
            if (!this.#fields.callbackFnName) {
                return undefined;
            }
            return this.#fields.callbackFnName;
        }
        runCallbackFn(...args: number[]) {
            if (!this.#fields.callbackFn) {
                throw new Error('no callback function has been set for task');
            }
            if (this.#fields.callbackFn._jcoMaySuspend === false) {
                return withCurrentTaskMeta(_registers, {
                    taskID: this.#fields.id,
                    threadID: this.defaultThread().id(),
                    componentIdx: this.#fields.componentIdx,
                    fn: () => this.#fields.callbackFn!.apply(null, args),
                });
            }
            return withCurrentTaskMetaAsync(_registers, {
                taskID: this.#fields.id,
                threadID: this.defaultThread().id(),
                componentIdx: this.#fields.componentIdx,
                fn: () => {
                    return this.#fields.callbackFn!.apply(null, args);
                },
            });
        }
        getCalleeParams() {
            if (!this.#fields.getCalleeParamsFn) {
                throw new Error('missing/invalid getCalleeParamsFn');
            }
            return this.#fields.getCalleeParamsFn();
        }
        // Legacy manually-async exports are sync-typed in the component
        // but use JSPI precisely so their guest stack may suspend.
        // Canonical ABI: only sync-typed callees may not block (`canon_lift`);
        // an async-lifted callee may, even when called through a sync lowering.
        mayBlock() {
            return this.isAsync() || this.isManualAsync() || this.isResolvedState() || this.#fields.funcTypeIsAsync;
        }
        // (an async-typed function may block however it was lifted)
        setFuncTypeIsAsync(v: boolean) {
            this.#fields.funcTypeIsAsync = v;
        }
        // The interned result type of the task's function (checked by `task.return`)
        setReturnResultTypeIdx(v: number | null) {
            this.#fields.returnResultTypeIdx = v;
        }
        returnResultTypeIdx() {
            return this.#fields.returnResultTypeIdx;
        }
        mayEnter(task: AsyncTaskType) {
            const cstate = getOrCreateAsyncState(_lookup, this.#fields.componentIdx);
            if (cstate.hasBackpressure()) {
                debugLog('[AsyncTask#mayEnter()] disallowed due to backpressure', { taskID: this.#fields.id });
                return false;
            }
            if (!cstate.callingSyncImport()) {
                debugLog('[AsyncTask#mayEnter()] disallowed due to sync import call', { taskID: this.#fields.id });
                return false;
            }
            const callingSyncExportWithSyncPending = Reflect.get(cstate, 'callingSyncExport') && !task.isAsync;
            if (!callingSyncExportWithSyncPending) {
                debugLog('[AsyncTask#mayEnter()] disallowed due to sync export w/ sync pending', {
                    taskID: this.#fields.id,
                });
                return false;
            }
            return true;
        }
        enterSync() {
            if (this.needsExclusiveLock()) {
                const cstate = getOrCreateAsyncState(_lookup, this.#fields.componentIdx);
                if (!cstate.isExclusivelyLocked()) {
                    cstate.exclusiveLock(this.#fields.id);
                } else {
                    // A host-called sync export arriving while another
                    // task's slice holds the lock: synchronous entry
                    // cannot wait, and historically this entry silently
                    // stole the hold. Run without the lock instead --
                    // the holder's bookkeeping stays intact and its
                    // release still pairs
                    this.#fields.lockFreeEntry = true;
                    debugLog('[AsyncTask#enterSync()] entering without exclusive lock', {
                        taskID: this.#fields.id,
                        threadID: this.defaultThread().id(),
                        componentIdx: this.#fields.componentIdx,
                    });
                }
            }
            return true;
        }
        tryEnter() {
            if (this.#fields.entered) {
                throw new Error(`task with ID [${this.#fields.id}] should not be entered twice`);
            }
            if (this.deliverPendingCancel({ cancellable: true })) {
                this.cancel();
                return false;
            }
            const cstate = getOrCreateAsyncState(_lookup, this.#fields.componentIdx);
            if (this.isSync()) {
                this.#fields.entered = true;
                return true;
            }
            if (cstate.hasBackpressure()) {
                return null;
            }
            // Entries already queued for this instance go first.
            if (cstate.hasPendingAdmissions()) {
                return null;
            }
            if (this.needsExclusiveLock()) {
                if (cstate.isExclusivelyLocked()) {
                    return null;
                }
                cstate.exclusiveLock(this.#fields.id);
            }
            if (this.deliverPendingCancel({ cancellable: true })) {
                cstate.exclusiveRelease(this.#fields.id);
                this.cancel();
                return false;
            }
            this.#fields.entered = true;
            return true;
        }
        async enter(opts?: { isHost?: boolean }) {
            debugLog('[AsyncTask#enter()] args', {
                taskID: this.#fields.id,
                componentIdx: this.#fields.componentIdx,
                subtaskID: this.getParentSubtask()?.id(),
                args: opts,
                entryFnName: this.#fields.entryFnName,
            });

            if (opts?.isHost) {
                return this.enterHost();
            }

            if (this.#fields.entered) {
                throw new Error(`task with ID [${this.#fields.id}] should not be entered twice`);
            }

            // If cancellation was requested before the task was entered, resolve
            // as cancelled without ever running guest code
            if (this.deliverPendingCancel({ cancellable: true })) {
                this.cancel();
                return false;
            }

            const cstate = getOrCreateAsyncState(_lookup, this.#fields.componentIdx);

            // NOTE: concurrent task lifetimes within one component instance are
            // permitted by the Component Model: entry is governed by the
            // backpressure and exclusive-lock checks below (the lock is held per
            // execution slice, not for the task's lifetime).
            //
            // Serializing entire task lifetimes here (the former "execution slot" queue)
            // deadlocks pipelines where a parked long-lived task's progress depends on a
            // later entry into the same component.

            // If a task is synchronous then we can avoid component-relevant
            // tracking and immediately enter.
            if (this.isSync()) {
                this.#fields.entered = true;

                // TODO(breaking): remove once manually-specifying async fns is removed
                // It is currently possible for an actually sync export to be specified
                // as async via JSPI
                if (this.#fields.isManualAsync) {
                    if (this.needsExclusiveLock()) {
                        await cstate.acquireExclusiveLock(this.#fields.id);
                    }
                }

                return this.#fields.entered;
            }

            // Enter in the order the calls were made: queue behind every
            // earlier entry into this instance, whatever it waits for.
            const ticket = cstate.takeAdmissionTicket(this.#fields.id);
            this.#fields.admissionTicket = ticket;
            let entered = false;
            try {
                entered = await this.#enterQueued(cstate, ticket);
                return entered;
            } finally {
                // An entered task keeps the slot until its first slice ends
                // (`endFirstSlice`): the next call is admitted once this one
                // returned, blocked or trapped, as `Store.invoke` runs a call.
                if (!entered) {
                    this.endFirstSlice();
                }
            }
        }
        // The first slice of this task ended (it returned, blocked or trapped):
        // the next entry into the instance may be admitted (Canonical ABI
        // `Store.invoke` runs a call until it first blocks or returns).
        endFirstSlice() {
            const ticket = this.#fields.admissionTicket;
            if (ticket === null) {
                return;
            }
            this.#fields.admissionTicket = null;
            getOrCreateAsyncState(_lookup, this.#fields.componentIdx).releaseAdmissionTicket(ticket);
        }
        async #enterQueued(cstate: ComponentAsyncState, ticket: AdmissionTicket) {
            await cstate.waitForAdmissionTurn(ticket);
            // Cancelled before it started while it was queued: the task was
            // retired already and must not park in a wait as a dead entry.
            if (this.isResolvedState() || this.isCancelled()) {
                return false;
            }
            // Wait until there is no backpressure *and* the exclusive lock (if
            // needed) is ours. Backpressure can be set while we wait for the
            // lock (by the task holding it), so it's checked again once the lock
            // is acquired, as the Canonical ABI's `enter_implicit_thread` waits
            // for both together.
            while (true) {
                if (cstate.hasBackpressure()) {
                    cstate.addBackpressureWaiter();
                    const result = await this.waitUntil({
                        readyFn: () => {
                            return !cstate.hasBackpressure();
                        },
                        cancellable: true,
                    });
                    cstate.removeBackpressureWaiter();
                    if (!result || this.isCancelled()) {
                        if (!this.isResolvedState()) {
                            this.cancel();
                        }
                        return false;
                    }
                }
                // Acquire the per-slice exclusive lock (FIFO-queued when
                // contended); the first slice runs under this hold and the
                // driver loop releases/re-acquires it per slice thereafter.
                if (this.needsExclusiveLock()) {
                    await cstate.acquireExclusiveLock(this.#fields.id);
                    if (cstate.hasBackpressure()) {
                        cstate.exclusiveRelease(this.#fields.id);
                        continue;
                    }
                }
                break;
            }
            // The store may have trapped (e.g. a deadlock was detected) while
            // this task waited to enter: it must not run, and its call fails
            // with that trap.
            try {
                cstate.throwIfInterrupted();
            } catch (err) {
                cstate.exclusiveRelease(this.#fields.id);
                this.setErrored(err);
                return false;
            }
            // Cancellation-before-start may resolve this task while its
            // queued lock acquisition is still pending. Acquiring the lock
            // does not make the already-resolved task runnable again.
            if (this.isResolvedState() || this.isCancelled()) {
                cstate.exclusiveRelease(this.#fields.id);
                return false;
            }
            // Cancellation can be requested while entry is waiting for
            // backpressure or its exclusive lock. Do not execute the guest
            // after acquiring a lock for a task that should no longer start.
            if (this.deliverPendingCancel({ cancellable: true })) {
                cstate.exclusiveRelease(this.#fields.id);
                this.cancel();
                return false;
            }
            this.#fields.entered = true;
            return this.#fields.entered;
        }
        isRunningState() {
            return this.#fields.state !== AsyncTask.State.RESOLVED;
        }
        isResolvedState() {
            return this.#fields.state === AsyncTask.State.RESOLVED;
        }
        isResolved() {
            return this.#fields.state === AsyncTask.State.RESOLVED;
        }
        isExited() {
            return this.#fields.exited;
        }
        async waitUntil(opts: TaskSuspendOptions) {
            const { readyFn, cancellable } = opts;
            debugLog('[AsyncTask#waitUntil()] args', { taskID: this.#fields.id, args: { cancellable } });
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
            debugLog('[AsyncTask#yieldUntil()]', {
                taskID: this.#fields.id,
                args: {
                    cancellable,
                },
                componentIdx: this.#fields.componentIdx,
            });
            // A callback YIELD is an explicit request to let other work run.
            // Unlike waits whose condition is already ready, it must always
            // suspend for at least one scheduler turn.
            const keepGoing = await this.immediateSuspend({ readyFn, cancellable });
            if (keepGoing) {
                return {
                    code: _events.NONE,
                    payload0: 0,
                    payload1: 0,
                };
            }
            return {
                code: _events.TASK_CANCELLED,
                payload0: 0,
                payload1: 0,
            };
        }
        async suspendUntil(opts: TaskSuspendOptions) {
            const { cancellable, readyFn } = opts;
            debugLog('[AsyncTask#suspendUntil()] args', {
                taskID: this.#fields.id,
                args: {
                    cancellable,
                },
                componentIdx: this.#fields.componentIdx,
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
            const cstate = getOrCreateAsyncState(_lookup, this.#fields.componentIdx);
            cstate.suspendTask({
                task: this,
                cancellable: !!cancellable,
                readyFn: () => {
                    if (cancellable && this.#fields.state === AsyncTask.State.CANCEL_PENDING) {
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
            debugLog('[AsyncTask#immediateSuspendUntil()] args', {
                args: {
                    cancellable,
                    readyFn,
                },
                taskID: this.#fields.id,
                threadID: this.defaultThread().id(),
                componentIdx: this.#fields.componentIdx,
            });
            const ready = readyFn();
            if (ready && _determinism === 'random') {
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
            const cstate = getOrCreateAsyncState(_lookup, this.#fields.componentIdx);
            const thread = this.#fields.entered
                ? (cstate.threads.get(getCurrentTaskMeta(_registers, this.#fields.componentIdx)?.threadID!) as
                      | AsyncThreadType
                      | undefined)
                : this.defaultThread();
            if (!thread || thread.task() !== this) {
                throw new Error('invalid current thread for wait');
            }
            // Suspending a core Wasm stack retains the task's exclusive
            // lock. Only a callback return releases it between slices.
            return thread.suspend({ ...opts, releaseLock: false });
        }
        deliverPendingCancel(opts: { cancellable?: boolean }) {
            const { cancellable } = opts;
            debugLog('[AsyncTask#deliverPendingCancel()]', {
                args: { cancellable },
                taskID: this.#fields.id,
                threadID: this.defaultThread().id(),
                componentIdx: this.#fields.componentIdx,
            });
            if (cancellable && this.#fields.state === AsyncTask.State.CANCEL_PENDING) {
                this.#fields.state = AsyncTask.State.CANCEL_DELIVERED;
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
            debugLog('[AsyncTask#requestCancellation()] args', {
                taskID: this.#fields.id,
                threadID: this.defaultThread().id(),
                componentIdx: this.#fields.componentIdx,
                state: this.#fields.state,
            });
            if (this.isResolvedState() || this.cancelRequested) {
                return;
            }
            this.cancelRequested = true;
            if (this.#fields.state === AsyncTask.State.INITIAL) {
                this.#fields.state = AsyncTask.State.CANCEL_PENDING;
                // A task still waiting for backpressure or its
                // initial instance lock has no guest thread to
                // resume. Cancellation is therefore delivered
                // and acknowledged eagerly as
                // CANCELLED_BEFORE_STARTED.
                if (!this.#fields.entered) {
                    this.deliverPendingCancel({ cancellable: true });
                    this.cancel();
                    const cstate = getOrCreateAsyncState(_lookup, this.#fields.componentIdx);
                    // `enter()` may already be parked either in the scheduler's
                    // explicit-backpressure wait or in the exclusive-lock FIFO.
                    // Wake/remove that entry work now so it cannot retain a timer,
                    // waiter count, or lock-queue slot after cancellation.
                    cstate.resumeTaskByID(this.#fields.id);
                    cstate.cancelExclusiveLockWaiter(this.#fields.id);
                    // No guest thread was registered, so no driver loop will call
                    // `exit()`. Retire the task's JS bookkeeping explicitly.
                    this.exit({ skipExclusiveLockCheck: true });
                    return;
                }
            }
            // Nudge the component's tick loop so that any suspended cancellable
            // wait observes the pending cancellation promptly
            getOrCreateAsyncState(_lookup, this.#fields.componentIdx).runTickLoop();
        }
        cancel(args?: { error?: unknown }) {
            debugLog('[AsyncTask#cancel()] args', {});
            if (this.taskState() !== AsyncTask.State.CANCEL_DELIVERED) {
                throw new Error('`task.cancel` called by task which has not been cancelled');
            }
            this.validateResourceBorrowScope();
            this.cancelled = true;
            // Cancelled tasks resolve with no value (spec: `Task.cancel` calls
            // `on_resolve(None)`); an explicit error is only present on the
            // host-driven rejection path (see `reject()`).
            this.onResolve(args?.error ?? null);
            this.#fields.state = AsyncTask.State.RESOLVED;
            // A task cancelled before entry has no driver loop that can
            // report its exit. Entered tasks notify after releasing their
            // component slice in `exit()`.
            if (!this.#fields.entered) {
                this.notifyProgress();
            }
        }
        onResolve(taskValue: unknown) {
            const handlers = this.#fields.onResolveHandlers;
            this.#fields.onResolveHandlers = [];
            for (const f of handlers) {
                try {
                    f(taskValue);
                } catch (err) {
                    debugLog('[AsyncTask#onResolve] error during task resolve handler', err);
                    throw err;
                }
            }
            // Rejections are control-flow failures, not canonical ABI results.
            // Propagate them through the subtask chain without running return
            // lowering or post-return hooks for a successful result.
            if (this.#fields.rejected) {
                this.#fields.parentSubtask?.reject(taskValue);
                return;
            }
            // NOTE: if the parent subtask has already been resolved (e.g. it was
            // cancelled via `subtask.cancel` while this task was still pending),
            // this task's resolution must be discarded rather than delivered.
            const parentSubtaskPending = this.#fields.parentSubtask && !this.#fields.parentSubtask.isResolved();
            const taskReturned = !this.isCancelled();
            if (parentSubtaskPending && taskReturned) {
                const meta = this.#fields.parentSubtask!.getCallMetadata();
                // Run the rturn fn if it has not already been called -- this *should* have happened in
                // `task.return`, but some paths do not go through task.return (e.g. async lower of sync fn
                // which goes through prepare + async-start-call)
                if (meta.returnFn && !meta.returnFnCalled) {
                    debugLog('[AsyncTask#onResolve()] running returnFn', {
                        componentIdx: this.#fields.componentIdx,
                        taskID: this.#fields.id,
                        subtaskID: this.#fields.parentSubtask!.id(),
                    });
                    const callerTask = this.#fields.parentSubtask!.getParentTask();
                    withCurrentTaskMeta(_registers, {
                        taskID: callerTask.id(),
                        threadID: meta.callerThreadID!,
                        componentIdx: callerTask.componentIdx(),
                        fn: () => meta.returnFn!.apply(null, [taskValue, meta.resultPtr]),
                    });
                    meta.returnFnCalled = true;
                }
            }
            if (this.#fields.postReturnFn && taskReturned) {
                debugLog('[AsyncTask#onResolve()] running post return ', {
                    componentIdx: this.#fields.componentIdx,
                    taskID: this.#fields.id,
                });
                try {
                    withCurrentTaskMeta(_registers, {
                        taskID: this.#fields.id,
                        threadID: this.defaultThread().id(),
                        componentIdx: this.#fields.componentIdx,
                        fn: () => this.#fields.postReturnFn!(taskValue),
                    });
                } catch (err) {
                    err = postReturnTrap(context.postReturn, this.#fields.componentIdx, err);
                    this.reject(err);
                    throw err;
                }
            }
            if (parentSubtaskPending) {
                this.#fields.parentSubtask!.onResolve(taskValue);
            }
        }
        registerOnResolveHandler(f: (value: unknown) => void) {
            this.#fields.onResolveHandlers.push(f);
        }
        isRejected() {
            return this.#fields.rejected;
        }
        isErrored() {
            return this.#fields.errored;
        }
        setErrored(err: unknown) {
            // Preserve the originating trap when unwinding through
            // additional guest frames produces secondary traps (often
            // an `unreachable` after a call which was expected to trap).
            if (this.#fields.errored === null) {
                this.#fields.errored = err;
            }
        }
        stop(err: unknown) {
            this.reject(err);
            // Publish rejection even while a JSPI stack awaits a host import.
            this.#fields.completionReady = true;
            this.#fields.settleCompletionPromise();
        }
        reject(taskErr: unknown) {
            debugLog('[AsyncTask#reject()] args', {
                componentIdx: this.#fields.componentIdx,
                taskID: this.#fields.id,
                parentSubtask: this.#fields.parentSubtask,
                parentSubtaskID: this.#fields.parentSubtask?.id(),
                entryFnName: this.entryFnName(),
                callbackFnName: this.#fields.callbackFnName,
                errMsg: (
                    taskErr as {
                        message?: unknown;
                    }
                ).message,
            });
            this.setErrored(taskErr);
            if (this.#fields.rejected) {
                return;
            }
            // A task may call `task.return` before its callback exits.
            // A trap in cleanup or spawned work must still reject the
            // host call and poison the enclosing task chain.
            if (this.isResolvedState()) {
                this.#fields.rejected = true;
                this.#fields.errored = taskErr;
                const parentTask = this.#fields.parentSubtask?.getParentTask();
                if (parentTask) {
                    parentTask.reject(taskErr);
                }
                return;
            }
            this.#fields.rejected = true;
            this.cancelRequested = true;
            this.#fields.state = AsyncTask.State.CANCEL_PENDING;
            this.deliverPendingCancel({ cancellable: true });
            // TODO: do cleanup here to reset the machinery so we can run again?
            this.cancel({ error: taskErr });
        }
        resolve(results: unknown[]) {
            debugLog('[AsyncTask#resolve()] args', {
                componentIdx: this.#fields.componentIdx,
                taskID: this.#fields.id,
                entryFnName: this.entryFnName(),
                callbackFnName: this.#fields.callbackFnName,
            });
            if (this.#fields.state === AsyncTask.State.RESOLVED) {
                if (this.#fields.errored !== null) {
                    throw this.#fields.errored;
                }
                throw new Error(
                    `(component [${this.#fields.componentIdx}]) task [${this.#fields.id}]  is already resolved (did you forget to wait for an import?)`,
                );
            }
            this.validateResourceBorrowScope();
            this.#fields.state = AsyncTask.State.RESOLVED;
            switch (results.length) {
                case 0:
                    this.onResolve(undefined);
                    break;
                case 1:
                    this.onResolve(results[0]);
                    break;
                default:
                    debugLog('[AsyncTask#resolve()] unexpected number of results', {
                        componentIdx: this.#fields.componentIdx,
                        results,
                        taskID: this.#fields.id,
                        subtaskID: this.#fields.parentSubtask?.id(),
                        entryFnName: this.#fields.entryFnName,
                        callbackFnName: this.#fields.callbackFnName,
                    });
                    throw new Error('unexpected number of results');
            }
        }
        exit(args?: { skipExclusiveLockCheck?: boolean }) {
            debugLog('[AsyncTask#exit()]', {
                componentIdx: this.#fields.componentIdx,
                taskID: this.#fields.id,
            });

            this.endFirstSlice();
            if (this.#fields.exited) {
                throw new Error('task has already exited');
            }

            // Validate before publishing exit or running its handlers.
            // Otherwise a failed exit leaves #exited true, so the driver
            // cannot finish rejection cleanup and settle the host call.
            this.#checkThreadExit();
            this.validateResourceBorrowScope();

            // Host (-1) tasks have no component instance (and so no async
            // state or exclusive lock); do not materialise one for them.
            const state =
                this.#fields.componentIdx === -1 ? null : getOrCreateAsyncState(_lookup, this.#fields.componentIdx);
            if (!state && this.#fields.componentIdx !== -1) {
                throw new Error('missing async state for component [' + this.#fields.componentIdx + ']');
            }

            if (state && !args?.skipExclusiveLockCheck && !this.#fields.lockFreeEntry) {
                if (this.needsExclusiveLock() && !state.exclusivelyLockedBy(this.#fields.id)) {
                    throw new Error(
                        `task [${this.#fields.id}] exit: component [${this.#fields.componentIdx}] should have been exclusively locked by it`,
                    );
                }
            }

            // Ownership-checked: releases only this task's own hold (a
            // task exiting while another task's slice holds the lock no
            // longer clears the foreign hold).
            if (state) {
                state.exclusiveRelease(this.#fields.id);
            }
            this.notifyProgress();

            for (const f of this.#fields.onExitHandlers) {
                try {
                    f();
                } catch (err) {
                    console.error('error during task exit handler', err);
                    throw err;
                }
            }

            this.#fields.exited = true;
            this.removeThread(this.defaultThread());
            if (this.#fields.threads.length > 0) {
                clearCurrentThread(_clearing, this.#fields.componentIdx, this.#fields.id, { preserveTask: true });
            }
        }
        needsExclusiveLock() {
            // Host (-1) tasks model host-side import handling: there is no
            // guest linear memory or executor state to protect, and host
            // calls from unrelated guest components would contend spuriously.
            if (this.#fields.componentIdx === -1) {
                return false;
            }
            // Import-handler tasks (CallInterface) run host code nested
            // inside the calling guest slice, which already holds the
            // lock; only tasks that execute guest slices need it.
            if (!this.#fields.callingWasmExport) {
                return false;
            }
            // Automatic backpressure only applies to async function
            // types. A sync-typed call may run ready callback threads
            // before returning, so holding this lock would deadlock it.
            if (!this.#fields.funcTypeIsAsync) {
                return false;
            }
            // A sync-lifted callee cannot be reentered until the whole
            // stackful call returns. This is the Component Model's
            // automatic-backpressure rule for async-lowered calls.
            return !this.#fields.isAsync || this.hasCallback() || this.#fields.calleeIsAsync === false;
        }
        createSubtask(args: CreateSubtaskOptions) {
            debugLog('[AsyncTask#createSubtask()] args', args);
            const { componentIdx, childTask, callMetadata, fnName, isAsync, isManualAsync } = args;
            const cstate = getOrCreateAsyncState(_lookup, this.#fields.componentIdx);
            if (!cstate) {
                throw new Error(`invalid/missing async state for component idx [${componentIdx}]`);
            }
            const waitable = new _Waitable({
                componentIdx: this.#fields.componentIdx,
                target: `subtask (internal ID [${this.#fields.id}])`,
            });
            const newSubtask = new _Subtask({
                componentIdx,
                childTask,
                parentTask: this,
                callMetadata,
                isAsync,
                isManualAsync,
                fnName,
                waitable,
            });
            this.#fields.subtasks.push(newSubtask);
            newSubtask.setTarget(
                `subtask (internal ID [${newSubtask.id()}], waitable [${waitable.idx()}], component [${componentIdx}])`,
            );
            // The subtask gets a handle index in this task's table only once the
            // guest is given it (see `AsyncSubtask#ensureHandle`).
            return newSubtask;
        }
        getLatestSubtask() {
            return this.#fields.subtasks.at(-1);
        }
        getSubtaskByWaitableRep(rep: number) {
            if (rep === undefined) {
                throw new TypeError('missing rep');
            }
            return this.#fields.subtasks.find((s) => s.waitableRep() === rep);
        }
        currentSubtask() {
            debugLog('[AsyncTask#currentSubtask()]');
            if (this.#fields.subtasks.length === 0) {
                return undefined;
            }
            return this.#fields.subtasks.at(-1);
        }
        removeSubtask(subtask: AsyncSubtaskType) {
            if (this.#fields.subtasks.length === 0) {
                throw new Error('cannot end current subtask: no current subtask');
            }
            this.#fields.subtasks = this.#fields.subtasks.filter((t) => t !== subtask);
            return subtask;
        }
        cancellationPending() {
            return this.#fields.state === AsyncTask.State.CANCEL_PENDING;
        }

        enterHost() {
            if (this.#fields.entered) {
                throw new Error(`task with ID [${this.#fields.id}] should not be entered twice`);
            }

            // If cancellation was requested before the task was entered, resolve
            // as cancelled without ever running host code
            if (this.deliverPendingCancel({ cancellable: true })) {
                this.cancel();
                return false;
            }

            getOrCreateAsyncState(_lookup, this.#fields.componentIdx);

            this.#fields.entered = true;
            // A guest task may be synchronously blocked in this
            // host entry. Propagate that boundary so an async
            // cancellation driver can yield BLOCKED while the host
            // operation is outstanding.
            const parentTask = this.#fields.parentSubtask?.getParentTask();
            if (
                parentTask?.taskState() === AsyncTask.State.CANCEL_DELIVERED ||
                (parentTask && !parentTask.hasCallback())
            ) {
                parentTask.notifyProgress();
            }
            return this.#fields.entered;
        }

        defaultThread() {
            return this.#fields.threads[0];
        }

        removeThread(thread: AsyncThreadType) {
            this.#checkThreadExit();
            this.settleCompletion();
            if (this.#fields.componentIdx !== -1) {
                const cstate = getOrCreateAsyncState(_lookup, this.#fields.componentIdx);
                cstate.threads.remove(thread.id());
            }
            this.#fields.threads = this.#fields.threads.filter((t) => t !== thread);
            if (this.#fields.exited && this.#fields.threads.length === 0) {
                clearCurrentThread(_clearing, this.#fields.componentIdx, this.#fields.id);
            }
        }

        #checkThreadExit() {
            if (this.#fields.threads.length === 1 && !this.isResolvedState() && !this.isRejected()) {
                const err = new _RuntimeError(
                    `(component [${this.#fields.componentIdx}]) task [${this.#fields.id}] exited without resolution`,
                );
                throw this.#fields.componentIdx === -1
                    ? err
                    : recordTrap(context.traps, this.#fields.componentIdx, err);
            }
        }

        addThread(thread: AsyncThreadType) {
            // Host (-1) tasks model host-side import handling: there is no
            // component instance behind them, so no instance thread table to
            // register with (and none may be materialised on their behalf).
            if (this.#fields.componentIdx === -1) {
                thread.setId(++AsyncTask._HOST_THREAD_ID);
                this.#fields.threads.push(thread);
                return thread;
            }
            const cstate = getOrCreateAsyncState(_lookup, this.#fields.componentIdx);
            thread.setId(cstate.threads.insert(thread));
            this.#fields.threads.push(thread);
            return thread;
        }

        calleeIsAsync() {
            return this.#fields.calleeIsAsync === true;
        }
    }
    return AsyncTask satisfies AsyncTaskConstructor;
}
