import type {
    AsyncSubtaskClassContext,
    AsyncSubtaskConstructor,
    AsyncTask as AsyncTaskType,
    SubtaskLender,
    ComponentWaitable,
    TaskCallback,
    TaskPostReturn,
    WaitableEvent,
    TaskCallMetadata,
    AsyncSubtaskOptions,
    ComponentWaitableSet,
} from '../../runtime.js';
import { debugLog } from '../core/debug.js';
import { isThenable } from './helpers.js';
import { disposeHostValue, lookupMemories } from '../core.js';
import { getOrCreateAsyncState } from '../component.js';

// Canonical subtask state codes are fixed across stores and providers.
const STARTING = 0;
const STARTED = 1;
const RETURNED = 2;
const CANCELLED_BEFORE_STARTED = 3;
const CANCELLED_BEFORE_RETURNED = 4;
type SubtaskState = 0 | 1 | 2 | 3 | 4;

export function initializeAsyncSubtaskClass(context: AsyncSubtaskClassContext): AsyncSubtaskConstructor {
    const { lookup: _lookup, memories: _memories, disposeSymbol: _disposeSymbol, RuntimeError } = context;
    class AsyncSubtask {
        static _ID = 0n;
        static State = {
            STARTING,
            STARTED,
            RETURNED,
            CANCELLED_BEFORE_STARTED,
            CANCELLED_BEFORE_RETURNED,
        } as const;
        #id!: bigint;
        #state: SubtaskState = STARTING;
        #componentIdx!: number;
        #parentTask!: AsyncTaskType;
        #childTask: AsyncTaskType | null = null;
        #cancelRequested = false;
        #lenders: SubtaskLender[] | null = null;
        #waitable!: ComponentWaitable;
        #callbackFn: TaskCallback | null = null;
        #postReturnFn: TaskPostReturn | null = null;
        #onProgressFn: (() => void) | null = null;
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
        setCallbackFn(f?: TaskCallback | null, _name?: string | null) {
            if (!f) {
                return;
            }
            if (this.#callbackFn) {
                throw new Error('callback fn can only be set once');
            }
            this.#callbackFn = f;
        }
        getCallbackFnName() {
            return this.#callbackFn?.name;
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
            return this.#state == STARTING;
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
            if (this.#resolved && this.#state !== RETURNED) {
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
            this.#onProgressFn?.();
            // Starting a nested operation is a task execution boundary.
            // In particular, a cancellation handler may synchronously
            // enter an import which then suspends in the host.  Wake a
            // supertask that is driving one cancellation slice so an
            // async `subtask.cancel` can report BLOCKED without waiting
            // for that nested operation to finish.
            this.#parentTask.notifyProgress();
            this.#state = STARTED;
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
            this.#onProgressFn?.();
            if (this.#state >= RETURNED) {
                throw new Error('cannot reject a completed subtask');
            }
            this.#state = this.#state === STARTING ? CANCELLED_BEFORE_STARTED : CANCELLED_BEFORE_RETURNED;
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
            this.#onProgressFn?.();
            if (subtaskValue === null && this.#cancelRequested) {
                if (this.#state >= RETURNED) {
                    throw new Error('resolved subtask must have been started before cancellation');
                }
                this.#state = this.#state === STARTING ? CANCELLED_BEFORE_STARTED : CANCELLED_BEFORE_RETURNED;
            } else {
                if (this.#state !== STARTED) {
                    throw new Error('resolved subtask must have been started before completion');
                }
                this.#state = RETURNED;
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
            const returned = this.#state === RETURNED;
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
            return this.#state === RETURNED;
        }
        getCallMetadata() {
            return this.#callMetadata;
        }
        isResolved() {
            // Every terminal state follows STARTING and STARTED in the state enum.
            return this.#state >= RETURNED;
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
