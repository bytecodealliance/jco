import { withConstructorStatics } from './core/shared-class.js';
import { onNextMacrotask } from './core/scheduling.js';
import { isPromiseLike } from './core/promises.js';
import type {
    ComponentModule,
    ComponentDeadlockDetail,
    ComponentAsyncStateConstructor,
    ComponentAsyncStateContext,
    ComponentAsyncStates,
    ComponentNormalizeTrapContext,
    ComponentDeadlockContext,
    ComponentHostOperationContext,
    ComponentMayLeaveContext,
    ComponentRecordTrapContext,
    ComponentStateLookupContext,
    SuspendedThread,
    ComponentThread,
    SuspendThreadOptions,
    SuspendTaskOptions,
    ComponentTask,
    ComponentSyncCall,
    RepTable as RepTableType,
} from '../runtime.js';
import { debugLog } from './core/debug.js';
import { promiseWithResolvers } from './core/promises.js';
import { getHandleIndexSpace } from './resource.js';

export { initializeCallTracking } from './component/call-tracking.js';
export { checkIdle, reportTrap, stopInstance, whenIdle } from './component/lifecycle.js';

export const initializeInstanceFlags: ComponentModule['initializeInstanceFlags'] = () => new Map();
export const initializeStoreTrap: ComponentModule['initializeStoreTrap'] = (onTrap = null) => ({
    error: null,
    stopped: false,
    resourceTables: [],
    stopWaiters: new Set(),
    disposed: new WeakSet(),
    onTrap,
    trapsReported: new WeakSet(),
});
export const initializeStoreAsyncState: ComponentModule['initializeStoreAsyncState'] = () => ({
    deadlockCheck: null,
    pendingHostOperations: 0,
    hostOperationsByComponent: null,
    hostWakeupScheduled: false,
    idleWaiters: new Set(),
    syncCalls: [],
    heldResumptions: [],
});
export const initializeComponentAsyncStates: ComponentModule['initializeComponentAsyncStates'] = () => new Map();
export const initializeCoreTrapMessages: ComponentModule['initializeCoreTrapMessages'] = (messages) =>
    new Map(Object.entries(messages));

export function normalizeCoreTrap<T>(context: ComponentNormalizeTrapContext, err: T): T {
    const { RuntimeError, messages: trapMessages } = context;
    if (!(err instanceof RuntimeError)) {
        return err;
    }
    const message = trapMessages.get(err.message);
    if (message !== undefined) {
        err.message = message;
    }
    return err;
}

/**
 * Describe a task for a deadlock or blocking trap.
 *
 * @param task - the task
 * @returns what the trap's `deadlockDetail` records about it
 */
function describeTask(task: ComponentTask) {
    return {
        taskID: task.id(),
        componentIdx: task.componentIdx(),
        state: task.taskState(),
        rootTaskID: task.getRootTask().id(),
    };
}

/**
 * Record which tasks were waiting, and on whose behalf, on a deadlock or
 * blocking trap. The message stays exactly what the Canonical ABI calls for, so
 * this rides alongside it: a deadlock reported from a real program is
 * otherwise a bare sentence, and the state that produced it is gone by the time
 * anyone reads the failure.
 *
 * @param err - the trap
 * @param pendingHostOperations - the host operations in flight
 * @param suspendedTasks - the tasks with a suspended thread
 * @param exitedTasks - the tasks whose threads all exited before they resolved
 * @param unresolvedRoots - the unresolved root tasks the trap fails
 */
function attachDeadlockDetail(
    err: Error,
    pendingHostOperations: number,
    suspendedTasks: Iterable<ComponentTask>,
    exitedTasks: Iterable<ComponentTask>,
    unresolvedRoots: Iterable<ComponentTask>,
) {
    (err as Error & { deadlockDetail: ComponentDeadlockDetail }).deadlockDetail = {
        pendingHostOperations,
        suspendedTasks: [...suspendedTasks].map(describeTask),
        // (a task whose threads all exited unresolved is often what the others wait on)
        exitedTasks: [...exitedTasks].map(describeTask),
        unresolvedRootTaskIDs: [...unresolvedRoots].map((root) => root.id()),
    };
}

export function checkForDeadlock(context: ComponentDeadlockContext) {
    const { storeAsyncState, storeTrap, asyncState } = context;
    if (storeAsyncState.deadlockCheck !== null || storeTrap.error !== null) {
        return;
    }
    storeAsyncState.deadlockCheck = setTimeout(() => {
        storeAsyncState.deadlockCheck = null;
        if (storeTrap.error !== null) {
            return;
        }
        // A call of a non-async-typed function decides for itself whether it
        // can go on (see `checkSyncCallBlocked`): host work of the instances
        // it holds back cannot help it.
        if (currentSyncCall(storeAsyncState) !== undefined) {
            checkSyncCallBlocked(context);
            return;
        }
        if (storeAsyncState.pendingHostOperations > 0) {
            return;
        }
        for (const state of asyncState.values()) {
            if (state.hasPendingSchedulerWork()) {
                state.runTickLoop();
                return;
            }
        }
        trapBlockedStore(context, undefined);
    }, 0);
}

/**
 * The innermost call of a non-async-typed function in progress, if any.
 *
 * @param storeAsyncState - the async state of the store
 * @returns the call, unless there is none or its task has settled
 */
function currentSyncCall(storeAsyncState: ComponentDeadlockContext['storeAsyncState']) {
    const call = storeAsyncState.syncCalls.at(-1);
    if (call === undefined || call.task.isResolvedState() || call.task.isRejected()) {
        return undefined;
    }
    return call;
}

/**
 * Trap a call of a non-async-typed function that can no longer go on.
 *
 * In the Canonical ABI (`canon_lift`, `not ft.async_`), whenever a thread of
 * such a call blocks or exits without switching to another thread, the call
 * resumes a ready thread of its instance, and traps if there is none. The
 * decision is taken where the thread blocks, so this runs as each thread
 * within the call blocks or exits, and when the deadlock check runs.
 *
 * The call goes on while:
 * - a thread of its instance is ready;
 * - a stack within the call has not blocked: it is running, about to resume,
 *   or in a host call (the host is still running on that stack);
 * - host work its instance started is pending, which may make one of its
 *   threads ready (the host may complete it at any time).
 *
 * Threads of other instances are never candidates, ready or not: only those
 * of the call's instance may be resumed while it is in progress.
 *
 * @param context - the deadlock context of the store
 * @returns whether the call trapped
 */
export function checkSyncCallBlocked(context: ComponentDeadlockContext) {
    const { storeAsyncState, storeTrap, asyncState } = context;
    if (storeTrap.error !== null || storeTrap.stopped) {
        return false;
    }
    const call = currentSyncCall(storeAsyncState);
    if (call === undefined) {
        return false;
    }
    const hostOperations = storeAsyncState.hostOperationsByComponent;
    // (host work of an unknown instance may be the call's)
    if (hostOperations?.has(call.componentIdx) || hostOperations?.has(-1)) {
        return false;
    }
    for (const state of asyncState.values()) {
        if (state.componentIdx() === call.componentIdx && state.hasSyncCallCandidate()) {
            return false;
        }
        if (state.hasRunningStackWithin(call)) {
            return false;
        }
    }
    trapBlockedStore(context, call);
    return true;
}

/**
 * Trap the store because it cannot make progress, failing every unresolved
 * task that waits.
 *
 * @param context - the deadlock context of the store
 * @param syncCall - the call of a non-async-typed function that blocked, when
 *   that is why the store cannot make progress
 */
function trapBlockedStore(context: ComponentDeadlockContext, syncCall: ComponentSyncCall | undefined) {
    const { RuntimeError, storeAsyncState, storeTrap, asyncState } = context;
    const suspendedTasks = new Set<ComponentTask>();
    for (const state of asyncState.values()) {
        for (const meta of state.suspendedTaskMetas()) {
            suspendedTasks.add(meta.task);
        }
    }

    const unresolvedRoots = new Set<ComponentTask>();
    for (const task of suspendedTasks) {
        const root = task.getRootTask();
        if (!root.isResolvedState()) {
            unresolvedRoots.add(root);
        }
    }
    // A task whose threads have all exited unresolved is not pending work:
    // it can never run again. Whoever waits on it is blocked for good.
    const exitedTasks = new Set<ComponentTask>();
    for (const state of asyncState.values()) {
        for (const task of state.unresolvedExitedTasks()) {
            exitedTasks.add(task);
            unresolvedRoots.add(task.getRootTask());
        }
    }

    // With a call of a non-async-typed function in progress, nothing but
    // its instance's threads may run until it returns, so running out of
    // ready threads is that call blocking with none to switch to (Canonical
    // ABI `canon_lift`), rather than a deadlock of the event loop.
    if (syncCall !== undefined) {
        unresolvedRoots.add(syncCall.task.getRootTask());
    }
    if (unresolvedRoots.size === 0) {
        return;
    }

    const err = new RuntimeError(
        syncCall === undefined
            ? 'wasm trap: deadlock detected: event loop cannot make further progress'
            : 'cannot block a synchronous task before returning',
    );
    attachDeadlockDetail(err, storeAsyncState.pendingHostOperations, suspendedTasks, exitedTasks, unresolvedRoots);
    storeTrap.error = err;
    for (const root of unresolvedRoots) {
        root.setErrored(err);
        root.reject(err);
    }
    // Exited tasks are rejected too: a synchronous caller waits on the
    // callee task itself, not on its own root.
    for (const task of [...suspendedTasks, ...exitedTasks]) {
        if (!task.isResolvedState() && unresolvedRoots.has(task.getRootTask())) {
            task.setErrored(err);
            task.reject(err);
        }
    }
    // A deadlock is a trap of the whole store: no instance may be entered again.
    for (const state of asyncState.values()) {
        state.markTrapped(err);
    }
    for (const state of asyncState.values()) {
        state.abandonLockWaiters();
        state.abandonEntrySlotWaiters();
    }
    for (const state of asyncState.values()) {
        state.runTickLoop();
    }
}

/**
 * Whether a task runs on behalf of a sync call: it belongs to the call's
 * instance, or the call waits on it through synchronous lowerings (its stack
 * is part of the call's stack).
 *
 * @param task - the task
 * @param call - the sync call
 * @returns whether the task is within the call
 */
function isWithinSyncCall(task: ComponentTask, call: ComponentSyncCall): boolean {
    let current = task;
    for (;;) {
        if (current === call.task || current.componentIdx() === call.componentIdx) {
            return true;
        }
        const subtask = current.getParentSubtask() as { isAsync?: boolean; getParentTask(): ComponentTask } | null;
        if (!subtask || subtask.isAsync) {
            return false;
        }
        current = subtask.getParentTask();
    }
}

/**
 * Count a host operation as pending until it settles.
 *
 * @param context - the host operation context of the store
 * @param operation - starts the operation
 * @param componentIdx - the instance the operation is for, if known: the one
 *   whose threads its completion may make ready
 * @returns the result of the operation
 */
export function trackHostOperation<T>(
    context: ComponentHostOperationContext,
    operation: () => T,
    componentIdx?: number | null,
): T | Promise<Awaited<T>> {
    const { storeAsyncState, asyncState, symbolDispose, storeTrap } = context;
    if (storeTrap.stopped) {
        throw storeTrap.error;
    }
    const result = operation();
    if (!isPromiseLike(result)) {
        if (storeTrap.stopped) {
            throw storeTrap.error;
        }
        return result;
    }

    storeAsyncState.pendingHostOperations++;
    const owner = componentIdx ?? -1;
    // (allocated on first use, so a store without host work pays nothing for it)
    const byComponent = (storeAsyncState.hostOperationsByComponent ??= new Map());
    byComponent.set(owner, (byComponent.get(owner) ?? 0) + 1);
    let rejectStopped!: (error: unknown) => void;
    const stopped = new Promise<never>((_, reject) => {
        rejectStopped = reject;
    });
    storeTrap.stopWaiters.add(rejectStopped);
    if (storeTrap.stopped) {
        rejectStopped(storeTrap.error);
    }
    const tracked = Promise.race([result, stopped]).finally(() => {
        storeTrap.stopWaiters.delete(rejectStopped);
        storeAsyncState.pendingHostOperations--;
        const remaining = (byComponent.get(owner) ?? 0) - 1;
        if (remaining > 0) {
            byComponent.set(owner, remaining);
        } else {
            byComponent.delete(owner);
        }
        if (storeAsyncState.pendingHostOperations < 0) {
            throw new Error('negative pending host operation count');
        }
        if (!storeAsyncState.hostWakeupScheduled) {
            storeAsyncState.hostWakeupScheduled = true;
            queueMicrotask(() => {
                storeAsyncState.hostWakeupScheduled = false;
                if (storeTrap.stopped) {
                    return;
                }
                for (const state of asyncState.values()) {
                    state.runTickLoop();
                }
                checkForDeadlock(context);
            });
        }
    });

    // Forward disposal to the host's value, so it is notified if a guest
    // discards the value (e.g. a future) produced from this operation
    for (const sym of [Symbol.asyncDispose, symbolDispose]) {
        if (typeof sym === 'symbol' && typeof (result as Record<symbol, unknown>)[sym] === 'function') {
            (tracked as unknown as Record<symbol, unknown>)[sym] = () =>
                (result as Record<symbol, () => unknown>)[sym]();
        }
    }

    return tracked;
}

export function checkMayLeave(context: ComponentMayLeaveContext, componentIdx: number) {
    const { RuntimeError, instanceFlags } = context;
    if (instanceFlags.get(componentIdx)?.value !== 1) {
        throw new RuntimeError('cannot leave component instance');
    }
}

export function guardMayLeave<A extends unknown[], T, R>(
    context: ComponentMayLeaveContext,
    componentIdx: number,
    fn: (this: R, ...args: A) => T,
) {
    return function (this: R, ...args: A) {
        checkMayLeave(context, componentIdx);
        return fn.apply(this, args);
    };
}

export function recordTrap(
    context: ComponentRecordTrapContext,
    componentIdx: number | null | undefined,
    err: unknown,
    convertsRangeErrors = false,
) {
    const { RuntimeError, registers: currentTaskMeta } = context;
    // A built-in reading or writing guest memory past its end fails with a
    // DataView RangeError: that is the Canonical ABI's out-of-bounds trap.
    if (convertsRangeErrors && err instanceof RangeError) {
        err = new RuntimeError('out of bounds memory access');
    }
    if (err instanceof RuntimeError) {
        // (a trampoline without a static instance records against the
        // component whose guest code is running)
        const idx = componentIdx ?? currentTaskMeta.current?.componentIdx;
        if (idx !== undefined && idx !== null) {
            getOrCreateAsyncState(context.lookup, idx).markTrapped(err);
        }
    }
    return err;
}

export function guardTrap<A extends unknown[], T, R>(
    context: ComponentRecordTrapContext,
    componentIdx: number | null | undefined,
    fn: (this: R, ...args: A) => T,
    convertsRangeErrors = false,
) {
    return function (this: R, ...args: A) {
        try {
            return fn.apply(this, args);
        } catch (err) {
            throw recordTrap(context, componentIdx, err, convertsRangeErrors);
        }
    };
}

/** Implements `canon backpressure.inc`. */
export function backpressureInc(context: ComponentStateLookupContext, componentIdx: number) {
    DEBUG: debugLog('[backpressureInc()] args', { componentIdx });
    const state = getOrCreateAsyncState(context, componentIdx);
    if (!state) {
        throw new Error(`missing component state for component [${componentIdx}]`);
    }
    const newValue = state.incrementBackpressure();
    DEBUG: debugLog('[backpressureInc()] incremented', { componentIdx, newValue });
}

/** Implements `canon backpressure.dec`. */
export function backpressureDec(context: ComponentStateLookupContext, componentIdx: number) {
    DEBUG: debugLog('[backpressureDec()] args', { componentIdx });
    const state = getOrCreateAsyncState(context, componentIdx);
    const newValue = state.decrementBackpressure();
    DEBUG: debugLog('[backpressureDec()] decremented', { componentIdx, newValue });
}

export function getOrCreateAsyncState(context: ComponentStateLookupContext, componentIdx: number) {
    const { asyncState, ComponentAsyncState } = context;
    let state = asyncState.get(componentIdx);

    // An entry that is present but invalid is returned as it is, for the caller to report.
    if (state === undefined && !asyncState.has(componentIdx)) {
        state = new ComponentAsyncState({ componentIdx });
        asyncState.set(componentIdx, state);
    }
    return state!;
}

export function setAllError(states: Pick<ComponentAsyncStates, 'values'>) {
    DEBUG: debugLog('[_ComponentStateSetAllError()]');
    for (const state of states.values()) {
        state.setErrored();
    }
}

const TICK_DONE = 'done';
const TICK_RESUMED = 'resumed';
const TICK_IDLE = 'idle';

const IDLE_POLL_MS = 10;

function afterDelay(callback: () => void, ms: number): () => void {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
}

function defineComponentAsyncState() {
    return class ComponentAsyncState {
        #context: ComponentAsyncStateContext;

        static EVENT_HANDLER_EVENTS = ['backpressure-change'];

        static TickResult = {
            // no suspended tasks remain
            DONE: TICK_DONE,
            // a suspended task was resumed (more may be ready)
            RESUMED: TICK_RESUMED,
            // suspended tasks remain but none were ready
            IDLE: TICK_IDLE,
        } as const;

        #componentIdx: number;
        #callingAsyncImport = false;
        #syncImportWait = promiseWithResolvers<void>();
        #lockHolderTaskID: bigint | null = null;
        #lockWaiters: { taskID: bigint; resolve(): void }[] = [];
        #numWaitingToEnter = 0;
        #enteringTaskID: bigint | null = null;
        #entrySlotWaiters: { taskID: bigint; resolve(): void }[] = [];
        #entrySlotTurnTaskID: bigint | null = null;
        #lockHandoffScheduled = false;
        #pendingTaskStarts = 0;

        #suspendedThreadsByRef = new Map<ComponentThread, SuspendedThread>();
        #unresolvedExits = new Set<ComponentTask>();
        #errored: unknown = null;
        #trapped = false;
        #trapError: unknown = null;
        #backpressure = 0;
        #backpressureWaiters = 0n;

        #handlers: { id: bigint; fn(value: number): void; event: string }[] = [];
        #nextHandlerID = 0n;

        /** Cancels the scheduled tick while the tick loop runs. */
        #tickLoop: (() => void) | null = null;

        #onExclusiveReleaseHandlers: ((() => void) | null)[] = [];

        #mayLeave = true;

        handles: RepTableType;
        subtasks: RepTableType;
        threads: RepTableType<ComponentThread>;

        constructor(context: ComponentAsyncStateContext, args: { componentIdx: number }) {
            this.#context = context;
            this.#componentIdx = args.componentIdx;
            this.handles = new this.#context.RepTable({
                target: `component [${this.#componentIdx}] handles (waitable objects)`,
                space: getHandleIndexSpace(this.#context.indexSpaces, this.#componentIdx),
            });
            this.subtasks = new this.#context.RepTable({ target: `component [${this.#componentIdx}] subtasks` });
            this.threads = new this.#context.RepTable<ComponentThread>({
                target: `component [${this.#componentIdx}] threads`,
            });
        }

        componentIdx() {
            return this.#componentIdx;
        }

        get mayLeave() {
            const flags = this.#context.instanceFlags.get(this.#componentIdx);
            return flags === undefined ? this.#mayLeave : flags.value === 1;
        }
        set mayLeave(value: boolean) {
            if (typeof value !== 'boolean') {
                throw new TypeError('mayLeave must be a boolean');
            }
            this.#mayLeave = value;
            const flags = this.#context.instanceFlags.get(this.#componentIdx);
            if (flags !== undefined) {
                flags.value = value ? 1 : 0;
            }
        }

        errored() {
            return this.#errored !== null;
        }
        setErrored(err?: unknown) {
            DEBUG: debugLog('[ComponentAsyncState#setErrored()] component errored', {
                err,
                componentIdx: this.#componentIdx,
            });
            if (this.#errored) {
                return;
            }
            if (!err) {
                err = Object.assign(new Error('error elswehere (see other component instance error)'), {
                    componentIdx: this.#componentIdx,
                });
            }
            this.#errored = err;
        }

        markTrapped(err: unknown) {
            if (!(err instanceof this.#context.RuntimeError)) {
                return false;
            }
            const trap = normalizeCoreTrap(this.#context.normalization, err);
            this.#trapped = true;
            if (this.#trapError === null) {
                this.#trapError = trap;
            }
            DEBUG: debugLog('[ComponentAsyncState#markTrapped()] component trapped', {
                err,
                componentIdx: this.#componentIdx,
            });
            if (this.#context.storeTrap.error === null) {
                this.#context.storeTrap.error = trap;
            }
            this.#context.reportTrap?.(trap);
            this.#context.checkIdle?.();
            return true;
        }

        isTrapped() {
            return this.#trapped;
        }
        // For work that was already under way or queued when the instance
        // trapped: it fails with that trap (nothing runs after a trap).
        throwIfInterrupted() {
            if (this.#context.storeTrap.stopped) {
                throw this.#context.storeTrap.error;
            }
            if (this.#trapped) {
                throw this.#trapError ?? new this.#context.RuntimeError(this.#context.cannotEnter);
            }
        }
        throwIfTrapped() {
            if (this.#context.storeTrap.stopped) {
                throw this.#context.storeTrap.error;
            }
            if (this.#trapped) {
                throw new this.#context.RuntimeError(this.#context.cannotEnter);
            }
        }

        callingSyncImport(): boolean;
        callingSyncImport(val: boolean): void;
        callingSyncImport(val?: boolean) {
            if (val === undefined) {
                return this.#callingAsyncImport;
            }
            if (typeof val !== 'boolean') {
                throw new TypeError('invalid setting for async import');
            }
            const prev = this.#callingAsyncImport;
            this.#callingAsyncImport = val;
            if (prev === true && this.#callingAsyncImport === false) {
                this.#notifySyncImportEnd();
            }
        }

        #notifySyncImportEnd() {
            const existing = this.#syncImportWait;
            this.#syncImportWait = promiseWithResolvers<void>();
            existing.resolve();
        }

        async waitForSyncImportCallEnd() {
            await this.#syncImportWait.promise;
        }

        setBackpressure(v: number) {
            this.#backpressure = v;
            for (const handler of this.#handlers.filter((handler) => handler.event === 'backpressure-change')) {
                handler.fn(v);
            }
            return this.#backpressure;
        }
        getBackpressure() {
            return this.#backpressure;
        }

        incrementBackpressure() {
            const current = this.#backpressure;
            if (current < 0 || current > 2 ** 16) {
                throw new Error(`invalid current backpressure value [${current}]`);
            }
            const newValue = this.getBackpressure() + 1;
            if (newValue >= 2 ** 16) {
                throw new this.#context.RuntimeError('backpressure counter overflow');
            }
            return this.setBackpressure(newValue);
        }

        decrementBackpressure() {
            const current = this.#backpressure;
            if (current < 0 || current > 2 ** 16) {
                throw new Error(`invalid current backpressure value [${current}]`);
            }
            // Canonical ABI `backpressure.dec`: trap if the counter would go
            // below zero.
            const newValue = current - 1;
            if (newValue < 0) {
                throw new this.#context.RuntimeError('backpressure counter underflow');
            }
            return this.setBackpressure(newValue);
        }
        hasBackpressure() {
            return this.#backpressure > 0;
        }

        waitForBackpressure() {
            if (!this.hasBackpressure()) {
                return Promise.resolve(null);
            }
            this.addBackpressureWaiter();
            return new Promise<null>((resolve) => {
                let pending = true;
                const handlerID = this.registerHandler({
                    event: 'backpressure-change',
                    fn: (bp) => {
                        if (bp !== 0 || !pending) {
                            return;
                        }
                        pending = false;
                        this.removeHandler({ event: 'backpressure-change', handlerID });
                        this.removeBackpressureWaiter();
                        resolve(null);
                    },
                });
            });
        }

        registerHandler(args: { event: string; fn(value: number): void }) {
            const { event, fn } = args;
            if (!event) {
                throw new Error('missing handler event');
            }
            if (!fn) {
                throw new Error('missing handler fn');
            }

            if (!ComponentAsyncState.EVENT_HANDLER_EVENTS.includes(event)) {
                throw new Error(`unrecognized event handler [${event}]`);
            }

            const handlerID = this.#nextHandlerID++;
            this.#handlers.push({ id: handlerID, fn, event });
            return handlerID;
        }

        removeHandler(args: { event: string; handlerID: bigint }) {
            const { event, handlerID } = args;
            this.#handlers = this.#handlers.filter((handler) => handler.event !== event || handler.id !== handlerID);
        }

        getBackpressureWaiters() {
            return this.#backpressureWaiters;
        }
        addBackpressureWaiter() {
            this.#backpressureWaiters++;
        }
        removeBackpressureWaiter() {
            this.#backpressureWaiters--;
            if (this.#backpressureWaiters < 0) {
                throw new Error('unexepctedly negative number of backpressure waiters');
            }
        }

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
        isExclusivelyLocked() {
            return this.#lockHolderTaskID !== null;
        }
        exclusivelyLockedBy(taskID: bigint) {
            return this.#lockHolderTaskID === taskID;
        }

        exclusiveLock(taskID: bigint) {
            DEBUG: debugLog('[ComponentAsyncState#exclusiveLock()]', {
                holder: this.#lockHolderTaskID,
                requester: taskID,
                componentIdx: this.#componentIdx,
            });
            if (taskID === undefined || taskID === null) {
                throw new Error('exclusive lock requires the acquiring task id');
            }
            if (this.#lockHolderTaskID !== null) {
                throw new Error(
                    `component [${this.#componentIdx}] exclusive lock held by task [${this.#lockHolderTaskID}], requested by [${taskID}]`,
                );
            }
            this.#lockHolderTaskID = taskID;
        }

        // Awaitable acquisition: takes the lock immediately when free,
        // otherwise queues FIFO behind the current holder and earlier
        // waiters. The resolved promise implies ownership.
        acquireExclusiveLock(taskID: bigint) {
            if (taskID === undefined || taskID === null) {
                throw new Error('exclusive lock requires the acquiring task id');
            }
            if (this.#lockHolderTaskID === null) {
                this.#lockHolderTaskID = taskID;
                DEBUG: debugLog('[ComponentAsyncState#acquireExclusiveLock()] acquired', {
                    holder: taskID,
                    componentIdx: this.#componentIdx,
                });
                return;
            }
            if (this.#lockHolderTaskID === taskID) {
                throw new Error(`task [${taskID}] already holds the lock for component [${this.#componentIdx}]`);
            }
            DEBUG: debugLog('[ComponentAsyncState#acquireExclusiveLock()] waiting', {
                holder: this.#lockHolderTaskID,
                requester: taskID,
                componentIdx: this.#componentIdx,
                queued: this.#lockWaiters.length,
            });
            return new Promise<void>((resolve) => {
                this.#lockWaiters.push({ taskID, resolve });
            });
        }

        // Canonical ABI `num_waiting_to_enter` (`Task.enter_implicit_thread`):
        // while any task waits to enter this instance, a new entry waits at
        // least once, then only for its own condition. A task that may enter
        // is never held behind one that may not.
        numWaitingToEnter() {
            return this.#numWaitingToEnter;
        }
        addWaitingToEnter() {
            this.#numWaitingToEnter++;
        }
        removeWaitingToEnter() {
            if (this.#numWaitingToEnter === 0) {
                throw new Error('unexpectedly negative number of tasks waiting to enter');
            }
            this.#numWaitingToEnter--;
        }

        // The Canonical ABI runs an entered task until it first returns or
        // blocks before anything else enters. A task entered through `enter()`
        // runs only once that resolves, so it holds this slot until its first
        // turn ends, and later entries observe that turn's effects (e.g.
        // backpressure it set).
        hasEnteringTask() {
            return this.#enteringTaskID !== null;
        }
        // Whether the slot keeps the given task from entering: another task
        // holds it, or other tasks wait for it ahead of this one.
        entrySlotBusy(taskID: bigint) {
            if (this.#enteringTaskID !== null) {
                return true;
            }
            if (this.#entrySlotTurnTaskID !== null) {
                return this.#entrySlotTurnTaskID !== taskID;
            }
            return this.#entrySlotWaiters.length > 0;
        }
        // In the Canonical ABI, a call whose entry finds the slot held would
        // run after that entry's initial invocation, before any other thread of the
        // instance. Tasks waiting only for the slot therefore get it in
        // arrival order as soon as it is free, without going through the
        // scheduler, which could resume other threads of the instance first.
        // The returned promise resolves when it is the task's turn; the task
        // then enters (`beginEntry`) or passes the turn on (`passEntrySlotTurn`).
        waitForEntrySlotTurn(taskID: bigint) {
            return new Promise<void>((resolve) => {
                this.#entrySlotWaiters.push({ taskID, resolve });
            });
        }
        passEntrySlotTurn(taskID: bigint) {
            if (this.#entrySlotTurnTaskID !== taskID) {
                return false;
            }
            this.#entrySlotTurnTaskID = null;
            this.#handOffEntrySlot();
            return true;
        }
        #handOffEntrySlot() {
            if (this.#enteringTaskID !== null || this.#entrySlotTurnTaskID !== null) {
                return;
            }
            const next = this.#entrySlotWaiters.shift();
            if (!next) {
                // Tasks waiting to enter through the scheduler may enter now.
                if (this.#suspendedThreadsByRef.size > 0) {
                    this.runTickLoop();
                }
                return;
            }
            this.#entrySlotTurnTaskID = next.taskID;
            next.resolve();
        }
        abandonEntrySlotWaiters() {
            this.#entrySlotTurnTaskID = null;
            for (const waiter of this.#entrySlotWaiters.splice(0)) {
                waiter.resolve();
            }
        }
        beginEntry(taskID: bigint) {
            if (this.#enteringTaskID !== null) {
                throw new Error(
                    `task [${taskID}] cannot enter component [${this.#componentIdx}] while task [${this.#enteringTaskID}] is entering`,
                );
            }
            if (this.#entrySlotTurnTaskID === taskID) {
                this.#entrySlotTurnTaskID = null;
            }
            this.#enteringTaskID = taskID;
        }
        endEntry(taskID: bigint) {
            if (this.#enteringTaskID !== taskID) {
                return false;
            }
            this.#enteringTaskID = null;
            this.#handOffEntrySlot();
            return true;
        }

        abandonLockWaiters() {
            const waiters = this.#lockWaiters.splice(0);
            for (const waiter of waiters) {
                waiter.resolve();
            }
        }

        cancelExclusiveLockWaiter(taskID: bigint) {
            const idx = this.#lockWaiters.findIndex((waiter) => waiter.taskID === taskID);
            if (idx === -1) {
                return false;
            }
            const [waiter] = this.#lockWaiters.splice(idx, 1);
            // Release the awaiting `enter()` continuation without granting
            // ownership. It observes the task's resolved cancellation state
            // before attempting to execute guest code.
            waiter.resolve();
            return true;
        }

        exclusiveRelease(taskID: bigint) {
            DEBUG: debugLog('[ComponentAsyncState#exclusiveRelease()] args', {
                holder: this.#lockHolderTaskID,
                releaser: taskID,
                componentIdx: this.#componentIdx,
            });
            if (this.#lockHolderTaskID !== taskID) {
                // Ownerless releases were the historical behavior; a foreign
                // release now leaves the hold intact
                DEBUG: debugLog('[ComponentAsyncState#exclusiveRelease()] ignoring foreign release', {
                    holder: this.#lockHolderTaskID,
                    releaser: taskID,
                    componentIdx: this.#componentIdx,
                });
                return false;
            }

            // Make the release observable before handing the lock to the next
            // asynchronous guest turn.
            //
            // Release handlers may expose a lifted value whose consumer immediately
            // performs a synchronous call on the same component; that call must run
            // while the instance is genuinely unlocked, not via enterSync's
            // lock-free fallback code.
            this.#lockHolderTaskID = null;

            this.#onExclusiveReleaseHandlers = this.#onExclusiveReleaseHandlers.filter((v) => !!v);
            for (const [idx, f] of this.#onExclusiveReleaseHandlers.entries()) {
                try {
                    this.#onExclusiveReleaseHandlers[idx] = null;
                    f!();
                } catch (err) {
                    DEBUG: debugLog('error while executing handler for next exclusive release', err);
                    throw err;
                }
            }
            this.#scheduleLockHandoff();
            return true;
        }

        #scheduleLockHandoff() {
            if (this.#lockHandoffScheduled || this.#lockWaiters.length === 0) {
                return;
            }
            this.#lockHandoffScheduled = true;
            queueMicrotask(() => {
                this.#lockHandoffScheduled = false;
                // A synchronous call triggered by a release handler gets the
                // first opportunity to use the unlocked component. Its own
                // release schedules the next handoff; re-queueing one here
                // would spin the microtask queue for as long as the holder
                // stays blocked (e.g. in a synchronous wait), starving every
                // timer, the deadlock detector included.
                if (this.#lockHolderTaskID !== null) {
                    return;
                }
                const next = this.#lockWaiters.shift();
                if (!next) {
                    return;
                }
                this.#lockHolderTaskID = next.taskID;
                next.resolve();
            });
        }

        onNextExclusiveRelease(fn: () => void) {
            DEBUG: debugLog('[ComponentAsyncState#()onNextExclusiveRelease] registering');
            this.#onExclusiveReleaseHandlers.push(fn);
        }

        async waitForExclusiveRelease() {
            while (this.isExclusivelyLocked()) {
                await new Promise<void>((resolve) => this.onNextExclusiveRelease(resolve));
            }
        }

        #getSuspendedTaskMeta(taskID: bigint) {
            const metas = [...this.#suspendedThreadsByRef.values()].filter((meta) => meta.thread.taskID() === taskID);
            return metas.find((meta) => meta.cancellable && this.suspendedThreadReady(meta.thread)) ?? metas[0];
        }

        suspendTask(args: SuspendTaskOptions) {
            const { task, ...opts } = args;
            task.endInitialInvocationOnBlock();
            return this.suspendThread({ thread: task.defaultThread(), ...opts });
        }

        resumeTaskByID(taskID: bigint) {
            const meta = this.#getSuspendedTaskMeta(taskID);
            return meta ? this.resumeThread(meta.thread) : false;
        }

        suspendedTaskReady(taskID: bigint) {
            const meta = this.#getSuspendedTaskMeta(taskID);
            return meta ? this.suspendedThreadReady(meta.thread) : false;
        }

        suspendedTaskCancellable(taskID: bigint) {
            return !!this.#getSuspendedTaskMeta(taskID)?.cancellable;
        }

        isTaskSuspended(taskID: bigint) {
            return !!this.#getSuspendedTaskMeta(taskID);
        }

        *suspendedTaskMetas() {
            for (const meta of this.#suspendedThreadsByRef.values()) {
                yield { ...meta, task: meta.thread.task() };
            }
        }

        /**
         * Record a task whose last thread exited before it resolved. Nothing
         * can resolve it any more, so let the deadlock detector account for
         * whoever waits on it.
         *
         * @param task - the unresolved task
         */
        noteUnresolvedExit(task: ComponentTask) {
            this.#unresolvedExits.add(task);
            checkForDeadlock(this.#context.deadlock);
        }

        /**
         * Tasks whose threads all exited unresolved while their root task is
         * still unresolved. Tasks under a resolved root are forgotten: no
         * caller can be blocked on them any more.
         *
         * @returns the tasks still relevant to deadlock detection
         */
        *unresolvedExitedTasks() {
            for (const task of this.#unresolvedExits) {
                const root = task.getRootTask();
                if (root.isResolvedState() || root.isRejected()) {
                    this.#unresolvedExits.delete(task);
                } else {
                    yield task;
                }
            }
        }

        #removeSuspendedThreadMeta(thread: ComponentThread) {
            const meta = this.#suspendedThreadsByRef.get(thread);
            this.#suspendedThreadsByRef.delete(thread);
            return meta;
        }

        suspendThread(args: SuspendThreadOptions) {
            const { thread, readyFn, cancellable, onResume, suspended = false, switching = false } = args;
            DEBUG: debugLog('[ComponentAsyncState#suspendThread()]', {
                threadID: thread.id(),
                taskID: thread.taskID(),
                componentIdx: this.#componentIdx,
            });

            if (thread.componentIdx() !== this.#componentIdx) {
                throw new Error('assert: thread component idx should match async state');
            }
            if (this.#suspendedThreadsByRef.has(thread)) {
                throw new Error(`thread [${thread.id()}] already suspended`);
            }

            let promise;
            let resume;
            if (onResume) {
                resume = () => onResume(!thread.isCancelled() && !thread.isRejected() && !this.isTrapped());
            } else {
                const resolvers = promiseWithResolvers<boolean>();
                promise = resolvers.promise;
                resume = () => resolvers.resolve(!thread.isCancelled() && !thread.isRejected() && !this.isTrapped());
            }
            if (this.#context.storeTrap.stopped) {
                this.markTrapped(this.#context.storeTrap.error);
                resume();
                return promise;
            }
            this.#suspendedThreadsByRef.set(thread, { thread, cancellable, readyFn, resume, suspended });

            thread.notifyProgress();

            this.runTickLoop();
            checkForDeadlock(this.#context.deadlock);
            // A thread blocking returns control to a sync call in progress,
            // which goes on only if it can (Canonical ABI `canon_lift`). A
            // thread switching straight to another one does not.
            if (!switching) {
                this.checkSyncCallBlocked();
            }

            return promise;
        }

        resumeThread(thread: ComponentThread) {
            const meta = this.#removeSuspendedThreadMeta(thread);
            if (!meta) {
                return false;
            }
            meta.resume();
            return true;
        }

        markThreadReady(thread: ComponentThread) {
            const meta = this.#suspendedThreadsByRef.get(thread);
            if (!meta || !meta.suspended) {
                return false;
            }
            meta.suspended = false;
            meta.readyFn = () => true;
            this.runTickLoop();
            return true;
        }

        isThreadSuspended(thread: ComponentThread) {
            return this.#suspendedThreadsByRef.get(thread)?.suspended ?? false;
        }

        // Readiness as `thread.{suspend,yield}-then-promote` sees it: the same
        // condition the scheduler uses, including the exclusive lock (Canonical
        // ABI `Thread.ready`, whose callback readiness waits for the lock).
        isThreadReady(thread: ComponentThread) {
            const meta = this.#suspendedThreadsByRef.get(thread);
            return !!meta && !meta.suspended && this.suspendedThreadReady(thread);
        }

        suspendedThreadReady(thread: ComponentThread) {
            const meta = this.#suspendedThreadsByRef.get(thread);
            if (!meta) {
                return false;
            }
            if (!meta.readyFn) {
                throw new Error(`suspended thread [${thread.id()}] is missing a readiness function`);
            }
            if (this.isTrapped() || meta.thread.isRejected()) {
                return true;
            }
            if (!meta.readyFn()) {
                return false;
            }
            // Only the implicit thread of a task that takes the exclusive lock
            // waits for it; threads made by `thread.new-indirect` never do.
            if (!meta.thread.isImplicit()) {
                return true;
            }
            const task = meta.thread.task();
            return !task.needsExclusiveLock() || !this.isExclusivelyLocked() || this.exclusivelyLockedBy(task.id());
        }

        addPendingTaskStart() {
            this.#pendingTaskStarts++;
        }
        removePendingTaskStart() {
            this.#pendingTaskStarts--;
        }

        hasPendingSchedulerWork() {
            if (this.#pendingTaskStarts > 0) {
                return true;
            }
            if (this.#lockHandoffScheduled) {
                return true;
            }
            if (this.#heldBySyncCall()) {
                return false;
            }
            for (const meta of this.#suspendedThreadsByRef.values()) {
                if (this.suspendedThreadReady(meta.thread)) {
                    return true;
                }
            }
            return false;
        }

        // A thread of this instance that a sync call into it may resume: a
        // ready thread of an entered task (Canonical ABI `canon_lift` picks
        // among the ready threads of `inst.threads`, which a task joins as it
        // enters). The thread of a task still waiting to enter is no candidate.
        hasSyncCallCandidate() {
            for (const thread of this.#suspendedThreadsByRef.keys()) {
                if (!thread.hasIndex()) {
                    continue;
                }
                if (this.suspendedThreadReady(thread)) {
                    return true;
                }
            }
            return false;
        }

        // Whether a stack of this instance within the sync call has not
        // blocked: it runs, is about to resume, or is in a host call. Such a
        // stack is still running in the Canonical ABI, so the call has not yet
        // reached the point where it decides whether to trap.
        hasRunningStackWithin(call: ComponentSyncCall) {
            // A task start or lock handoff in flight runs guest code next.
            if (this.#pendingTaskStarts > 0 || this.#lockHandoffScheduled) {
                return true;
            }
            const data = this.threads.data();
            for (let i = 2; i < data.length; i += 2) {
                const thread = data[i];
                if (thread === null || typeof thread !== 'object') {
                    continue;
                }
                if (this.#suspendedThreadsByRef.has(thread) || !isWithinSyncCall(thread.task(), call)) {
                    continue;
                }
                const callee = thread.awaitedCallee();
                if (callee !== null && !this.#calleeLetsCallerRun(callee)) {
                    continue;
                }
                return true;
            }
            return false;
        }

        // Whether a thread that waits on a callee through a synchronous
        // lowering is about to resume or runs the callee's code. Once the
        // callee has entered, its own threads tell whether it still runs. A
        // callee that waits to enter through the scheduler is blocked.
        #calleeLetsCallerRun(callee: ComponentTask) {
            if (callee.isResolvedState() || callee.isRejected()) {
                return true;
            }
            if (callee.hasEntered()) {
                return false;
            }
            for (const state of this.#context.deadlock.asyncState.values()) {
                if (state.componentIdx() === callee.componentIdx()) {
                    return !state.isTaskSuspended(callee.id());
                }
            }
            return true;
        }

        checkSyncCallBlocked() {
            return checkSyncCallBlocked(this.#context.deadlock);
        }

        // Calls of non-async-typed functions (Canonical ABI `canon_lift` with
        // `not ft.async_`) are tracked store-wide, innermost last. Until such a
        // call's task resolves, the spec resumes only ready threads of the
        // callee's instance, and traps if there are none; nothing else in the
        // store runs.
        beginSyncCall(task: ComponentTask) {
            this.#context.deadlock.storeAsyncState.syncCalls.push({ componentIdx: this.#componentIdx, task });
        }

        endSyncCall(task: ComponentTask) {
            const storeAsyncState = this.#context.deadlock.storeAsyncState;
            const syncCalls = storeAsyncState.syncCalls;
            const idx = syncCalls.findIndex((call) => call.task === task);
            if (idx === -1) {
                return;
            }
            syncCalls.splice(idx, 1);
            // Stacks held back by the call resume in the order their promises
            // settled, unless another sync call still holds them back.
            const top = syncCalls.at(-1);
            const held = storeAsyncState.heldResumptions;
            for (let i = 0; i < held.length; ) {
                const { task: heldTask, resume } = held[i]!;
                if (top !== undefined && !isWithinSyncCall(heldTask, top)) {
                    i++;
                    continue;
                }
                held.splice(i, 1);
                resume();
            }
            // Instances held back by the call may run again.
            for (const state of this.#context.deadlock.asyncState.values()) {
                if (state.hasPendingSchedulerWork()) {
                    state.runTickLoop();
                }
            }
        }

        // Resume a stack of this instance that waited on a promise of the
        // host. While a sync call into another instance is in progress, only
        // that instance runs (Canonical ABI `canon_lift`, `not ft.async_`):
        // the stack resumes once the call has returned.
        resumeWhenNotHeld(task: ComponentTask | null | undefined, resume: () => void) {
            const storeAsyncState = this.#context.deadlock.storeAsyncState;
            const call = storeAsyncState.syncCalls.at(-1);
            if (call === undefined || task === null || task === undefined || isWithinSyncCall(task, call)) {
                resume();
                return;
            }
            storeAsyncState.heldResumptions.push({ task, resume });
        }

        // Whether a call of a non-async-typed function into another instance
        // is in progress, so that this instance's threads may not be resumed.
        #heldBySyncCall() {
            const top = this.#context.deadlock.storeAsyncState.syncCalls.at(-1);
            return top !== undefined && top.componentIdx !== this.#componentIdx;
        }

        stop() {
            this.#tickLoop?.();
            this.#tickLoop = null;
            this.abandonLockWaiters();
            this.abandonEntrySlotWaiters();
            // Stacks held back by a sync call resume too, to observe the stop.
            const held = this.#context.deadlock.storeAsyncState.heldResumptions;
            for (let i = 0; i < held.length; ) {
                if (held[i]!.task.componentIdx() !== this.#componentIdx) {
                    i++;
                    continue;
                }
                const [{ resume }] = held.splice(i, 1);
                resume();
            }
            for (const thread of [...this.#suspendedThreadsByRef.keys()]) {
                this.resumeThread(thread);
            }
        }

        runTickLoop() {
            if (this.#context.storeTrap.stopped || this.#tickLoop !== null) {
                return;
            }
            const run = () => {
                if (this.#context.storeTrap.stopped) {
                    this.#tickLoop = null;
                    return;
                }
                const result = this.tick();
                if (this.#context.storeTrap.stopped || result === TICK_DONE) {
                    this.#tickLoop = null;
                    return;
                }
                if (result === TICK_IDLE) {
                    // This also runs while a synchronous call into another
                    // instance holds this one back: the loop keeps polling, so
                    // that it notices readiness and takes part in the store-wide
                    // idle check both during the call and after it ends.
                    checkForDeadlock(this.#context.deadlock);
                }
                // Let resumed microtasks drain before the next turn; otherwise poll at the idle cadence.
                this.#tickLoop = result === TICK_RESUMED ? onNextMacrotask(run) : afterDelay(run, IDLE_POLL_MS);
            };
            this.#tickLoop = onNextMacrotask(run);
        }

        tick() {
            // (resuming returns immediately below, so the map is never
            // mutated while this loop is still iterating it)
            const held = this.#heldBySyncCall();
            for (const [thread, meta] of this.#suspendedThreadsByRef) {
                if (!meta || !meta.readyFn) {
                    throw new Error(`missing/invalid thread meta despite thread [${thread.id()}] being present`);
                }

                if (this.isTrapped() || meta.thread.isRejected()) {
                    DEBUG: debugLog('[ComponentAsyncState#tick()] detected thread rejection, leaving early', { meta });
                    this.resumeThread(thread);
                    return TICK_RESUMED;
                }

                if (held || !this.suspendedThreadReady(thread)) {
                    continue;
                }

                DEBUG: debugLog('[ComponentAsyncState#tick()] resuming thread via tick', {
                    threadID: thread.id(),
                    componentIdx: this.#componentIdx,
                });
                this.resumeThread(thread);

                // Resume only one thread per tick so its current-thread
                // register window closes before another continuation runs.
                return TICK_RESUMED;
            }

            const idle = this.#suspendedThreadsByRef.size > 0;
            return idle ? TICK_IDLE : TICK_DONE;
        }

        createWaitable(args?: { target?: unknown }) {
            return new this.#context.Waitable({ target: args?.target });
        }
    };
}
let sharedComponentAsyncState: ReturnType<typeof defineComponentAsyncState>;

export function initializeComponentAsyncStateClass(
    context: ComponentAsyncStateContext,
): ComponentAsyncStateConstructor {
    const ComponentAsyncState = (sharedComponentAsyncState ??= defineComponentAsyncState());
    /**
     * Construct a state of a component instance that uses the context.
     *
     * @param options - options of the state of a component instance
     * @returns the state of a component instance
     */
    class ContextComponentAsyncState extends ComponentAsyncState {
        constructor(options: ConstructorParameters<typeof ComponentAsyncState>[1]) {
            super(context, options);
        }
    }
    return withConstructorStatics(ContextComponentAsyncState, {
        EVENT_HANDLER_EVENTS: { value: [...ComponentAsyncState.EVENT_HANDLER_EVENTS], enumerable: true },
        TickResult: { value: { ...ComponentAsyncState.TickResult }, enumerable: true },
    });
}

export const postReturnTrap: ComponentModule['postReturnTrap'] = (context, componentIdx, error) => {
    let trap: Error;
    if (error instanceof context.RuntimeError) {
        trap = error;
    } else {
        const message = /call stack|stack overflow|too much recursion/i.test(
            (error as { message?: string } | null)?.message ?? '',
        )
            ? context.stackOverflow
            : context.uncaughtException;
        trap = new context.RuntimeError(message, { cause: error });
    }
    getOrCreateAsyncState(context.lookup, componentIdx).markTrapped(trap);
    return trap;
};

export const guardPostReturn: ComponentModule['guardPostReturn'] =
    (context, componentIdx, fn) =>
    (...args) => {
        try {
            return fn(...args);
        } catch (error) {
            throw postReturnTrap(context, componentIdx, error);
        }
    };
