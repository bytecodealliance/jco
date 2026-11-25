import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import { create } from './async-task-helpers.js';
import { clearDeadlockCheck } from './component-helpers.js';
import type { AsyncTask, TaskCallback, TaskFutureValue } from '../src/index.js';
import * as named from '../src/intrinsics/async-task.js';

test.concurrent('raw register initializers distinguish absent and incomplete platforms', () => {
    expect(named.initializeCurrentTaskMayBlock(false)).toBe(false);
    const depth = named.initializeAsyncBlockingCallDepth(false);
    expect(depth).toEqual({ value: 0 });
    depth.value++;
    expect(named.initializeAsyncBlockingCallDepth(false).value).toBe(0);
    expect(() => named.initializeCurrentTaskMayBlock({})).toThrow(TypeError);
    expect(() => named.initializeAsyncBlockingCallDepth({})).toThrow(TypeError);
    let reads = 0;
    const platform = {
        get Global() {
            reads++;
            return WebAssembly.Global;
        },
    };
    const mayBlock = named.initializeCurrentTaskMayBlock(platform);
    expect(reads).toBe(1);
    const blocking = named.initializeAsyncBlockingCallDepth(platform);
    expect(reads).toBe(2);
    expect(mayBlock).toBeInstanceOf(WebAssembly.Global);
    expect(blocking).toBeInstanceOf(WebAssembly.Global);
    expect(blocking).not.toBe(mayBlock);
    blocking.value = 3;
    expect((mayBlock as { value: number }).value).toBe(0);
});

test.concurrent('pure task lookup uses only its actual map and register owners', () => {
    const tasks = named.initializeTasksByComponent();
    const registers = {};
    expect(named.getCurrentTask({ tasks, registers }, 0)).toBeUndefined();
    expect(named.getCurrentTask({ tasks, registers }, 0, 1n)).toBeUndefined();
    expect(tasks.size).toBe(0);
    expect(Object.keys(registers)).toEqual([]);
    expect(() => named.getCurrentTask({ tasks, registers }, undefined as never)).toThrow('missing component idx');
    expect(named.initializeCurrentTaskIds()).not.toBe(named.initializeCurrentTaskIds());
    expect(named.initializeCurrentComponentIdxs()).not.toBe(named.initializeCurrentComponentIdxs());
    expect(named.initializeSymmetricSyncGuestCallStack()).not.toBe(named.initializeSymmetricSyncGuestCallStack());
});

function setup(options: Parameters<typeof create>[0] = {}) {
    const store = create(options);
    function state(idx = 0) {
        const value = store.component.getOrCreateAsyncState(idx);
        // These tests drive scheduler ticks explicitly without a host timer loop.
        expect(Reflect.set(value, 'runTickLoop', async () => {})).toBe(true);
        return value;
    }
    return {
        ...store,
        state,
        cleanup() {
            store.component.setAllError();
            clearDeadlockCheck(store.component);
        },
    };
}
function finish(task: AsyncTask) {
    if (!task.isResolvedState()) {
        task.resolve([]);
    }
    if (!task.isExited()) {
        task.exit({ skipExclusiveLockCheck: true });
    }
}

test.concurrent('task constructors retain store-local brands, statics and state', () => {
    const a = setup();
    const b = setup();
    const [first] = a.asyncTask.createNewCurrentTask({ componentIdx: 0 });
    const [second] = b.asyncTask.createNewCurrentTask({ componentIdx: 0 });
    try {
        expect(a.asyncTask.AsyncTask).not.toBe(b.asyncTask.AsyncTask);
        expect(first).toBeInstanceOf(a.asyncTask.AsyncTask);
        expect(first).not.toBeInstanceOf(b.asyncTask.AsyncTask);
        expect(first.id()).toBe(1n);
        expect(second.id()).toBe(1n);
        expect(second).toBeInstanceOf(b.asyncTask.AsyncTask);
        expect(second).not.toBeInstanceOf(a.asyncTask.AsyncTask);
        // Stores share one class body, so that engines can cache its private field
        // accesses however many stores exist. A store owns the brand of its
        // instances and its static state, not copies of the methods.
        expect(first.id).toBe(second.id);
        expect(Object.getPrototypeOf(first)).not.toBe(Object.getPrototypeOf(second));
        expect(a.asyncTask.AsyncTask.State).not.toBe(b.asyncTask.AsyncTask.State);
        expect(a.asyncTask.AsyncTask.BlockResult).not.toBe(b.asyncTask.AsyncTask.BlockResult);
        first.storage[0] = 23;
        expect(second.storage[0]).toBe(0);
        expect(a.resource.state.scopeTasks.get(first.resourceScopeId())).toBe(first);
        expect(b.resource.state.scopeTasks.get(second.resourceScopeId())).toBe(second);
    } finally {
        finish(first);
        finish(second);
        a.cleanup();
        b.cleanup();
    }
});

test.concurrent('task registers use explicit selected-realm globals and per-store state', () => {
    const realm = runInNewContext('WebAssembly') as typeof WebAssembly;
    let lookups = 0;
    const a = create({
        platform: {
            WebAssembly: {
                RuntimeError: realm.RuntimeError,
                get Global() {
                    lookups++;
                    return realm.Global;
                },
            },
        },
    });
    const b = create();
    expect(lookups).toBe(0);
    const register = a.asyncTask.currentTaskMayBlock;
    expect(register).toBeInstanceOf(realm.Global);
    expect(a.asyncTask.currentTaskMayBlock).toBe(register);
    expect(lookups).toBe(1);
    register.value = 1;
    expect(b.asyncTask.currentTaskMayBlock.value).toBe(0);
    expect(a.asyncTask.asyncBlockingCallDepth).not.toBe(register);
    expect(lookups).toBe(2);
    expect(a.asyncTask.asyncBlockedCode).toBe(0xffff_ffff);
    expect(a.asyncTask.AsyncTask).not.toBe(b.asyncTask.AsyncTask);
    expect(a.asyncTask.AsyncSubtask).not.toBe(b.asyncTask.AsyncSubtask);
    expect(a.asyncTask.tasksByComponent).not.toBe(b.asyncTask.tasksByComponent);
    expect(() => a.asyncTask.unpackCallbackResult(4)).toThrow(realm.RuntimeError);
    // Canonical ABI `unpack_callback_result`: only EXIT, YIELD and WAIT exist.
    expect(() => a.asyncTask.unpackCallbackResult((17 << 4) | 3)).toThrow(realm.RuntimeError);
    expect(() => a.asyncTask.unpackCallbackResult(3)).toThrow('unsupported callback code');
    expect(a.asyncTask.unpackCallbackResult((17 << 4) | 2)).toEqual([2, 17]);
    const minimal = create({ platform: { WebAssembly: { RuntimeError: realm.RuntimeError } } });
    expect(minimal.asyncTask.tasksByComponent.size).toBe(0);
    expect(() => minimal.asyncTask.currentTaskMayBlock).toThrow('require WebAssembly.Global');
});

test.concurrent('task lookup follows the executing register and context slots restore across reentry', () => {
    const s = setup();
    try {
        const [a, aid] = s.asyncTask.createNewCurrentTask({ componentIdx: 0 });
        const [b, bid] = s.asyncTask.createNewCurrentTask({ componentIdx: 0 });
        expect([aid, bid]).toEqual([1n, 2n]);
        expect(s.resource.state.scopeTasks.get(a.resourceScopeId())).toBe(a);
        expect(s.asyncTask.getCurrentTask(0)?.task).toBe(b);
        s.core.withCurrentTaskMeta({
            taskID: aid,
            threadID: a.defaultThread().id(),
            componentIdx: 0,
            fn() {
                expect(s.asyncTask.getCurrentTask(0)?.task).toBe(a);
                s.asyncTask.contextSet({ slot: 0, componentIdx: 0 }, 42);
                s.core.withCurrentTaskMeta({
                    taskID: bid,
                    threadID: b.defaultThread().id(),
                    componentIdx: 0,
                    fn() {
                        s.asyncTask.contextSet({ slot: 0 }, 99);
                        expect(s.asyncTask.contextGet({ slot: 0 })).toBe(99);
                    },
                });
                expect(s.asyncTask.contextGet({ slot: 0, componentIdx: 0 })).toBe(42);
                expect(() => s.asyncTask.contextSet({ slot: 2 }, 0)).toThrow('invalid slot');
            },
        });
        expect(s.core.currentTaskMeta.current).toBeNull();
        finish(a);
        expect(s.asyncTask.currentTaskIds).toEqual([bid]);
        expect(s.resource.state.scopeTasks.get(a.resourceScopeId())).toBeUndefined();
        finish(b);
        expect(s.asyncTask.currentTaskIds).toEqual([]);
        expect(s.asyncTask.currentComponentIdxs).toEqual([]);
        expect(s.asyncTask.getCurrentTask(0)).toBeUndefined();
    } finally {
        s.cleanup();
    }
});

test.concurrent('task.return checks types and borrows, then publishes before callback exit', async () => {
    const s = setup();
    try {
        const [t, id] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        t.setCalleeIsAsync(true);
        t.setReturnResultTypeIdx(7);
        const ctx = {
            componentIdx: 0,
            getMemoryFn: () => undefined,
            useDirectParams: true,
            resultTypeIdx: 7,
            liftFns: [(ctx: import('../src/index.js').TaskLiftContext): [unknown, typeof ctx] => [ctx.params[0], ctx]],
        };
        s.core.withCurrentTaskMeta({
            taskID: id,
            threadID: t.defaultThread().id(),
            componentIdx: 0,
            fn() {
                t.addBorrowedHandle();
                expect(() => s.asyncTask.taskReturn(ctx, 42)).toThrow('borrow handles still remain');
                t.removeBorrowedHandle();
                expect(() => s.asyncTask.taskReturn({ ...ctx, resultTypeIdx: 8 }, 42)).toThrow(
                    'result type does not match',
                );
                s.asyncTask.taskReturn(ctx, 42);
            },
        });
        expect(t.isExited()).toBe(false);
        t.settleCompletion();
        expect(await t.completionPromise()).toBe(42);
        expect(() => t.addBorrowedHandle()).toThrow('exited resource scope');
        finish(t);
        await t.exitPromise();
    } finally {
        s.cleanup();
    }
});

test.concurrent('task.return traps before delivering results to the caller', () => {
    const s = setup();
    try {
        const [caller, callerID] = s.asyncTask.createNewCurrentTask({ componentIdx: 1, isAsync: true });
        const delivered: unknown[][] = [];
        const subtask = caller.createSubtask({
            componentIdx: 1,
            isAsync: true,
            callMetadata: {
                callerThreadID: caller.defaultThread().id(),
                resultPtr: 8,
                returnFn: (...args: unknown[]) => {
                    delivered.push(args);
                },
            },
        });
        const [t, id] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true, stringEncoding: 'utf16' });
        subtask.onStart();
        t.setParentSubtask(subtask);
        t.setCalleeIsAsync(true);
        const liftMemory = { buffer: new ArrayBuffer(8) };
        t.setLiftMemory(liftMemory);
        const ctx = {
            componentIdx: 0,
            getMemoryFn: () => liftMemory,
            memoryIdx: 0,
            stringEncoding: 'utf16',
            liftFns: [],
        };
        const taskReturn = (overrides: object = {}) =>
            s.core.withCurrentTaskMeta({
                taskID: id,
                threadID: t.defaultThread().id(),
                componentIdx: 0,
                fn: () => s.asyncTask.taskReturn({ ...ctx, ...overrides }, 42),
            });

        // Canonical ABI `canon_task_return`: the options must equal the lift's,
        // with memories compared as instances rather than by index.
        const otherMemory = { buffer: new ArrayBuffer(8) };
        expect(() => taskReturn({ getMemoryFn: () => otherMemory })).toThrow('task.return memory');
        expect(() => taskReturn({ getMemoryFn: () => otherMemory })).toThrow(s.core.RuntimeError);
        expect(() => taskReturn({ stringEncoding: 'utf8' })).toThrow('string encoding');
        expect(() => taskReturn({ stringEncoding: 'utf8' })).toThrow(s.core.RuntimeError);
        const state = s.component.getOrCreateAsyncState(0);
        state.mayLeave = false;
        expect(() => taskReturn()).toThrow(s.core.RuntimeError);
        state.mayLeave = true;
        // `Task.return_`: no borrows may remain.
        t.addBorrowedHandle();
        expect(() => taskReturn()).toThrow('borrow handles still remain');
        t.removeBorrowedHandle();
        expect(delivered).toEqual([]);

        // (the lift memory named through another index)
        taskReturn({ memoryIdx: 7 });
        expect(delivered).toEqual([[42, 8]]);
        // `Task.return_`: a task resolves at most once.
        expect(() => taskReturn()).toThrow(s.core.RuntimeError);
        expect(() => taskReturn()).toThrow('task has already resolved');
        expect(delivered).toHaveLength(1);
        expect(callerID).toBe(caller.id());
    } finally {
        s.cleanup();
    }
});

test.concurrent('task.cancel requires an async lift and a delivered cancellation', () => {
    const s = setup();
    try {
        const [t, id] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        const taskCancel = () =>
            s.core.withCurrentTaskMeta({
                taskID: id,
                threadID: t.defaultThread().id(),
                componentIdx: 0,
                fn: () => s.asyncTask.taskCancel(0),
            });

        // Canonical ABI `canon_task_cancel` checks the lift options.
        t.setCalleeIsAsync(false);
        expect(taskCancel).toThrow(s.core.RuntimeError);
        expect(taskCancel).toThrow('task.cancel requires an async canonical lift');

        // `Task.cancel`: only after the cancellation was delivered.
        t.setCalleeIsAsync(true);
        expect(taskCancel).toThrow(s.core.RuntimeError);
        expect(taskCancel).toThrow('has not been cancelled');
        finish(t);
    } finally {
        s.cleanup();
    }
});

test.concurrent('callback execution uses the task register and preserves the synchronous fast path', () => {
    const s = setup();
    try {
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0 });
        const callback: TaskCallback = Object.assign(
            (code: number, index: number) => {
                expect(s.core.getCurrentTaskMeta(0)?.taskID).toBe(t.id());
                return code + index;
            },
            { _jcoMaySuspend: false },
        );
        t.setCallbackFn(callback, 'callback');
        expect(t.runCallbackFn(2, 3)).toBe(5);
        expect(t.getCallbackFnName()).toBe('callback');
        expect(s.core.currentTaskMeta.current).toBeNull();
        finish(t);
    } finally {
        s.cleanup();
    }
});

test.concurrent('queued async entry waits for backpressure and holds the entry until its initial invocation ends', async () => {
    const s = setup({ asyncDeterminism: 'deterministic' });
    try {
        const state = s.state();
        state.setBackpressure(1);
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        t.setFuncTypeIsAsync(true);
        expect(t.tryEnter()).toBeNull();
        const entered = t.enter();
        await Promise.resolve();
        expect(state.isTaskSuspended(t.id())).toBe(true);
        expect(state.numWaitingToEnter()).toBe(1);
        state.setBackpressure(0);
        state.tick();
        expect(await entered).toBe(true);
        expect(state.numWaitingToEnter()).toBe(0);
        expect(state.hasEnteringTask()).toBe(true);
        t.endInitialInvocation();
        expect(state.hasEnteringTask()).toBe(false);
        finish(t);
    } finally {
        s.cleanup();
    }
});

test.concurrent('a stackful entry is not held behind an entry waiting for the exclusive lock', async () => {
    const s = setup({ asyncDeterminism: 'deterministic' });
    try {
        const state = s.state();
        // Another task's turn holds the lock while it waits.
        state.exclusiveLock(99n);

        const [locking] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        locking.setFuncTypeIsAsync(true);
        locking.setCalleeIsAsync(false);
        expect(locking.needsExclusiveLock()).toBe(true);
        const lockingEntered = locking.enter();
        await Promise.resolve();
        expect(state.numWaitingToEnter()).toBe(1);

        const [stackful] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        stackful.setFuncTypeIsAsync(true);
        stackful.setCalleeIsAsync(true);
        expect(stackful.needsExclusiveLock()).toBe(false);
        // Another task is waiting to enter, so this one waits once too...
        expect(stackful.tryEnter()).toBeNull();
        const stackfulEntered = stackful.enter();
        await Promise.resolve();
        expect(state.numWaitingToEnter()).toBe(2);
        // ...and then only for its own condition, which ignores the lock.
        expect(state.tick()).toBe('resumed');
        expect(await stackfulEntered).toBe(true);
        expect(state.numWaitingToEnter()).toBe(1);
        expect(state.exclusivelyLockedBy(99n)).toBe(true);
        stackful.endInitialInvocation();

        state.exclusiveRelease(99n);
        expect(state.tick()).toBe('resumed');
        expect(await lockingEntered).toBe(true);
        expect(state.numWaitingToEnter()).toBe(0);
        expect(state.exclusivelyLockedBy(locking.id())).toBe(true);
        locking.endInitialInvocation();
        finish(stackful);
        finish(locking);
    } finally {
        s.cleanup();
    }
});

test.concurrent('a sync-lowered call into a stackful export waits for backpressure but not the lock', async () => {
    const s = setup({ asyncDeterminism: 'deterministic' });
    try {
        const state = s.state();
        // The caller lowered the call synchronously; the callee is lifted
        // async without a callback.
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: false });
        t.setFuncTypeIsAsync(true);
        t.setCalleeIsAsync(true);
        expect(t.needsExclusiveLock()).toBe(false);

        state.setBackpressure(1);
        const entered = t.enter();
        await Promise.resolve();
        expect(state.isTaskSuspended(t.id())).toBe(true);
        state.setBackpressure(0);
        state.tick();
        expect(await entered).toBe(true);
        expect(state.isExclusivelyLocked()).toBe(false);
        t.endInitialInvocation();
        finish(t);
    } finally {
        s.cleanup();
    }
});

test.concurrent('an async-lowered call into a sync-typed function ignores backpressure', () => {
    const s = setup({ asyncDeterminism: 'deterministic' });
    try {
        const state = s.state();
        state.setBackpressure(1);
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        t.setFuncTypeIsAsync(false);
        t.setCalleeIsAsync(false);
        expect(t.needsExclusiveLock()).toBe(false);
        expect(t.tryEnter()).toBe(true);
        expect(state.numWaitingToEnter()).toBe(0);
        expect(state.isExclusivelyLocked()).toBe(false);
        finish(t);
    } finally {
        s.cleanup();
    }
});

test.concurrent('an async-lowered call into a sync-lifted, async-typed export needs the lock', () => {
    const s = setup({ asyncDeterminism: 'deterministic' });
    try {
        const state = s.state();
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        t.setFuncTypeIsAsync(true);
        t.setCalleeIsAsync(false);
        expect(t.needsExclusiveLock()).toBe(true);
        expect(t.tryEnter()).toBe(true);
        expect(state.exclusivelyLockedBy(t.id())).toBe(true);
        finish(t);
    } finally {
        s.cleanup();
    }
});

test.concurrent('an entry cancelled while waiting for the entry slot never enters', async () => {
    const s = setup({ asyncDeterminism: 'deterministic' });
    try {
        const state = s.state();
        const asyncTask = (calleeIsAsync: boolean) => {
            const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
            t.setFuncTypeIsAsync(true);
            t.setCalleeIsAsync(calleeIsAsync);
            return t;
        };

        // The holder's initial invocation has not ended yet.
        const holder = asyncTask(false);
        expect(await holder.enter()).toBe(true);
        expect(state.hasEnteringTask()).toBe(true);

        // Both wait for their turn at the slot, not through the scheduler.
        const cancelled = asyncTask(true);
        const cancelledEntered = cancelled.enter();
        const next = asyncTask(true);
        const nextEntered = next.enter();
        await Promise.resolve();
        expect(state.numWaitingToEnter()).toBe(0);

        cancelled.requestCancellation();
        expect(cancelled.isCancelled()).toBe(true);

        // The cancelled entry passes its turn on without entering.
        holder.endInitialInvocation();
        expect(await cancelledEntered).toBe(false);
        expect(await nextEntered).toBe(true);
        expect(state.hasEnteringTask()).toBe(true);
        next.endInitialInvocation();
        expect(state.hasEnteringTask()).toBe(false);
        finish(next);
        finish(holder);
    } finally {
        s.cleanup();
    }
});

test.concurrent('cancellation before entry retires the task without executing guest code', async () => {
    const s = setup();
    try {
        s.state();
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        t.requestCancellation();
        expect(t.isCancelled()).toBe(true);
        expect(t.isExited()).toBe(true);
        expect(s.asyncTask.getCurrentTask(0)).toBeUndefined();
        expect(await t.completionPromise()).toBeNull();
    } finally {
        s.cleanup();
    }
});

test.concurrent('entered tasks deliver cancellation only at cancellable suspension points', async () => {
    const s = setup({ asyncDeterminism: 'deterministic' });
    try {
        const state = s.state();
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        expect(t.tryEnter()).toBe(true);
        t.requestCancellation();
        expect(t.deliverPendingCancel({ cancellable: false })).toBe(false);
        expect(await t.suspendUntil({ readyFn: () => false, cancellable: true })).toBe(false);
        t.cancel();
        expect(t.isCancelled()).toBe(true);
        finish(t);
        expect(state.isTaskSuspended(t.id())).toBe(false);
    } finally {
        s.cleanup();
    }
});

test.concurrent('driver callbacks wait on the shared waitable set and exit the task', async () => {
    const s = setup();
    try {
        const state = s.state();
        const setRep = s.waitable.waitableSetNew(0);
        const w = new s.waitable.Waitable({ componentIdx: 0 });
        const wRep = state.handles.insert(w);
        s.waitable.waitableJoin(0, wRep, setRep);
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        const callback: TaskCallback = Object.assign(
            (code: number, index: number, result: number) => {
                expect([code, index, result]).toEqual([1, wRep, 2]);
                t.resolve(['done']);
                return 0;
            },
            { _jcoMaySuspend: false },
        );
        t.setCallbackFn(callback, 'done');
        expect(t.tryEnter()).toBe(true);
        s.asyncTask.driverLoop({ componentState: state, task: t, callbackResult: (setRep << 4) | 2 });
        expect(state.isTaskSuspended(t.id())).toBe(true);
        w.setPendingEvent(() => ({ code: 1, payload0: wRep, payload1: 2 }));
        expect(state.tick()).toBe('resumed');
        expect(await t.completionPromise()).toBe('done');
        expect(t.isExited()).toBe(true);
        expect(s.asyncTask.getCurrentTask(0)).toBeUndefined();
    } finally {
        s.cleanup();
    }
});

test.concurrent('subtask resolution accounts for lenders exactly once and uses the shared handle table', () => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0 });
        const sub = parent.createSubtask({ componentIdx: 0, isAsync: true });
        expect(sub).toBeInstanceOf(s.asyncTask.AsyncSubtask);
        expect(sub.waitable()).toBeInstanceOf(s.waitable.Waitable);
        const rep = sub.ensureHandle();
        expect(sub.ensureHandle()).toBe(rep);
        expect(s.component.getOrCreateAsyncState(0).handles.get(rep)).toBe(sub);
        const lender = { lends: 0 };
        sub.addLender(lender);
        expect(lender.lends).toBe(1);
        sub.onStart();
        sub.onResolve(42);
        expect(sub.getResult()).toBe(42);
        expect(() => sub.addLender(lender)).toThrow('already been resolved');
        sub.deliverResolve();
        expect(lender.lends).toBe(0);
        expect(() => sub.deliverResolve()).toThrow('cannot deliver resolution twice');
        s.asyncTask.subtaskDrop(0, rep);
        expect(s.component.getOrCreateAsyncState(0).handles.get(rep)).toBeUndefined();
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent('a stopped store abandons borrows a task still holds', () => {
    const s = setup();
    try {
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0 });
        t.addBorrowedHandle();
        expect(() => t.validateResourceBorrowScope()).toThrow('borrow handles still remain');
        s.component.storeTrap.stopped = true;
        t.validateResourceBorrowScope();
        expect(Array.from(s.resource.state.scopeTasks.keys())).toEqual([]);
    } finally {
        s.component.storeTrap.stopped = false;
        s.cleanup();
    }
});

test.concurrent('cancelling a subtask twice traps', () => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0 });
        const sub = parent.createSubtask({ componentIdx: 0, isAsync: true });
        const rep = sub.ensureHandle();
        sub.requestCancellation();
        expect(() => s.asyncTask.subtaskCancel(0, false, rep)).toThrow(s.core.RuntimeError);
    } finally {
        s.cleanup();
    }
});

test.concurrent('cancelling a host subtask disposes its pending result and consumes terminal status', async () => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0 });
        const sub = parent.createSubtask({ componentIdx: 0, isAsync: true });
        const rep = sub.ensureHandle();
        let disposed = 0;
        sub.setHostPendingResult({
            then() {},
            [s.core.symbolDispose]() {
                disposed++;
            },
        });
        expect(s.asyncTask.subtaskCancel(0, true, rep)).toBe(s.asyncTask.AsyncSubtask.State.CANCELLED_BEFORE_STARTED);
        await Promise.resolve();
        expect(disposed).toBe(1);
        expect(sub.resolveDelivered()).toBe(true);
        expect(() => s.asyncTask.subtaskCancel(0, true, rep)).toThrow('terminal status delivered');
        s.asyncTask.subtaskDrop(0, rep);
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent('future recognition is lazy and preserves one public future layer', async () => {
    let probes = 0;
    class FutureValue implements TaskFutureValue {
        static [Symbol.hasInstance](value: unknown) {
            probes++;
            return Function.prototype[Symbol.hasInstance].call(this, value);
        }
        resolveAsValue(resolve: (value: unknown) => void) {
            resolve({ future: this });
        }
    }
    const s = setup({ FutureValue });
    try {
        expect(probes).toBe(0);
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true, preserveFutureResult: true });
        const future = new FutureValue();
        t.resolve([future]);
        t.settleCompletion();
        expect(await t.completionPromise()).toEqual({ future });
        expect(probes).toBe(1);
        finish(t);
    } finally {
        s.cleanup();
    }
});

test.concurrent('default resource destructors run in a fresh shared task and restore the caller register', () => {
    const s = setup();
    try {
        s.core.withCurrentTaskMeta({
            taskID: 99n,
            threadID: 99,
            componentIdx: 3,
            fn() {
                const result = s.resource.callDestructor({
                    componentIdx: 3,
                    rep: 7,
                    dtor(rep) {
                        const meta = s.core.getCurrentTaskMeta(3)!;
                        expect(meta.taskID).not.toBe(99n);
                        expect(s.asyncTask.getCurrentTask(3, meta.taskID)?.task.entryFnName()).toBe('<resource-drop>');
                        return rep * 2;
                    },
                });
                expect(result).toBe(14);
                expect(s.core.getCurrentTaskMeta(3)?.taskID).toBe(99n);
            },
        });
        expect(s.asyncTask.getCurrentTask(3)).toBeUndefined();
        expect(Array.from(s.resource.state.scopeTasks.keys()).length).toBe(0);
    } finally {
        s.cleanup();
    }
});

test.concurrent('symmetric guest calls preserve synchronous entry and restore the caller and may-block register', () => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0 });
        s.asyncTask.currentTaskMayBlock.value = 1;
        s.core.withCurrentTaskMeta({
            taskID: parent.id(),
            threadID: parent.defaultThread().id(),
            componentIdx: 0,
            fn() {
                expect(s.asyncTask.symmetricSyncGuestCallEnter(0, false, 1, true)).toBe(1);
                const child = s.asyncTask.getCurrentTask(1)!.task;
                expect(child.getParentSubtask()?.getParentTask()).toBe(parent);
                expect(s.core.getCurrentTaskMeta()?.taskID).toBe(child.id());
                s.asyncTask.symmetricSyncGuestCallExit();
                expect(s.asyncTask.getCurrentTask(1)).toBeUndefined();
                expect(s.core.getCurrentTaskMeta()?.taskID).toBe(parent.id());
                expect(s.asyncTask.currentTaskMayBlock.value).toBe(1);
                expect(s.asyncTask.symmetricSyncGuestCallStack).toEqual([]);
            },
        });
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent('a symmetric call into an async-typed function holds the callee instance', () => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0 });
        s.core.withCurrentTaskMeta({
            taskID: parent.id(),
            threadID: parent.defaultThread().id(),
            componentIdx: 0,
            fn() {
                expect(s.asyncTask.symmetricSyncGuestCallEnter(0, true, 1, true)).toBe(1);
                // The adapter lifts synchronously, whatever the function type.
                expect(s.asyncTask.getCurrentTask(1)!.task.needsExclusiveLock()).toBe(true);
                expect(s.component.getOrCreateAsyncState(1).isExclusivelyLocked()).toBe(true);
                s.asyncTask.symmetricSyncGuestCallExit();
                expect(s.component.getOrCreateAsyncState(1).isExclusivelyLocked()).toBe(false);
            },
        });
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent.each([false, true])('initialization import retires its task (manual async=%s)', (isManualAsync) => {
    const s = setup();
    try {
        s.component.instanceFlags.set(0, { value: 1 });
        const result = s.asyncTask.lowerImportBackwardsCompat(
            {
                componentIdx: 0,
                isAsync: false,
                isManualAsync,
                funcTypeIsAsync: false,
                getMemoryFn: () => undefined,
                importFn(value) {
                    const task = s.asyncTask.getCurrentTask(0)!.task;
                    expect(s.core.getCurrentTaskMeta(0)?.taskID).toBe(task.id());
                    task.currentSubtask()!.onResolve(value);
                    return value;
                },
            },
            23,
        );
        expect(result).toBe(23);
        expect(s.asyncTask.getCurrentTask(0)).toBeUndefined();
        expect(s.core.getCurrentTaskMeta(0)).toBeUndefined();
        expect(Array.from(s.resource.state.scopeTasks.keys()).length).toBe(0);
    } finally {
        s.cleanup();
    }
});

test.concurrent('async import lowering resolves through the current task subtask', async () => {
    const s = setup();
    try {
        s.component.instanceFlags.set(0, { value: 1 });
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        const value = await s.core.withCurrentTaskMetaAsync({
            taskID: parent.id(),
            threadID: parent.defaultThread().id(),
            componentIdx: 0,
            fn: () =>
                s.asyncTask.lowerImport(
                    {
                        componentIdx: 0,
                        isAsync: false,
                        funcTypeIsAsync: true,
                        getMemoryFn: () => undefined,
                        importFn(value) {
                            parent.currentSubtask()!.onResolve(value);
                            return Promise.resolve(value);
                        },
                    },
                    42,
                ),
        });
        expect(value).toBe(42);
        expect(parent.currentSubtask()).toBeUndefined();
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent('a child rejection propagates the originating error to the root task', async () => {
    const s = setup();
    try {
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        const [child] = s.asyncTask.createNewCurrentTask({ componentIdx: 1, isAsync: true });
        const sub = parent.createSubtask({ componentIdx: 0, childTask: child, isAsync: true });
        child.setParentSubtask(sub);
        sub.onStart();
        const error = new Error('child trap');
        const rejected = expect(parent.completionPromise()).rejects.toBe(error);
        child.reject(error);
        finish(child);
        finish(parent);
        await rejected;
        expect(parent.isErrored()).toBe(error);
        expect(child.isErrored()).toBe(error);
    } finally {
        s.cleanup();
    }
});

test.concurrent('canonical yield suspends even when its readiness predicate is already true', async () => {
    const s = setup();
    try {
        const state = s.state();
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        const yielded = s.core.withCurrentTaskMetaAsync({
            taskID: t.id(),
            threadID: t.defaultThread().id(),
            componentIdx: 0,
            fn: () => s.asyncTask.asyncYield({ componentIdx: 0 }),
        });
        expect(state.isTaskSuspended(t.id())).toBe(true);
        expect(state.tick()).toBe('resumed');
        expect(await yielded).toBe(0);
        finish(t);
    } finally {
        s.cleanup();
    }
});

test.concurrent('yield returns 0 after its task was cancelled', async () => {
    const s = setup();
    try {
        const state = s.state();
        const [t] = s.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
        expect(t.tryEnter()).toBe(true);
        t.requestCancellation();
        expect(t.deliverPendingCancel({ cancellable: true })).toBe(true);
        t.cancel();
        expect(t.isCancelled()).toBe(true);

        // Canonical ABI `canon_thread_yield` always returns 0.
        const yielded = s.core.withCurrentTaskMetaAsync({
            taskID: t.id(),
            threadID: t.defaultThread().id(),
            componentIdx: 0,
            fn: () => s.asyncTask.asyncYield({ componentIdx: 0, isCancellable: true }),
        });
        expect(state.tick()).toBe('resumed');
        expect(await yielded).toBe(0);
        finish(t);
    } finally {
        s.cleanup();
    }
});

test.concurrent('subtask result lowering falls back to registered component memory', () => {
    const s = setup();
    try {
        const memory = { buffer: new ArrayBuffer(32) };
        s.core.registerMemory({ componentIdx: 0, memoryIdx: 0, memory });
        const [parent] = s.asyncTask.createNewCurrentTask({ componentIdx: 0 });
        const sub = parent.createSubtask({
            componentIdx: 0,
            isAsync: true,
            callMetadata: {
                resultPtr: 8,
                lowers: [
                    (ctx) => {
                        expect(ctx.memory).toBe(memory);
                        new DataView(ctx.memory!.buffer).setUint32(ctx.storagePtr!, ctx.vals[0] as number, true);
                    },
                ],
            },
        });
        sub.onStart();
        sub.onResolve(42);
        expect(new DataView(memory.buffer).getUint32(8, true)).toBe(42);
        sub.deliverResolve();
        sub.drop();
        finish(parent);
    } finally {
        s.cleanup();
    }
});

test.concurrent('stopping a task rejects completion before its host import returns', async () => {
    const store = setup();
    const [task] = store.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
    const error = new Error('instance stopped');
    try {
        const completion = expect(task.completionPromise()).rejects.toBe(error);
        task.stop(error);
        await completion;
        expect(task.isErrored()).toBe(error);
    } finally {
        store.cleanup();
    }
});

test.concurrent.each([-1, -16, 4, NaN, 2 ** 31, 'invalid'])(
    'the async driver reports invalid callback %s after a task has returned and traps the instance',
    (callbackResult) => {
        const reported: unknown[] = [];
        const store = setup({ reportTrap: (error) => reported.push(error) });
        try {
            const state = store.state();
            const [task] = store.asyncTask.createNewCurrentTask({ componentIdx: 0, isAsync: true });
            expect(task.tryEnter()).toBe(true);
            task.resolve([]);
            store.asyncTask.driverLoop({ componentState: state, task, callbackResult });
            expect(reported).toHaveLength(1);
            expect(reported[0]).toBeInstanceOf(WebAssembly.RuntimeError);
            expect(task.isErrored()).toBe(reported[0]);
            expect(task.isExited()).toBe(true);
            // A trap in the callback loop is a trap of the instance.
            expect(state.isTrapped()).toBe(true);
        } finally {
            store.cleanup();
        }
    },
);

test.concurrent('marking completion handled does not read a returned future', async () => {
    let reads = 0;
    class FutureValue implements TaskFutureValue {
        hidden = false;
        get then() {
            if (this.hidden) {
                return undefined;
            }
            return (resolve: (value: number) => void) => {
                reads++;
                resolve(42);
            };
        }
        resolveAsValue(resolve: (value: unknown) => void) {
            this.hidden = true;
            try {
                resolve(this);
            } finally {
                this.hidden = false;
            }
        }
    }
    const store = setup({ FutureValue });
    try {
        const [task] = store.asyncTask.createNewCurrentTask({
            componentIdx: 0,
            isAsync: true,
            preserveFutureResult: true,
        });
        const future = new FutureValue();
        task.resolve([future]);
        task.settleCompletion();
        await task.completionPromise().then((value) => {
            expect(value).toBe(future);
        });
        await Promise.resolve();
        expect(reads).toBe(0);
        finish(task);
    } finally {
        store.cleanup();
    }
});

test.concurrent('retiring an external task notifies the instance idle tracker', () => {
    let idleChecks = 0;
    const store = setup({ checkIdle: () => idleChecks++ });
    try {
        const [task] = store.asyncTask.createNewCurrentTask({ componentIdx: 0 });
        task.enterSync();
        expect(idleChecks).toBe(0);
        finish(task);
        expect(idleChecks).toBe(1);
        expect(store.asyncTask.getCurrentTask(0)).toBeUndefined();
    } finally {
        store.cleanup();
    }
});
