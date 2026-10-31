import { driverLoop, unpackCallbackResult } from './task-driver.js';
export { driverLoop, unpackCallbackResult };
import type {
    ResourceTable,
    RuntimeMemory,
    ComponentAsyncState,
    AdmissionTicket,
    ComponentWaitable,
    ComponentWaitableSet,
    WaitableEvent,
    AsyncThreadClassContext,
    AsyncThreadConstructor,
    AsyncThreadOptions,
    ThreadControlContext,
    ThreadNewContext,
    ThreadStartPlatform,
    ThreadStartChecks,
    ThreadOperationOptions,
    ThreadLookupContext,
    AsyncTask as AsyncTaskType,
    AsyncThread as AsyncThreadType,
    AsyncSubtask as AsyncSubtaskType,
    AsyncTaskOptions,
    AsyncSubtaskOptions,
    TaskState,
    TaskCallback,
    TaskPostReturn,
    TaskLowerFn,
    TaskCallMetadata,
    SubtaskLender,
    TaskReturnOptions,
    TaskLiftContext,
    TaskLowerImportOptions,
    TaskSuspendOptions,
    CreateSubtaskOptions,
    AsyncTaskModule,
    AsyncTaskConstructor,
    AsyncSubtaskConstructor,
    TaskMutableRegister,
    AsyncTaskClassContext,
    AsyncSubtaskClassContext,
    TaskReturnRuntimeContext,
    SubtaskCancelContext,
    SubtaskDropContext,
    TaskCancelContext,
    TaskLowerImportRuntimeContext,
    TaskCompatImportRuntimeContext,
    TaskSymmetricEnterContext,
    TaskSymmetricExitContext,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
import { promiseWithResolvers } from './core-promises.js';
import {
    getCurrentTaskMeta,
    setCurrentTaskMeta,
    clearCurrentTaskMeta,
    withCurrentTaskMeta,
    withCurrentTaskMetaAsync,
} from './task-context.js';
import { coinFlip as _coinFlip, typeCheckValidI32 as checkI32, disposeHostValue, lookupMemories } from './core.js';
import { getOrCreateAsyncState, checkMayLeave, postReturnTrap, recordTrap } from './component.js';
import {
    getCurrentTask,
    createNewCurrentImplicitThread,
    createNewCurrentTask,
    clearCurrentThread,
    clearCurrentTask,
} from './task-operations.js';
export { getCurrentTask, createNewCurrentImplicitThread, createNewCurrentTask, clearCurrentThread, clearCurrentTask };
import { getCurrentThread, currentThreadOrThrow } from './thread-operations.js';
export { getCurrentThread, currentThreadOrThrow };
const typeCheckValidI32 = (value: unknown): value is number => checkI32(value);
const isThenable = <T>(value: T | Promise<T>): value is Promise<T> =>
    !!value && typeof (value as { then?: unknown }).then === 'function';

export const asyncBlockedCode = 0xffff_ffff;
export const initializeTasksByComponent: AsyncTaskModule['initializeTasksByComponent'] = () => new Map();
export const initializeCurrentTaskIds: AsyncTaskModule['initializeCurrentTaskIds'] = () => [];
export const initializeCurrentComponentIdxs: AsyncTaskModule['initializeCurrentComponentIdxs'] = () => [];
export const initializeSymmetricSyncGuestCallStack: AsyncTaskModule['initializeSymmetricSyncGuestCallStack'] = () => [];
export const initializeCurrentTaskMayBlock: AsyncTaskModule['initializeCurrentTaskMayBlock'] = (platform) => {
    if (platform === false) {
        return false;
    }
    const Global = platform.Global;
    if (!Global) {
        throw new TypeError('async task registers require WebAssembly.Global');
    }
    return new Global({ value: 'i32', mutable: true }, 0);
};
export const initializeAsyncBlockingCallDepth: AsyncTaskModule['initializeAsyncBlockingCallDepth'] = (platform) => {
    if (platform === false) {
        return { value: 0 };
    }
    const Global = platform.Global;
    if (!Global) {
        throw new TypeError('async task registers require WebAssembly.Global');
    }
    return new Global({ value: 'i32', mutable: true }, 0);
};

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
        FutureValue,
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
            completionPromise.catch(() => {});
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
                } else if (this.#fields.preserveFutureResult && this.#fields.completionValue instanceof FutureValue) {
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

export function initializeAsyncSubtaskClass(context: AsyncSubtaskClassContext): AsyncSubtaskConstructor {
    const { lookup: _lookup, memories: _memories, disposeSymbol: _disposeSymbol, RuntimeError } = context;
    class AsyncSubtask {
        static _ID = 0n;
        static State = {
            STARTING: 0,
            STARTED: 1,
            RETURNED: 2,
            CANCELLED_BEFORE_STARTED: 3,
            CANCELLED_BEFORE_RETURNED: 4,
        } as const;
        #id!: bigint;
        #state: number = AsyncSubtask.State.STARTING;
        #componentIdx!: number;
        #parentTask!: AsyncTaskType;
        #childTask: AsyncTaskType | null = null;
        #dropped = false;
        #cancelRequested = false;
        #memoryIdx: number | null = null;
        #lenders: SubtaskLender[] | null = null;
        #waitable!: ComponentWaitable;
        #callbackFn: TaskCallback | null = null;
        #callbackFnName: string | null | undefined = null;
        #postReturnFn: TaskPostReturn | null = null;
        #onProgressFn: (() => void) | null = null;
        #pendingEventFn: (() => WaitableEvent) | null = null;
        #callMetadata: TaskCallMetadata = {};
        #resolved = false;
        #onResolveHandlers: ((value: unknown) => void)[] = [];
        #onStartHandlers: (() => void)[] = [];
        #result: unknown = null;
        #resultSet = false;
        // Pending value returned by a host implementation of this (async import)
        // subtask, held so it can be disposed if the guest discards the call
        #hostPendingResult: unknown = null;
        fnName: string | undefined;
        target: unknown;
        isAsync: boolean | undefined;
        isManualAsync: boolean | undefined;
        // One execution slice awaited by the conditional cancel trampoline.
        cancelProgress: Promise<unknown> | null = null;
        constructor(args: AsyncSubtaskOptions) {
            if (typeof args.componentIdx !== 'number') {
                throw new Error('invalid componentIdx for subtask creation');
            }
            this.#componentIdx = args.componentIdx;
            this.#id = ++AsyncSubtask._ID;
            this.fnName = args.fnName;
            if (!args.parentTask) {
                throw new Error('missing parent task during subtask creation');
            }
            this.#parentTask = args.parentTask;
            if (args.childTask) {
                this.#childTask = args.childTask;
            }
            if (args.memoryIdx) {
                this.#memoryIdx = args.memoryIdx;
            }
            if (!args.waitable) {
                throw new Error('missing/invalid waitable');
            }
            this.#waitable = args.waitable;
            if (args.callMetadata) {
                this.#callMetadata = args.callMetadata;
            }
            this.#lenders = [];
            this.target = args.target;
            this.isAsync = args.isAsync;
            this.isManualAsync = args.isManualAsync;
        }
        id() {
            return this.#id;
        }
        parentTaskID() {
            return this.#parentTask?.id();
        }
        childTaskID() {
            return this.#childTask?.id();
        }
        state() {
            return this.#state;
        }
        getWaitable() {
            return this.#waitable;
        }
        waitable() {
            return this.#waitable;
        }
        waitableRep() {
            return this.#waitable.idx();
        }
        // The handle index is allocated only when the guest gets to see the
        // subtask (an async lower that did not complete at once), and after the
        // lifted arguments have freed theirs (Canonical ABI `canon_lower`).
        ensureHandle() {
            const existing = this.#waitable.idx();
            if (existing !== null && existing !== undefined) {
                return existing;
            }
            const idx = this.#getComponentState().handles.insert(this);
            this.#waitable.setIdx(idx);
            this.#waitable.setTarget(`waitable for subtask (waitable id [${idx}], subtask internal ID [${this.id()}])`);
            return idx;
        }
        join(set: ComponentWaitableSet | null) {
            return this.#waitable.join(set);
        }
        getPendingEvent() {
            return this.#waitable.getPendingEvent();
        }
        hasPendingEvent() {
            return this.#waitable.hasPendingEvent();
        }
        setPendingEvent(fn: () => WaitableEvent) {
            return this.#waitable.setPendingEvent(fn);
        }
        setTarget(tgt: unknown) {
            this.target = tgt;
        }
        getResult() {
            if (!this.#resultSet) {
                throw new Error('subtask result has not been set');
            }
            return this.#result;
        }
        setResult(v: unknown) {
            if (this.#resultSet) {
                throw new Error('subtask result has already been set');
            }
            this.#result = v;
            this.#resultSet = true;
        }
        componentIdx() {
            return this.#componentIdx;
        }
        setChildTask(t: AsyncTaskType) {
            if (!t) {
                throw new Error('cannot set missing/invalid child task on subtask');
            }
            if (this.#childTask) {
                throw new Error('child task is already set on subtask');
            }
            if (this.#parentTask === t) {
                throw new Error('parent cannot be child');
            }
            this.#childTask = t;
        }
        getChildTask() {
            return this.#childTask;
        }
        getParentTask() {
            return this.#parentTask;
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
            if (!this.#callbackFn) {
                return undefined;
            }
            return this.#callbackFn.name;
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
        setOnProgressFn(f: () => void) {
            if (this.#onProgressFn) {
                throw new Error('on progress fn can only be set once');
            }
            this.#onProgressFn = f;
        }
        isNotStarted() {
            return this.#state == AsyncSubtask.State.STARTING;
        }
        cancellationRequested() {
            return this.#cancelRequested;
        }
        // Request cooperative cancellation of this subtask, on behalf of the
        // supertask (i.e. `canon subtask.cancel`).
        //
        // If the callee is another guest task, the request is delivered to it and
        // the callee confirms via `task.cancel` (or still resolves via `task.return`).
        //
        // If the callee is a host function, the pending call is treated as
        // immediately cancelled -- consistent with hosts being expected to resolve
        // cancellation promptly -- and any later host resolution is discarded
        // (see `AsyncTask#onResolve`). The host is notified of the discard by
        // disposing the pending value it returned (see `setHostPendingResult`).
        requestCancellation() {
            debugLog('[AsyncSubtask#requestCancellation()] args', {
                componentIdx: this.#componentIdx,
                subtaskID: this.#id,
                state: this.#state,
                childTaskID: this.childTaskID(),
                fnName: this.fnName,
            });
            if (this.#cancelRequested) {
                throw new Error('cancellation has already been requested for this subtask');
            }
            this.#cancelRequested = true;
            if (this.#resolved) {
                return;
            }
            if (this.#childTask) {
                this.#childTask.requestCancellation();
                return;
            }
            this.onResolve(null);
            this.#disposeHostPendingResult();
        }
        // Record the value returned by the host implementation of this subtask.
        //
        // Host imports may return a thenable that implements `Symbol.asyncDispose`
        // or `Symbol.dispose`. If the guest cancels the call before its result is
        // delivered, the result is discarded and the thenable is disposed so the
        // host can stop pending work and release anything it produced.
        setHostPendingResult(v: unknown) {
            if (!isThenable(v)) {
                return;
            }
            this.#hostPendingResult = v;
            if (this.#resolved && this.#state !== AsyncSubtask.State.RETURNED) {
                this.#disposeHostPendingResult();
            }
        }
        #disposeHostPendingResult() {
            const pending = this.#hostPendingResult;
            if (!pending) {
                return;
            }
            this.#hostPendingResult = null;
            disposeHostValue(_disposeSymbol, pending);
        }
        registerOnStartHandler(f: () => void) {
            this.#onStartHandlers.push(f);
        }
        onStart(args?: { startFnParams?: unknown[] }) {
            debugLog('[AsyncSubtask#onStart()] args', {
                componentIdx: this.#componentIdx,
                subtaskID: this.#id,
                parentTaskID: this.parentTaskID(),
                fnName: this.fnName,
                args,
            });
            if (this.#onProgressFn) {
                this.#onProgressFn();
            }
            // Starting a nested operation is a task execution boundary.
            // In particular, a cancellation handler may synchronously
            // enter an import which then suspends in the host.  Wake a
            // supertask that is driving one cancellation slice so an
            // async `subtask.cancel` can report BLOCKED without waiting
            // for that nested operation to finish.
            this.#parentTask.notifyProgress();
            this.#state = AsyncSubtask.State.STARTED;
            let result: unknown;
            // If we have been provided a helper start function as a result of
            // component fusion performed by wasmtime tooling, then we can call that helper and lifts/lowers will
            // be performed for us.
            //
            // See also documentation on `HostIntrinsic::PrepareCall`
            //
            if (this.#callMetadata.startFn) {
                result = this.#callMetadata.startFn.apply(null, args?.startFnParams ?? []);
            }
            return result;
        }
        registerOnResolveHandler(f: (value: unknown) => void) {
            this.#onResolveHandlers.push(f);
        }
        reject(subtaskErr: unknown) {
            if (this.#resolved) {
                return;
            }
            if (this.#onProgressFn) {
                this.#onProgressFn();
            }
            if (this.#state === AsyncSubtask.State.STARTING) {
                this.#state = AsyncSubtask.State.CANCELLED_BEFORE_STARTED;
            } else if (this.#state === AsyncSubtask.State.STARTED) {
                this.#state = AsyncSubtask.State.CANCELLED_BEFORE_RETURNED;
            } else {
                throw new Error('cannot reject a completed subtask');
            }
            this.#resolved = true;
            this.#hostPendingResult = null;
            this.#parentTask.removeSubtask(this);
            this.#parentTask.reject(subtaskErr);
        }
        onResolve(subtaskValue: unknown) {
            debugLog('[AsyncSubtask#onResolve()] args', {
                componentIdx: this.#componentIdx,
                subtaskID: this.#id,
                isAsync: this.isAsync,
                childTaskID: this.childTaskID(),
                parentTaskID: this.parentTaskID(),
                parentTaskFnName: this.#parentTask?.entryFnName(),
                fnName: this.fnName,
            });
            if (this.#resolved) {
                throw new Error('subtask has already been resolved');
            }
            if (this.#onProgressFn) {
                this.#onProgressFn();
            }
            if (subtaskValue === null && this.#cancelRequested) {
                if (this.#state === AsyncSubtask.State.STARTING) {
                    this.#state = AsyncSubtask.State.CANCELLED_BEFORE_STARTED;
                } else {
                    if (this.#state !== AsyncSubtask.State.STARTED) {
                        throw new Error('resolved subtask must have been started before cancellation');
                    }
                    this.#state = AsyncSubtask.State.CANCELLED_BEFORE_RETURNED;
                }
            } else {
                if (this.#state !== AsyncSubtask.State.STARTED) {
                    throw new Error('resolved subtask must have been started before completion');
                }
                this.#state = AsyncSubtask.State.RETURNED;
                // The host result is delivered to the guest, so it is no longer ours to dispose
                this.#hostPendingResult = null;
            }
            this.setResult(subtaskValue);
            for (const f of this.#onResolveHandlers) {
                try {
                    f(subtaskValue);
                } catch (err) {
                    console.error('error during subtask resolve handler', err);
                    throw err;
                }
            }
            const callMetadata = this.getCallMetadata();
            // TODO(fix): we should be able to easily have the caller's meomry
            // to lower into here, but it's not present in PrepareCall
            const memory =
                callMetadata.memory ??
                this.#parentTask?.getReturnMemory() ??
                lookupMemories(_memories, { componentIdx: this.#parentTask.componentIdx() })[0]?.memory;
            // NOTE: cancelled resolutions carry no value, so nothing is lowered
            const returned = this.#state === AsyncSubtask.State.RETURNED;
            if (
                returned &&
                callMetadata &&
                !callMetadata.returnFn &&
                (this.isAsync || callMetadata.funcTypeIsAsync) &&
                callMetadata.resultPtr &&
                memory
            ) {
                const { resultPtr, realloc } = callMetadata;
                const lowers = callMetadata.lowers; // may have been updated in task.return of the child
                if (lowers && lowers.length > 0) {
                    lowers[0]({
                        componentIdx: this.#componentIdx,
                        memory,
                        realloc,
                        vals: [subtaskValue],
                        storagePtr: resultPtr,
                        stringEncoding: callMetadata.stringEncoding,
                    });
                }
            }
            this.#resolved = true;
            this.#parentTask.removeSubtask(this);
            if (!this.isAsync) {
                this.deliverResolve();
                const rep = this.waitableRep();
                if (rep) {
                    try {
                        const removed = this.#getComponentState().handles.remove(rep);
                        if (removed !== this) {
                            throw new Error('unexpectedly received non-self Subtask from handle removal');
                        }
                        this.drop();
                    } catch (err) {
                        debugLog(
                            '[AsyncSubtask#onResolve()] failed to remove subtask after sync subtask completion',
                            err,
                        );
                    }
                }
            }
        }
        getStateNumber() {
            return this.#state;
        }
        isReturned() {
            return this.#state === AsyncSubtask.State.RETURNED;
        }
        getCallMetadata() {
            return this.#callMetadata;
        }
        isResolved() {
            if (this.#state === AsyncSubtask.State.STARTING || this.#state === AsyncSubtask.State.STARTED) {
                return false;
            }
            if (
                this.#state === AsyncSubtask.State.RETURNED ||
                this.#state === AsyncSubtask.State.CANCELLED_BEFORE_STARTED ||
                this.#state === AsyncSubtask.State.CANCELLED_BEFORE_RETURNED
            ) {
                return true;
            }
            throw new Error('unrecognized internal Subtask state [' + this.#state + ']');
        }
        addLender(handle: SubtaskLender) {
            debugLog('[AsyncSubtask#addLender()] args', { handle });
            if (!handle || typeof handle.lends !== 'number') {
                throw new Error('missing/invalid lender handle [' + handle + ']');
            }
            if (this.#lenders === null || this.isResolved()) {
                throw new Error('subtask has no lendors or has already been resolved');
            }
            handle.lends++;
            this.#lenders!.push(handle);
        }
        deliverResolve() {
            debugLog('[AsyncSubtask#deliverResolve()] args', {
                lenders: this.#lenders,
                parentTaskID: this.parentTaskID(),
                subtaskID: this.#id,
                childTaskID: this.childTaskID(),
                resolved: this.isResolved(),
                resolveDelivered: this.resolveDelivered(),
            });
            const cannotDeliverResolve = this.resolveDelivered() || !this.isResolved();
            if (cannotDeliverResolve) {
                throw new Error('subtask cannot deliver resolution twice, and the subtask must be resolved');
            }
            for (const lender of this.#lenders!) {
                lender.lends--;
            }
            this.#lenders = null;
        }
        resolveDelivered() {
            debugLog('[AsyncSubtask#resolveDelivered()] args', {});
            if (this.#lenders === null && !this.isResolved()) {
                throw new Error('invalid subtask state, lenders missing and subtask has not been resolved');
            }
            return this.#lenders === null;
        }
        drop() {
            debugLog('[AsyncSubtask#drop()] args', {
                componentIdx: this.#componentIdx,
                parentTaskID: this.#parentTask?.id(),
                parentTaskFnName: this.#parentTask?.entryFnName(),
                childTaskID: this.#childTask?.id(),
                childTaskFnName: this.#childTask?.entryFnName(),
                subtaskFnName: this.fnName,
            });
            if (!this.#waitable) {
                throw new Error('missing/invalid inner waitable');
            }
            if (!this.resolveDelivered()) {
                throw new RuntimeError('cannot drop a subtask which has not yet resolved');
            }
            if (this.#waitable) {
                this.#waitable.drop();
            }
            this.#dropped = true;
        }
        #getComponentState() {
            const state = getOrCreateAsyncState(_lookup, this.#componentIdx);
            if (!state) {
                throw new Error('invalid/missing async state for component [' + this.#componentIdx + ']');
            }
            return state;
        }
        getWaitableHandleIdx() {
            debugLog('[AsyncSubtask#getWaitableHandleIdx()] args', {});
            if (!this.#waitable) {
                throw new Error('missing/invalid waitable');
            }
            return this.waitableRep();
        }
    }
    return AsyncSubtask satisfies AsyncSubtaskConstructor;
}

// ContextSet
export function contextSet(
    _context: ThreadLookupContext,
    ctx: {
        componentIdx?: number;
        slot: number;
    },
    value: number,
): ReturnType<AsyncTaskModule['contextSet']> {
    const { slot } = ctx;
    if (slot === undefined) {
        throw new TypeError('missing slot');
    }
    if (!typeCheckValidI32(value)) {
        throw new Error('invalid value for context set (not valid i32)');
    }
    // Guest callbacks use their component's task register. FACT
    // adapters have no component index; post-return also runs
    // after the callee register is cleared. Both use the executing
    // task, whose context FACT temporarily saves and restores.
    let currentThreadMeta = getCurrentTaskMeta(_context.registers, ctx.componentIdx);
    let threadMeta = currentThreadMeta
        ? getCurrentThread(
              _context,
              currentThreadMeta.componentIdx,
              currentThreadMeta.threadID,
              currentThreadMeta.taskID,
          )
        : undefined;
    // A post-return may run after the callee has exited. Its
    // per-component register can therefore name a task which is
    // no longer live; fall back to FACT's executing task.
    if (!threadMeta) {
        currentThreadMeta = getCurrentTaskMeta(_context.registers);
        threadMeta = currentThreadMeta
            ? getCurrentThread(
                  _context,
                  currentThreadMeta.componentIdx,
                  currentThreadMeta.threadID,
                  currentThreadMeta.taskID,
              )
            : undefined;
    }
    if (!currentThreadMeta) {
        throw new Error(
            `missing/incomplete global current thread meta for component idx [${ctx.componentIdx}] during context set`,
        );
    }
    if (!threadMeta) {
        throw new Error('failed to retrieve current thread');
    }
    const task = threadMeta.thread;
    if (!task) {
        throw new Error('invalid/missing current thread in metadata while setting context');
    }
    debugLog('[contextSet()] args', {
        slot,
        value,
        storage: task.storage,
        taskID: task.id(),
        componentIdx: task.componentIdx(),
    });
    if (slot < 0 || slot >= task.storage.length) {
        throw new Error('invalid slot for current thread');
    }
    task.storage[slot] = value;
}

// ContextGet
export function contextGet(
    _context: ThreadLookupContext,
    ctx: {
        componentIdx?: number;
        slot: number;
    },
): ReturnType<AsyncTaskModule['contextGet']> {
    const { slot } = ctx;
    if (slot === undefined) {
        throw new TypeError('missing slot');
    }
    // Guest callbacks use their component's task register. FACT
    // adapters have no component index; post-return also runs
    // after the callee register is cleared. Both use the executing
    // task, whose context FACT temporarily saves and restores.
    let currentThreadMeta = getCurrentTaskMeta(_context.registers, ctx.componentIdx);
    let threadMeta = currentThreadMeta
        ? getCurrentThread(
              _context,
              currentThreadMeta.componentIdx,
              currentThreadMeta.threadID,
              currentThreadMeta.taskID,
          )
        : undefined;
    // A post-return may run after the callee has exited. Its
    // per-component register can therefore name a task which is
    // no longer live; fall back to FACT's executing task.
    if (!threadMeta) {
        currentThreadMeta = getCurrentTaskMeta(_context.registers);
        threadMeta = currentThreadMeta
            ? getCurrentThread(
                  _context,
                  currentThreadMeta.componentIdx,
                  currentThreadMeta.threadID,
                  currentThreadMeta.taskID,
              )
            : undefined;
    }
    if (!currentThreadMeta) {
        throw new Error(
            `missing/incomplete global current thread meta for component idx [${ctx.componentIdx}] during context get`,
        );
    }
    if (!threadMeta) {
        throw new Error('failed to retrieve current thread');
    }
    const task = threadMeta.thread;
    if (!task) {
        throw new Error('invalid/missing current thread in metadata while getting context');
    }
    debugLog('[contextGet()] args', {
        slot,
        storage: task.storage,
        taskID: task.id(),
        componentIdx: task.componentIdx(),
    });
    if (slot < 0 || slot >= task.storage.length) {
        throw new Error('invalid slot for current thread');
    }
    return task.storage[slot];
}

// TaskReturn
export function taskReturn(
    _context: TaskReturnRuntimeContext,
    ctx: TaskReturnOptions,
    ...params: unknown[]
): ReturnType<AsyncTaskModule['taskReturn']> {
    const { componentIdx, getMemoryFn, memoryIdx, callbackFnIdx, liftFns, lowerFns, stringEncoding } = ctx;
    const memory = getMemoryFn();
    let useDirectParams = ctx.useDirectParams;
    const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx)!;
    const taskMeta = getCurrentTask(_context, componentIdx, taskID);
    if (!taskMeta) {
        throw new Error('failed to retrieve current task metadata');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('invalid/missing current task in metadata');
    }
    if (!task.calleeIsAsync()) {
        throw new _context.RuntimeError('task.return requires an async canonical lift');
    }
    task.validateResourceBorrowScope();
    // Canonical ABI `canon_task_return`: the result type must be the one of
    // the task's function type.
    const expectedResultType = task.returnResultTypeIdx();
    if (expectedResultType !== null && ctx.resultTypeIdx !== undefined && ctx.resultTypeIdx !== expectedResultType) {
        throw new _context.RuntimeError('task.return result type does not match the function type');
    }
    debugLog('[taskReturn()] args', {
        componentIdx,
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        callbackFnIdx,
        memoryIdx,
        liftFns,
        lowerFns,
        params,
    });
    // If we are in a subtask, and have a fused helper function provided to use
    // via PrepareCall, we can use that function rather than performing lifting manually.
    //
    // See also documentation on `HostIntrinsic::PrepareCall`
    const subtaskCallMetadata = task.getParentSubtask()?.getCallMetadata();
    if (subtaskCallMetadata?.returnFn && !subtaskCallMetadata.returnFnCalled) {
        debugLog('[taskReturn()] calling return fn on subtask', {
            componentIdx,
            taskID: task.id(),
            subtaskID: task.getParentSubtask()?.id(),
            returnFnParams: [...params, subtaskCallMetadata.resultPtr],
        });
        const callerTask = task.getParentSubtask()!.getParentTask();
        const res = withCurrentTaskMeta(_context.registers, {
            taskID: callerTask.id(),
            threadID: subtaskCallMetadata.callerThreadID!,
            componentIdx: callerTask.componentIdx(),
            fn: () => subtaskCallMetadata.returnFn!.apply(null, [...params, subtaskCallMetadata.resultPtr]),
        });
        // For sync-lowered calls the fused [return-call] helper returns
        // the lowering's flat result directly; stash it for
        // _syncStartCall to return to the blocked caller.
        subtaskCallMetadata.returnFnResult = res;
        subtaskCallMetadata.returnFnCalled = true;
        task.resolve([]);
        return;
    }
    const expectedMemoryIdx = task.getReturnMemoryIdx();
    if (expectedMemoryIdx !== null && memoryIdx !== null && expectedMemoryIdx !== memoryIdx) {
        debugLog('[taskReturn()] mismatched memory indices', { expectedMemoryIdx, memoryIdx });
        throw new Error('task.return memory [' + memoryIdx + '] does not match task [' + expectedMemoryIdx + ']');
    }
    task.callbackFnIdx = callbackFnIdx;
    if (!memory && liftFns.length > 4) {
        debugLog('[taskReturn()] memory not present for max async flat lifts');
        throw new Error('memory must be present if more than max async flat lifts are performed');
    }
    let liftCtx: TaskLiftContext = { memory, useDirectParams, params, componentIdx, stringEncoding };
    if (!useDirectParams) {
        if (!memory) {
            debugLog('missing memory despite indirect param usage', { useDirectParams, liftCtx, ctx });
            throw new Error('missing memory despite indirect param usage');
        }
        liftCtx.storagePtr = (params[0] as number) >>> 0;
        liftCtx.storageLen = params[1] as number;
    }
    const liftedResults = [];
    debugLog('[taskReturn()] lifting results out of memory', { liftCtx });
    for (const liftFn of liftFns) {
        if (liftCtx.storageLen !== undefined && liftCtx.storageLen <= 0) {
            debugLog(`[taskReturn()] ran out of range while writing storageLen = [${liftCtx.storageLen}]`);
            throw new Error('ran out of storage while writing');
        }
        const [val, newLiftCtx] = liftFn(liftCtx);
        liftCtx = newLiftCtx;
        liftedResults.push(val);
    }
    task.resolve(liftedResults);
}

// SubtaskDrop
export function subtaskDrop(
    _context: SubtaskDropContext,
    componentIdx: number,
    subtaskWaitableRep: number,
): ReturnType<AsyncTaskModule['subtaskDrop']> {
    debugLog('[subtaskDrop()] args', { componentIdx, subtaskWaitableRep });
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate.mayLeave) {
        throw new _context.RuntimeError('component is not marked as may leave, cannot drop subtask');
    }
    const subtask = cstate.handles.get(subtaskWaitableRep);
    if (!(subtask instanceof _context.AsyncSubtask)) {
        throw new _context.RuntimeError('invalid subtask handle for drop');
    }
    cstate.handles.remove(subtaskWaitableRep);
    subtask.drop();
}

// Yield
export function subtaskCancel(
    _context: SubtaskCancelContext,
    componentIdx: number,
    isAsync: boolean,
    subtaskRep: number,
    slowOnly: boolean = false,
): ReturnType<AsyncTaskModule['subtaskCancel']> {
    debugLog('[subtaskCancel()] args', { componentIdx, isAsync, subtaskRep });
    const state = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!state.mayLeave) {
        throw new _context.RuntimeError('component instance is not marked as may leave, cannot cancel subtask');
    }
    const subtask = state.handles.get(subtaskRep);
    if (!(subtask instanceof _context.AsyncSubtask)) {
        throw new _context.RuntimeError(
            'missing/invalid subtask [' + subtaskRep + '] specified for cancel in component instance',
        );
    }
    if (subtask.resolveDelivered()) {
        throw new _context.RuntimeError('`subtask.cancel` called after terminal status delivered');
    }
    if (!isAsync && subtask.waitable().isInSet()) {
        throw new _context.RuntimeError('cannot synchronously cancel a subtask that is in a waitable set');
    }
    const finishCancel = () => {
        // Consume the subtask's pending resolution event (which also marks the
        // resolution as delivered), then hand the final state back to core wasm.
        // Legal states here: RETURNED, CANCELLED_BEFORE_STARTED, CANCELLED_BEFORE_RETURNED.
        if (subtask.hasPendingEvent()) {
            subtask.getPendingEvent();
        }
        if (!subtask.resolveDelivered()) {
            subtask.deliverResolve();
        }
        return subtask.getStateNumber();
    };
    if (subtask.cancellationRequested()) {
        if (!slowOnly) {
            throw new Error('cancellation has already been requested for this subtask');
        }
        if (subtask.isResolved()) {
            return finishCancel();
        }
        if (subtask.cancelProgress) {
            const progress = subtask.cancelProgress;
            subtask.cancelProgress = null;
            return progress.then(() => {
                if (subtask.isResolved()) {
                    return finishCancel();
                }
                if (isAsync) {
                    return 0xffffffff;
                }
                const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx)!;
                const taskMeta = getCurrentTask(_context, componentIdx, taskID);
                if (!taskMeta || !taskMeta.task) {
                    throw new Error('invalid/missing async task');
                }
                return taskMeta.task
                    .waitUntil({
                        cancellable: false,
                        readyFn: () => subtask.isResolved(),
                    })
                    .then(finishCancel);
            });
        }
        const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx)!;
        const taskMeta = getCurrentTask(_context, componentIdx, taskID);
        if (!taskMeta || !taskMeta.task) {
            throw new Error('invalid/missing async task');
        }
        return taskMeta.task
            .waitUntil({
                cancellable: false,
                readyFn: () => subtask.isResolved(),
            })
            .then(finishCancel);
    }
    let cancellationWillCompleteAsync = false;
    if (!subtask.isResolved()) {
        const childTask = subtask.getChildTask();
        subtask.requestCancellation();
        if (!subtask.isResolved()) {
            // Cancellation may resume only the cancelled task's
            // implicit callback thread, and only while that thread is
            // parked cancellably in its event loop. No other ready
            // thread in the component instance may run here.
            if (childTask?.hasCallback()) {
                const childState = getOrCreateAsyncState(_context.lookup, childTask.componentIdx());
                if (
                    childState.suspendedTaskCancellable(childTask.id()) &&
                    childState.suspendedTaskReady(childTask.id())
                ) {
                    const progress = childTask.waitForProgress();
                    if (!childState.resumeTaskByID(childTask.id())) {
                        throw new Error('failed to resume cancelled callback task');
                    }
                    cancellationWillCompleteAsync = true;
                    subtask.cancelProgress = progress;
                }
            }
        }
        if (!subtask.isResolved()) {
            // The resumed callee blocked again: async-lowered cancels
            // report BLOCKED (resolution will arrive via a later SUBTASK event),
            // while sync-lowered cancels block the current task until the
            // subtask resolves.
            if (isAsync) {
                // -1 is the canonical BLOCKED status. -2 is an
                // internal signal consumed by the conditional JSPI
                // trampoline when a cancellable child was resumed but
                // its suspended Wasm stack must finish in a microtask.
                return cancellationWillCompleteAsync ? 0xfffffffe : 0xffffffff;
            }
            // The fast half of the conditional JSPI trampoline
            // cannot return a Promise. Signal that the slow,
            // suspending half must finish the synchronous cancel.
            if (!slowOnly) {
                return 0xfffffffe;
            }
            const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx)!;
            const taskMeta = getCurrentTask(_context, componentIdx, taskID);
            if (!taskMeta || !taskMeta.task) {
                throw new Error('invalid/missing async task');
            }
            return taskMeta.task
                .waitUntil({
                    cancellable: false,
                    readyFn: () => subtask.isResolved(),
                })
                .then(finishCancel);
        }
    }
    return finishCancel();
}

// TaskCancel
export function taskCancel(
    _context: TaskCancelContext,
    componentIdx: number,
): ReturnType<AsyncTaskModule['taskCancel']> {
    debugLog('[taskCancel()] args', { componentIdx });
    const state = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!state.mayLeave) {
        throw new Error('component instance is not marked as may leave, cannot be cancelled');
    }
    const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx)!;
    const taskMeta = getCurrentTask(_context, componentIdx, taskID);
    if (!taskMeta) {
        throw new Error('invalid/missing async task meta');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('invalid/missing async task');
    }
    if (Reflect.get(task, 'sync') && !task.alwaysTaskReturn) {
        throw new Error('cannot cancel sync tasks without always task return set');
    }
    task.cancel();
}

// UnpackCallbackResult

// DriverLoop

// LowerImport
export function lowerImport(
    _context: TaskLowerImportRuntimeContext,
    args: TaskLowerImportOptions,
    ...params: unknown[]
): ReturnType<AsyncTaskModule['lowerImport']> {
    debugLog('[lowerImport()] args', { args, params });
    const {
        componentIdx,
        isAsync,
        isManualAsync,
        resultLowerFns,
        hasResultPointer,
        funcTypeIsAsync,
        memoryIdx,
        getMemoryFn,
        getReallocFn,
        stringEncoding,
        importFn,
    } = args;
    checkMayLeave(_context.mayLeave, componentIdx);
    const { taskID, threadID } = getCurrentTaskMeta(_context.registers, componentIdx)!;
    const taskMeta = getCurrentTask(_context, componentIdx, taskID);
    if (!taskMeta) {
        throw new Error('invalid/missing async task meta');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('invalid/missing async task');
    }
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!task.mayBlock() && funcTypeIsAsync && !isAsync) {
        throw new Error('non async exports cannot synchronously call async functions');
    }
    // If there is an existing task, this should be part of a subtask
    const memory = getMemoryFn();
    // Canonical ABI lower appends result storage as a trailing
    // param when async lower has any flat result, or sync lower
    // has more than one flat result.
    const resultPtr = hasResultPointer ? (params[params.length - 1] as number) >>> 0 : undefined;
    const subtask = task.createSubtask({
        componentIdx,
        parentTask: task,
        fnName: importFn.fnName,
        isAsync,
        isManualAsync,
        callMetadata: {
            memoryIdx,
            memory,
            realloc: getReallocFn?.(),
            getReallocFn,
            resultPtr,
            lowers: resultLowerFns,
            funcTypeIsAsync,
            stringEncoding,
        },
    });
    task.setReturnMemoryIdx(memoryIdx);
    task.setReturnMemory(getMemoryFn());
    subtask.onStart();
    // If dealing with a sync lowered sync function, we can directly return results
    //
    // TODO(breaking): remove once we get rid of manual async import specification,
    // as func types cannot be detected in that case only (and we don't need that w/ p3)
    if (!isManualAsync && !isAsync && !funcTypeIsAsync) {
        importFn(...params);
        // TODO(breaking): remove once we get rid of manual async import specification,
        // as func types cannot be detected in that case only (and we don't need that w/ p3)
        if (!funcTypeIsAsync && !subtask.isReturned()) {
            throw new Error('post-execution subtasks must either be async or returned');
        }
        return subtask.getResult();
    }
    // Sync-lowered async functions requires async behavior because the callee *can* block,
    // but this call must *act* synchronously and return immediately with the result
    // (i.e. not returning until the work is done)
    //
    // TODO(breaking): remove checking for manual async specification here, once we can go p3-only
    //
    if (!isManualAsync && !isAsync && funcTypeIsAsync) {
        const { promise, resolve, reject } = promiseWithResolvers();
        queueMicrotask(async () => {
            try {
                await withCurrentTaskMetaAsync(_context.registers, {
                    taskID: task.id(),
                    threadID,
                    componentIdx: task.componentIdx(),
                    fn: () => importFn(...params),
                });
                if (!subtask.isResolved()) {
                    await task.suspendUntil({ readyFn: () => subtask.isResolved() });
                }
                resolve(subtask.getResult());
            } catch (err) {
                reject(err);
            }
        });
        return promise;
    }
    // NOTE: at this point we know that we are working with an async lowered import
    subtask.setOnProgressFn(() => {
        subtask.setPendingEvent(() => {
            if (subtask.isResolved()) {
                subtask.deliverResolve();
            }
            const event = {
                code: _context.events.SUBTASK,
                payload0: subtask.waitableRep()!,
                payload1: subtask.getStateNumber(),
            };
            return event;
        });
    });
    // This is a hack to maintain backwards compatibility with
    // manually-specified async imports, used in wasm exports that are
    // not actually async (but are specified as so).
    //
    // This is not normal p3 sync behavior but instead anticipating that
    // the caller that is doing manual async will be waiting for a promise that
    // resolves to the *actual* result.
    //
    // TODO(breaking): remove once manually specified async is removed
    //
    // There are a few cases:
    // 1. sync function with async types (e.g. `f: func() -> stream<u32>`)
    // 2. async function with async types (e.g. `f: async func() -> stream<u32>`)
    // 3. async function with sync types (e.g. `f: async func() -> list<u32>`)
    // 4. sync function with non-async types (e.g. `f: func() -> list<u32>`)
    //
    // This hack *only* applies to 4 -- the case where an async JS host function
    // is supplied to a Wasm export which does *not* need to do any async abi
    // lifting/lowering (async ABI did not exist when JSPI integratiton was
    // initially merged to enable asynchronously returning values from the host)
    //
    const requiresManualAsyncResult = !isAsync && !funcTypeIsAsync && isManualAsync;
    let manualAsyncResult: ReturnType<typeof promiseWithResolvers<unknown>> | undefined;
    if (requiresManualAsyncResult) {
        manualAsyncResult = promiseWithResolvers();
    }
    const finishAsyncLower = () => {
        const subtaskState = subtask.getStateNumber();
        if (subtaskState < 0 || subtaskState >= 2 ** 4) {
            throw new Error('invalid subtask state, out of valid range');
        }
        let res;
        // An async-lowered import whose callee resolved synchronously returns
        // [Subtask.State.RETURNED] only and no subtask handle is exposed.
        if (subtask.isReturned()) {
            // The on-progress handler parked a pending SUBTASK event on the
            // waitable when the import settled. The guest never learns this
            // waitable's rep (we return a bare RETURNED state), so consume the
            // event now -- otherwise a stale event is left parked forever (and
            // the waitable can never be dropped).
            if (subtask.hasPendingEvent()) {
                subtask.getPendingEvent();
            }
            if (!subtask.resolveDelivered()) {
                subtask.deliverResolve();
            }
            if (subtask.waitableRep() !== null) {
                const removed = cstate.handles.remove(subtask.waitableRep()!);
                if (removed !== subtask) {
                    throw new Error('subtask handle cleanup removed unexpected entry');
                }
            }
            subtask.drop();
            res = subtaskState;
        } else {
            res = (Number(subtask.ensureHandle()) << 4) | subtaskState;
        }
        debugLog('[lowerImport()] async-lowered import return', {
            fnName: importFn.fnName,
            componentIdx,
            subtaskID: subtask.id(),
            waitableRep: subtask.waitableRep(),
            subtaskState,
            eagerReturn: subtask.isReturned(),
            packedResult: res,
        });
        return res;
    };

    // Canonical async lowering returns status in the current guest slice.
    // Start now so each trampoline captures its own subtask before the next import.
    if (isAsync) {
        try {
            if (!subtask.cancellationRequested() && task.taskState() !== _context.AsyncTask.State.CANCEL_PENDING) {
                const pending = withCurrentTaskMeta(_context.registers, {
                    taskID: task.id(),
                    threadID,
                    componentIdx: task.componentIdx(),
                    fn: () => importFn(...params),
                });
                Promise.resolve(pending).catch((err) => {
                    task.setErrored(err);
                    task.reject(err);
                });
            }
            return finishAsyncLower();
        } catch (err) {
            task.setErrored(err);
            task.reject(err);
            throw err;
        }
    }

    // Build a response that *may* resolve quickly
    queueMicrotask(async () => {
        try {
            // The async host call has not started yet. If the
            // enclosing guest task has pending cancellation,
            // leave this subtask for the guest cancellation callback
            // to retire without invoking host code after cancellation.
            // Imports issued by the cancellation callback itself
            // must still run so the guest can finish its cleanup.
            if (subtask.cancellationRequested() || task.taskState() === _context.AsyncTask.State.CANCEL_PENDING) {
                return;
            }
            debugLog('[lowerImport()] calling lowered import', { importFn, params });
            await withCurrentTaskMetaAsync(_context.registers, {
                taskID: task.id(),
                threadID,
                componentIdx: task.componentIdx(),
                fn: () => importFn(...params),
            });
            if (requiresManualAsyncResult) {
                manualAsyncResult!.resolve(subtask.getResult());
            }
        } catch (err) {
            debugLog('[lowerImport()] import fn error:', err);
            if (requiresManualAsyncResult) {
                manualAsyncResult!.reject(err);
                return;
            }
            task.setErrored(err);
            task.reject(err);
        }
    });
    if (requiresManualAsyncResult) {
        return manualAsyncResult!.promise;
    }
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            // NOTE: whether the import settled before this timer fires is a race
            // between the import's settlement (microtask + any host timers), this
            // setTimeout(0), and JSPI resume scheduling -- engines order these
            // differently (e.g. V8 13.6 vs 14.x). Either outcome is CABI-legal,
            // but the invariants of each branch must hold independently, and this
            // promise must *always* settle (an unhandled throw here would leave a
            // JSPI-suspended guest suspended forever).
            try {
                resolve(finishAsyncLower());
            } catch (err) {
                reject(err);
            }
        }, 0);
    });
}

// LowerImportBackwardsCompat
export function lowerImportBackwardsCompat(
    _context: TaskCompatImportRuntimeContext,
    args: TaskLowerImportOptions,
    ...params: unknown[]
): ReturnType<AsyncTaskModule['lowerImportBackwardsCompat']> {
    debugLog('[lowerImportBackwardsCompat()] args', { args, params });
    const {
        componentIdx,
        isAsync,
        isManualAsync,
        resultLowerFns,
        hasResultPointer,
        funcTypeIsAsync,
        memoryIdx,
        getMemoryFn,
        getReallocFn,
        importFn,
        stringEncoding,
    } = args;
    checkMayLeave(_context.mayLeave, componentIdx);
    const meta = getCurrentTaskMeta(_context.registers, componentIdx);
    let taskMeta = meta && getCurrentTask(_context, componentIdx, meta.taskID);
    let createdTask: AsyncTaskType | undefined;
    // Some components depend on initialization logic (i.e. `_initialize` or some such
    // core wasm export) that is embedded in the component, but is not executed or wizer'd
    // away before the transpiled component is attempted to be used.
    //
    // These components execut their initialization logic *when they are imported* in the
    // transpiled context -- so we may get a call to an export that is lowered without going
    // through `CallWasm` or `CallInterface`.
    //
    // A nested synchronous call can leave global metadata for a task
    // that has already exited. Treat it like a call with no current task.
    if (!taskMeta) {
        if (funcTypeIsAsync || (isAsync && !isManualAsync)) {
            throw new Error('p3 async wasm exports cannot use backwards compat auto-task init');
        }
        const {
            task: newTask,
            taskID: newTaskID,
            threadID: newThreadID,
        } = createNewCurrentImplicitThread(_context.creation, {
            componentIdx,
            isAsync,
            isManualAsync,
            callingWasmExport: false,
        });
        createdTask = newTask;
        // Since we're managing the task creation ourselves we must clear ourselves
        createdTask.registerOnResolveHandler(() => {
            clearCurrentTaskMeta(_context.registers, {
                taskID: newTaskID,
                threadID: newThreadID,
                componentIdx: task.componentIdx(),
            });
        });
        setCurrentTaskMeta(_context.registers, {
            componentIdx,
            taskID: newTaskID,
            threadID: newThreadID,
        });
        taskMeta = getCurrentTask(_context, componentIdx, newTaskID);
    }
    if (!taskMeta) {
        throw new Error('invalid/missing async task meta');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('invalid/missing async task');
    }
    getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!task.mayBlock() && funcTypeIsAsync && !isAsync) {
        throw new Error('non async exports cannot synchronously call async functions');
    }
    // If there is an existing task, this should be part of a subtask
    const memory = getMemoryFn();
    // Canonical ABI lower appends result storage as a trailing
    // param when async lower has any flat result, or sync lower
    // has more than one flat result.
    const resultPtr = hasResultPointer ? (params[params.length - 1] as number) >>> 0 : undefined;
    const subtask = task.createSubtask({
        componentIdx,
        parentTask: task,
        fnName: importFn.fnName,
        isAsync,
        isManualAsync,
        callMetadata: {
            memoryIdx,
            memory,
            realloc: getReallocFn?.(),
            getReallocFn,
            resultPtr,
            lowers: resultLowerFns,
            funcTypeIsAsync,
            stringEncoding,
        },
    });
    task.setReturnMemoryIdx(memoryIdx);
    task.setReturnMemory(getMemoryFn());
    subtask.onStart();
    // If dealing with a sync lowered sync function, we can directly return results
    //
    // TODO(breaking): remove once we get rid of manual async import specification,
    // as func types cannot be detected in that case only (and we don't need that w/ p3)
    if (!isManualAsync && !isAsync && !funcTypeIsAsync) {
        if (createdTask) {
            createdTask.enterSync();
        }
        importFn(...params);
        // TODO(breaking): remove once we get rid of manual async import specification,
        // as func types cannot be detected in that case only (and we don't need that w/ p3)
        if (!funcTypeIsAsync && !subtask.isReturned()) {
            throw new Error('post-execution subtasks must either be async or returned');
        }
        const syncRes = subtask.getResult();
        if (createdTask) {
            createdTask.resolve([syncRes]);
            createdTask.exit();
        }
        return syncRes;
    }
    // Sync-lowered async functions requires async behavior because the callee *can* block,
    // but this call must *act* synchronously and return immediately with the result
    // (i.e. not returning until the work is done)
    //
    // TODO(breaking): remove checking for manual async specification here, once we can go p3-only
    //
    if (!isManualAsync && !isAsync && funcTypeIsAsync) {
        const { promise, resolve, reject } = promiseWithResolvers();
        queueMicrotask(async () => {
            try {
                await importFn(...params);
                if (!subtask.isResolved()) {
                    await task.suspendUntil({ readyFn: () => subtask.isResolved() });
                }
                resolve(subtask.getResult());
            } catch (err) {
                reject(err);
            }
        });
        return promise;
    }
    // NOTE: at this point we know that we are working with an async lowered import
    const subtaskState = subtask.getStateNumber();
    if (subtaskState < 0 || subtaskState >= 2 ** 4) {
        throw new Error('invalid subtask state, out of valid range');
    }
    subtask.setOnProgressFn(() => {
        subtask.setPendingEvent(() => {
            if (subtask.isResolved()) {
                subtask.deliverResolve();
            }
            const event = {
                code: _context.events.SUBTASK,
                payload0: subtask.waitableRep()!,
                payload1: subtask.getStateNumber(),
            };
            return event;
        });
    });
    // This is a hack to maintain backwards compatibility with
    // manually-specified async imports, used in wasm exports that are
    // not actually async (but are specified as so).
    //
    // This is not normal p3 sync behavior but instead anticipating that
    // the caller that is doing manual async will be waiting for a promise that
    // resolves to the *actual* result.
    //
    // TODO(breaking): remove once manually specified async is removed
    //
    // There are a few cases:
    // 1. sync function with async types (e.g. `f: func() -> stream<u32>`)
    // 2. async function with async types (e.g. `f: async func() -> stream<u32>`)
    // 3. async function with sync types (e.g. `f: async func() -> list<u32>`)
    // 4. sync function with non-async types (e.g. `f: func() -> list<u32>`)
    //
    // This hack *only* applies to 4 -- the case where an async JS host function
    // is supplied to a Wasm export which does *not* need to do any async abi
    // lifting/lowering (async ABI did not exist when JSPI integratiton was
    // initially merged to enable asynchronously returning values from the host)
    //
    const requiresManualAsyncResult = !isAsync && !funcTypeIsAsync && isManualAsync;
    let manualAsyncResult: ReturnType<typeof promiseWithResolvers<unknown>> | undefined;
    if (requiresManualAsyncResult) {
        manualAsyncResult = promiseWithResolvers();
    }
    queueMicrotask(async () => {
        try {
            debugLog('[lowerImportBackwardsCompat()] calling lowered import', { importFn, params });
            if (createdTask) {
                await createdTask.enter();
            }
            const asyncRes = await importFn(...params);
            if (requiresManualAsyncResult) {
                manualAsyncResult!.resolve(subtask.getResult());
            }
            if (createdTask) {
                createdTask.resolve([asyncRes]);
            }
        } catch (err) {
            debugLog('[lowerImportBackwardsCompat()] import fn error:', err);
            if (requiresManualAsyncResult) {
                manualAsyncResult!.reject(err);
                return;
            }
            task.setErrored(err);
            task.reject(err);
        }
    });
    if (requiresManualAsyncResult) {
        return manualAsyncResult!.promise;
    }
    debugLog('[lowerImportBackwardsCompat()] async-lowered import return', {
        fnName: importFn.fnName,
        componentIdx,
        subtaskID: subtask.id(),
        waitableRep: subtask.waitableRep(),
        subtaskState,
        packedResult: (Number(subtask.waitableRep()) << 4) | subtaskState,
    });
    return (Number(subtask.ensureHandle()) << 4) | subtaskState;
}

// EnterSymmetricSyncGuestCall
export function symmetricSyncGuestCallEnter(
    _context: TaskSymmetricEnterContext,
    callerComponentIdx: number,
    calleeIsAsync: boolean,
    calleeComponentIdx: number,
    syncOnly = false,
): ReturnType<AsyncTaskModule['symmetricSyncGuestCallEnter']> {
    debugLog('[symmetricSyncGuestCallEnter()] args', {
        callerComponentIdx,
        calleeIsAsync,
        calleeComponentIdx,
    });
    const cstate = getOrCreateAsyncState(_context.lookup, calleeComponentIdx);
    // The conditional JSPI trampoline probes this path before
    // invoking its Suspending fallback. Avoid creating either
    // task until the probe knows that entry can complete in the
    // current Wasm slice.
    if (syncOnly && calleeIsAsync && cstate.isExclusivelyLocked()) {
        return 0;
    }
    const callerTaskMeta = getCurrentTask(_context, callerComponentIdx);
    if (!callerTaskMeta) {
        throw new Error('missing current caller task metadata');
    }
    const callerTask = callerTaskMeta.task;
    if (!callerTask) {
        throw new Error('missing current caller task');
    }
    const subtask = callerTask.createSubtask({
        componentIdx: callerComponentIdx,
        parentTask: callerTask,
        // This adapter is a synchronous lowering even when
        // the callee's component function is async. Its
        // bookkeeping subtask is never exposed to the guest.
        isAsync: false,
    });
    const { task: newTask, threadID: newThreadID } = createNewCurrentImplicitThread(_context.creation, {
        componentIdx: calleeComponentIdx,
        isAsync: !!calleeIsAsync,
        // A manually-async root uses one JSPI stack through any
        // sync-typed component adapters on the way to its configured
        // async import, so preserve that compatibility mode here.
        isManualAsync: callerTask.isManualAsync(),
        entryFnName: ['task', callerTask.id(), 'subtask', subtask.id(), 'task', 'new-sync-guest-task'].join('/'),
        // Sync-typed functions do not participate in an
        // instance's async exclusive-lock protocol. This is
        // what permits ordinary synchronous reentrance.
        callingWasmExport: !!calleeIsAsync,
    });
    newTask.setFuncTypeIsAsync(!!calleeIsAsync);
    subtask.setChildTask(newTask);
    newTask.setParentSubtask(subtask);
    subtask.onStart();
    const callerThreadMeta = getCurrentTaskMeta(_context.registers, callerComponentIdx);
    if (!callerThreadMeta || callerThreadMeta.taskID !== callerTask.id()) {
        throw new Error('missing current caller thread metadata');
    }
    const callerThreadID = callerThreadMeta.threadID;
    const finishEnter = () => {
        setCurrentTaskMeta(_context.registers, {
            taskID: newTask.id(),
            threadID: newThreadID,
            componentIdx: newTask.componentIdx(),
        });
        _context.stack.push({
            componentIdx: newTask.componentIdx(),
            threadID: newThreadID,
            callerThreadID,
            previousTaskMayBlock: (_context.mayBlock as TaskMutableRegister).value,
        });
        (_context.mayBlock as TaskMutableRegister).value = newTask.mayBlock() ? 1 : 0;
        debugLog('[symmetricSyncGuestCallEnter()] finished preparing', {
            callerComponentIdx,
            calleeComponentIdx,
            subtaskID: subtask.id(),
            newTaskID: newTask.id(),
        });
    };
    // Take the callee's per-slice exclusive lock. Uncontended entry
    // stays fully synchronous (returning a non-promise means the
    // Suspending-wrapped trampoline does not suspend, so pure-sync
    // compositions keep working without WebAssembly.promising).
    // Contended entry queues FIFO on the holder instead of silently
    // stealing the hold; the returned
    // promise suspends the caller's (JSPI) stack until ownership.
    if (!newTask.needsExclusiveLock()) {
        finishEnter();
        return 1;
    }
    if (!cstate.isExclusivelyLocked()) {
        cstate.exclusiveLock(newTask.id());
        finishEnter();
        return 1;
    }
    return cstate.acquireExclusiveLock(newTask.id())!.then(() => {
        finishEnter();
        return 1;
    });
}

// ExitSymmetricSyncGuestCall
export function symmetricSyncGuestCallExit(
    _context: TaskSymmetricExitContext,
): ReturnType<AsyncTaskModule['symmetricSyncGuestCallExit']> {
    const { componentIdx, callerThreadID, previousTaskMayBlock } = _context.stack.pop()!;
    getOrCreateAsyncState(_context.lookup, componentIdx);
    const taskMeta = getCurrentTask(_context, componentIdx);
    if (!taskMeta) {
        throw new Error('missing current caller task metadata');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('missing current caller task');
    }
    debugLog('[symmetricSyncGuestCallExit()] exiting', {
        componentIdx,
        taskID: task.id(),
        subtask: task.getParentSubtask(),
        subtaskID: task.getParentSubtask()?.id(),
        parent: task.getParentSubtask()?.getParentTask(),
    });
    const callerTask = task.getParentSubtask()!.getParentTask();
    task.resolve([]);
    task.exit();
    (_context.mayBlock as TaskMutableRegister).value = previousTaskMayBlock;
    // Restoring the caller directly is important for recursive
    // calls into the same component: an enclosing synchronous
    // metadata wrapper may already have restored its task before
    // this exit trampoline runs.
    setCurrentTaskMeta(_context.registers, {
        taskID: callerTask.id(),
        threadID: callerThreadID,
        componentIdx: callerTask.componentIdx(),
    });
}

export function initializeAsyncThreadClass(context: AsyncThreadClassContext): AsyncThreadConstructor {
    const { lookup: _lookup, registers: _registers } = context;
    class AsyncThread {
        static State = {
            // Explicitly spawned (`thread.new-indirect`) threads start
            // here; the implicit thread of a task skips straight to
            // RUNNING since it is the task's own entry.
            NOT_STARTED: 'not-started',
            RUNNING: 'running',
            COMPLETED: 'completed',
        } as const;

        // Component-instance-scoped id (the canonical ABI's
        // `Thread.index`) -- globally unique within the instance,
        // *not* per task, since a thread of one task may be
        // targeted (e.g. by `thread.resume-later`) by code
        // running in a different task of the same instance.
        // Assigned post-construction by `Task#addThread()`, which
        // is the only code allowed to insert into the instance's
        // thread table.
        #id: number | null = null;
        #componentIdx: number;
        #task: AsyncTaskType;
        #state: 'not-started' | 'running' | 'completed';
        #startFn: (() => unknown) | null = null;
        storage = [0, 0];

        constructor(opts: AsyncThreadOptions) {
            if (opts?.componentIdx === undefined) {
                throw new TypeError('missing component id during thread creation');
            }
            this.#componentIdx = opts.componentIdx;

            if (!opts?.task) {
                throw new TypeError('missing task during thread creation');
            }
            this.#task = opts.task;

            // Explicitly spawned threads provide a `startFn` and begin
            // NOT_STARTED; the task's own implicit thread has none and
            // is already running by the time it's constructed.
            if (opts.startFn) {
                this.#startFn = opts.startFn;
                this.#state = AsyncThread.State.NOT_STARTED;
            } else {
                this.#state = AsyncThread.State.RUNNING;
            }
        }

        id() {
            return this.#id!;
        }
        setId(id: number) {
            if (this.#id !== null) {
                throw new Error('thread id can only be assigned once');
            }
            this.#id = id;
        }
        componentIdx() {
            return this.#componentIdx;
        }
        task() {
            return this.#task;
        }
        taskID() {
            return this.#task.id();
        }
        state() {
            return this.#state;
        }

        // Delegate task-scoped bookkeeping that doesn't yet have a
        // thread-specific notion (cancellation, progress waiters,
        // the subtask this task is answering) to the owning task.
        isCancelled() {
            return this.#task.isCancelled();
        }
        isRejected() {
            return this.#task.isRejected();
        }
        notifyProgress() {
            return this.#task.notifyProgress();
        }
        entryFnName() {
            return this.#task.entryFnName();
        }
        getParentSubtask() {
            return this.#task.getParentSubtask();
        }

        async suspend(opts: TaskSuspendOptions & { releaseLock?: boolean }) {
            const cstate = getOrCreateAsyncState(_lookup, this.#componentIdx);
            const task = this.#task;
            task.endFirstSlice();
            task.settleCompletion();
            const { cancellable, readyFn, releaseLock = false } = opts;
            if (task.deliverPendingCancel({ cancellable })) {
                return false;
            }
            const reacquireLock = releaseLock && task.needsExclusiveLock() && cstate.exclusivelyLockedBy(task.id());
            if (reacquireLock) {
                cstate.exclusiveRelease(task.id());
            }
            try {
                const keepGoing = await cstate.suspendThread({
                    ...opts,
                    cancellable: !!cancellable,
                    thread: this,
                    readyFn: () => (cancellable && task.cancellationPending()) || readyFn(),
                });
                cstate.throwIfInterrupted();
                if (keepGoing && task.deliverPendingCancel({ cancellable })) {
                    return false;
                }
                return !!keepGoing;
            } finally {
                if (reacquireLock && !cstate.exclusivelyLockedBy(task.id())) {
                    await cstate.acquireExclusiveLock(task.id());
                }
            }
        }

        // Begins running a NOT_STARTED (explicitly spawned) thread's
        // start function. Runs detached -- the caller (`thread.resume-later`)
        // does not wait for the thread to finish or even reach its first
        // suspension point.
        start() {
            if (this.#state !== AsyncThread.State.NOT_STARTED) {
                throw new Error(`cannot start thread [${this.#id}] in state [${this.#state}]`);
            }
            this.#state = AsyncThread.State.RUNNING;
            const startFn = this.#startFn!;
            this.#startFn = null;

            withCurrentTaskMetaAsync(_registers, {
                threadID: this.#id!,
                taskID: this.#task.id(),
                componentIdx: this.#componentIdx,
                fn: async () => {
                    getOrCreateAsyncState(_lookup, this.#componentIdx).throwIfInterrupted();
                    return startFn();
                },
            })
                .then(() => {
                    this.#state = AsyncThread.State.COMPLETED;
                    this.#task.removeThread(this);
                })
                .catch((err) => {
                    err = recordTrap(context.traps, this.#componentIdx, err);
                    this.#state = AsyncThread.State.COMPLETED;
                    debugLog('[AsyncThread#start()] spawned thread errored', {
                        threadID: this.#id!,
                        taskID: this.#task.id(),
                        componentIdx: this.#componentIdx,
                        err,
                    });
                    this.#task.setErrored(err);
                    this.#task.reject(err);
                    this.#task.removeThread(this);
                });
        }
    }
    return AsyncThread;
}

export function asyncYield(_context: ThreadControlContext, ctx: ThreadOperationOptions) {
    debugLog('[asyncYield()] args', { ctx });
    const { componentIdx, isCancellable } = ctx;
    const { thread, task } = currentThreadOrThrow(_context, componentIdx);

    // A nonblocking task cannot suspend its Wasm stack. The
    // Canonical ABI permits yield to complete without scheduling
    // another thread, so take that synchronous fast path here.
    if (!task.mayBlock()) {
        getOrCreateAsyncState(_context.lookup, componentIdx).runTickLoop();
        return isCancellable && thread.isCancelled() ? 1 : 0;
    }

    // A canonical thread.yield must give the scheduler a chance to
    // run other work before reporting NOT_CANCELLED. Unlike an
    // ordinary ready wait, it cannot take the immediate-completion
    // shortcut.
    return thread
        .suspend({
            // Cancellation is delivered only while an implicit
            // callback thread is parked in its event loop.
            cancellable: false,
            readyFn: () => true,
        })
        .then((keepGoing) => (keepGoing ? 0 : 1));
}

export function threadIndex(_context: ThreadLookupContext, componentIdx: number) {
    const meta = getCurrentTaskMeta(_context.registers, componentIdx);
    if (!meta) {
        throw new Error('missing/incomplete global current thread meta for component idx [' + componentIdx + ']');
    }
    return meta.threadID;
}

export async function threadSuspend(_context: ThreadControlContext, ctx: ThreadOperationOptions) {
    debugLog('[threadSuspend()] args', { ctx });
    const { componentIdx, isCancellable } = ctx;
    const { thread } = currentThreadOrThrow(_context, componentIdx);

    const keepGoing = await thread.suspend({
        cancellable: isCancellable,
        suspended: true,
        readyFn: () => false,
    });
    return keepGoing ? 0 : 1;
}

export function threadNewIndirect(
    _context: ThreadNewContext,
    ctx: { componentIdx: number; getStartFuncTableFn: () => WebAssembly.Table },
    startFuncIdx: number,
    context: number,
) {
    const { componentIdx, getStartFuncTableFn } = ctx;
    debugLog('[threadNewIndirect()] args', { componentIdx, startFuncIdx, context });

    const table = getStartFuncTableFn();
    if (!table) {
        throw new Error('missing start function table for thread.new-indirect');
    }

    // (the index is a core i32; an out-of-range index traps like `call_indirect`)
    const tableIdx = startFuncIdx >>> 0;
    if (tableIdx >= table.length) {
        throw new _context.RuntimeError('thread.new-indirect: table index out of bounds');
    }
    const startFuncRef = table.get(tableIdx);
    if (typeof startFuncRef !== 'function') {
        throw new _context.RuntimeError('thread.new-indirect: uninitialized table element');
    }
    if (!_context.start.checked.has(startFuncRef)) {
        try {
            new _context.start.platform.Instance(_context.start.typeCheck, { '': { f: startFuncRef } });
        } catch (err) {
            if (!(err instanceof _context.start.platform.LinkError)) {
                throw err;
            }
            throw new _context.RuntimeError('thread.new-indirect: start function type mismatch');
        }
        _context.start.checked.add(startFuncRef);
    }
    const promisingStartFuncRef = _context.start.platform.promising(startFuncRef);

    const { task } = currentThreadOrThrow(_context, componentIdx);

    const newThread = task.addThread(
        new _context.AsyncThread({
            componentIdx,
            task,
            startFn: () => promisingStartFuncRef(context),
        }),
    );

    // Suspended, not ready: only an explicit `thread.resume-later`
    // (never the tick loop's own readiness polling) may wake it.
    getOrCreateAsyncState(_context.lookup, componentIdx).suspendThread({
        thread: newThread,
        cancellable: false,
        suspended: true,
        readyFn: () => false,
        onResume: () => newThread.start(),
    });

    return newThread.id();
}

export function threadResumeLater(_context: ThreadControlContext, ctx: { componentIdx: number }, threadHandle: number) {
    const { componentIdx } = ctx;
    debugLog('[threadResumeLater()] args', { componentIdx, threadHandle });

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!cstate) {
        throw new Error(`missing async state for component idx [${componentIdx}]`);
    }
    const thread = threadHandle === 0 ? undefined : cstate.threads.get(threadHandle >>> 0);
    if (!thread) {
        throw new _context.RuntimeError(`unknown handle index ${threadHandle}`);
    }

    if (!cstate.markThreadReady(thread)) {
        throw new _context.RuntimeError(`thread [${threadHandle}] is not suspended, cannot resume-later`);
    }
}

export function threadSuspendThenResume(
    _context: ThreadControlContext,
    ctx: ThreadOperationOptions,
    threadIdx: number,
) {
    const { componentIdx, isCancellable } = ctx;
    debugLog('[threadSuspendThenResume()] args', { componentIdx, isCancellable, threadIdx });
    const { thread } = currentThreadOrThrow(_context, componentIdx);

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    const other = threadIdx === 0 ? undefined : cstate.threads.get(threadIdx >>> 0);
    if (!other || other === thread || !cstate.isThreadSuspended(other)) {
        throw new _context.RuntimeError('cannot resume thread which is not suspended');
    }

    const suspension = thread.suspend({
        cancellable: isCancellable,
        suspended: true,
        readyFn: () => false,
    });
    cstate.resumeThread(other);

    return suspension.then((keepGoing) => (keepGoing ? 0 : 1));
}

export function threadYieldThenResume(_context: ThreadControlContext, ctx: ThreadOperationOptions, threadIdx: number) {
    const { componentIdx, isCancellable } = ctx;
    debugLog('[threadYieldThenResume()] args', { componentIdx, isCancellable, threadIdx });
    const { thread } = currentThreadOrThrow(_context, componentIdx);

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    const other = threadIdx === 0 ? undefined : cstate.threads.get(threadIdx >>> 0);
    if (!other || other === thread || !cstate.isThreadSuspended(other)) {
        throw new _context.RuntimeError('cannot resume thread which is not suspended');
    }

    const suspension = thread.suspend({
        cancellable: isCancellable,
        suspended: false,
        readyFn: () => true,
    });
    cstate.resumeThread(other);

    return suspension.then((keepGoing) => (keepGoing ? 0 : 1));
}

export function threadSuspendThenPromote(
    _context: ThreadControlContext,
    ctx: ThreadOperationOptions,
    threadIdx: number,
) {
    const { componentIdx, isCancellable } = ctx;
    debugLog('[threadSuspendThenPromote()] args', { componentIdx, isCancellable, threadIdx });
    const { thread } = currentThreadOrThrow(_context, componentIdx);

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    const other = threadIdx === 0 ? undefined : cstate.threads.get(threadIdx >>> 0);
    // An index that names no live thread traps; so does a self
    // switch (the same check as the `*-then-resume` built-ins).
    if (!other) {
        throw new _context.RuntimeError('invalid thread handle');
    }
    if (other === thread) {
        throw new _context.RuntimeError('cannot resume thread which is not suspended');
    }

    if (cstate.isThreadReady(other)) {
        const suspension = thread.suspend({
            cancellable: isCancellable,
            suspended: true,
            readyFn: () => false,
        });
        cstate.resumeThread(other);
        return suspension.then((keepGoing) => (keepGoing ? 0 : 1));
    }

    return threadSuspend(_context, ctx);
}

export function threadYieldThenPromote(_context: ThreadControlContext, ctx: ThreadOperationOptions, threadIdx: number) {
    const { componentIdx, isCancellable } = ctx;
    debugLog('[threadYieldThenPromote()] args', { componentIdx, isCancellable, threadIdx });
    const { thread } = currentThreadOrThrow(_context, componentIdx);

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    const other = threadIdx === 0 ? undefined : cstate.threads.get(threadIdx >>> 0);
    // An index that names no live thread traps; so does a self
    // switch (the same check as the `*-then-resume` built-ins).
    if (!other) {
        throw new _context.RuntimeError('invalid thread handle');
    }
    if (other === thread) {
        throw new _context.RuntimeError('cannot resume thread which is not suspended');
    }

    if (cstate.isThreadReady(other)) {
        const suspension = thread.suspend({
            cancellable: isCancellable,
            suspended: false,
            readyFn: () => true,
        });
        cstate.resumeThread(other);
        return suspension.then((keepGoing) => (keepGoing ? 0 : 1));
    }

    return asyncYield(_context, ctx);
}

export function initializeThreadStartChecks(platform: ThreadStartPlatform): ThreadStartChecks {
    return {
        platform,
        checked: new WeakSet(),
        typeCheck: new platform.Module(
            new Uint8Array([
                0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x01, 0x7f, 0x00, 0x02, 0x06,
                0x01, 0x00, 0x01, 0x66, 0x00, 0x00,
            ]),
        ),
    };
}
