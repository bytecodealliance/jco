import { expect, test, vi } from 'vitest';
import { create, clearDeadlockCheck, task } from './component-helpers.js';
import type { ComponentDeadlockDetail } from '../src/index.js';

test.concurrent('exclusive locks hand off FIFO and allow synchronous reentry during release', async () => {
    const state = create().component.getOrCreateAsyncState(0);
    state.exclusiveLock(1n);
    const acquired: bigint[] = [];
    const second = state.acquireExclusiveLock(2n)!.then(() => acquired.push(2n));
    const third = state.acquireExclusiveLock(3n)!.then(() => acquired.push(3n));
    expect(state.exclusiveRelease(99n)).toBe(false);
    state.onNextExclusiveRelease(() => {
        expect(state.isExclusivelyLocked()).toBe(false);
        state.exclusiveLock(4n);
    });
    state.exclusiveRelease(1n);
    await Promise.resolve();
    expect(acquired).toEqual([]);
    expect(state.exclusivelyLockedBy(4n)).toBe(true);
    state.exclusiveRelease(4n);
    await second;
    expect(state.exclusivelyLockedBy(2n)).toBe(true);
    expect(acquired).toEqual([2n]);
    state.exclusiveRelease(2n);
    await third;
    expect(state.exclusivelyLockedBy(3n)).toBe(true);
    expect(acquired).toEqual([2n, 3n]);
    const released = state.waitForExclusiveRelease();
    state.exclusiveRelease(3n);
    await released;
    expect(state.isExclusivelyLocked()).toBe(false);
});

test.concurrent('cancelled and abandoned lock waiters resume without acquiring ownership', async () => {
    const state = create().component.getOrCreateAsyncState(0);
    state.exclusiveLock(1n);
    expect(() => state.acquireExclusiveLock(1n)).toThrow('already holds the lock');
    const cancelled = state.acquireExclusiveLock(2n);
    const abandoned = state.acquireExclusiveLock(3n);
    expect(state.cancelExclusiveLockWaiter(2n)).toBe(true);
    expect(state.cancelExclusiveLockWaiter(2n)).toBe(false);
    await cancelled;
    state.abandonLockWaiters();
    await abandoned;
    expect(state.exclusivelyLockedBy(1n)).toBe(true);
    state.exclusiveRelease(1n);
    await Promise.resolve();
    expect(state.isExclusivelyLocked()).toBe(false);
});

test.concurrent('the entry slot admits one task at a time and waiting entries are counted', () => {
    const state = create().component.getOrCreateAsyncState(0);
    expect(state.numWaitingToEnter()).toBe(0);
    state.addWaitingToEnter();
    state.addWaitingToEnter();
    expect(state.numWaitingToEnter()).toBe(2);
    state.removeWaitingToEnter();
    state.removeWaitingToEnter();
    expect(() => state.removeWaitingToEnter()).toThrow('negative number of tasks waiting to enter');
    state.beginEntry(1n);
    expect(state.hasEnteringTask()).toBe(true);
    expect(() => state.beginEntry(2n)).toThrow('while task [1] is entering');
    // Only the entering task ends its entry.
    expect(state.endEntry(2n)).toBe(false);
    expect(state.hasEnteringTask()).toBe(true);
    expect(state.endEntry(1n)).toBe(true);
    expect(state.hasEnteringTask()).toBe(false);
});

test.concurrent('tasks waiting for the entry slot get it in arrival order, ahead of later entries', async () => {
    const state = create().component.getOrCreateAsyncState(0);
    const turns: bigint[] = [];
    expect(state.entrySlotBusy(1n)).toBe(false);
    state.beginEntry(1n);
    expect(state.entrySlotBusy(2n)).toBe(true);
    const second = state.waitForEntrySlotTurn(2n).then(() => turns.push(2n));
    const third = state.waitForEntrySlotTurn(3n).then(() => turns.push(3n));
    state.endEntry(1n);
    // The slot is handed to the first waiter at once: a new entry and the
    // waiter behind it find it busy, the waiter holding the turn does not.
    expect(state.entrySlotBusy(4n)).toBe(true);
    expect(state.entrySlotBusy(3n)).toBe(true);
    expect(state.entrySlotBusy(2n)).toBe(false);
    await second;
    state.beginEntry(2n);
    state.endEntry(2n);
    await third;
    expect(turns).toEqual([2n, 3n]);
    // A task that does not enter on its turn passes it on.
    expect(state.passEntrySlotTurn(4n)).toBe(false);
    expect(state.passEntrySlotTurn(3n)).toBe(true);
    expect(state.entrySlotBusy(4n)).toBe(false);
});

test.concurrent('abandoned entry slot waiters resume without the slot', async () => {
    const state = create().component.getOrCreateAsyncState(0);
    state.beginEntry(1n);
    const waiter = state.waitForEntrySlotTurn(2n);
    state.abandonEntrySlotWaiters();
    await waiter;
    expect(state.hasEnteringTask()).toBe(true);
    expect(state.entrySlotBusy(2n)).toBe(true);
    state.endEntry(1n);
    expect(state.entrySlotBusy(2n)).toBe(false);
});

test.concurrent('scheduler resumes one ready task per tick and respects lock ownership', async () => {
    const { component } = create();
    const state = component.getOrCreateAsyncState(0);
    Object.defineProperty(state, 'runTickLoop', { value: async () => {} }); // Drive ticks explicitly for deterministic ordering.
    try {
        const a = task(1n);
        const b = task(2n);
        const resumed: bigint[] = [];
        const first = state.suspendTask({ task: a.value, readyFn: () => true, cancellable: false })!;
        state.suspendTask({ task: b.value, readyFn: () => true, cancellable: true, onResume: () => resumed.push(2n) });
        expect(a.slices).toBe(1);
        expect(a.progress).toBe(1);
        expect(state.suspendedTaskCancellable(2n)).toBe(true);
        state.exclusiveLock(1n);
        expect(state.suspendedTaskReady(2n)).toBe(false);
        expect(state.tick()).toBe('resumed');
        expect(await first).toBe(true);
        expect(resumed).toEqual([]);
        expect(state.tick()).toBe('idle');
        state.exclusiveRelease(1n);
        expect(state.tick()).toBe('resumed');
        expect(resumed).toEqual([2n]);
        expect(state.tick()).toBe('done');
        expect([...state.suspendedTaskMetas()]).toEqual([]);
        expect(state.resumeTaskByID(99n)).toBe(false);
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('rejected tasks resume despite readiness and cancellation is delivered to callbacks', () => {
    const { component } = create();
    const state = component.getOrCreateAsyncState(0);
    Object.defineProperty(state, 'runTickLoop', { value: async () => {} });
    try {
        const a = task(1n);
        let keepGoing: boolean | undefined;
        state.suspendTask({
            task: a.value,
            readyFn: () => false,
            cancellable: true,
            onResume: (value) => {
                keepGoing = value;
            },
        });
        expect(() => state.suspendTask({ task: a.value, readyFn: () => true, cancellable: false })).toThrow(
            'already suspended',
        );
        expect(state.tick()).toBe('idle');
        a.cancel();
        a.value.reject(new Error('cancelled'));
        expect(state.hasPendingSchedulerWork()).toBe(true);
        expect(state.tick()).toBe('resumed');
        expect(keepGoing).toBe(false);
        expect(state.isTaskSuspended(1n)).toBe(false);
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('deadlock traps the whole store and releases lock waiters', async () => {
    const { component } = create();
    const a = component.getOrCreateAsyncState(0);
    const b = component.getOrCreateAsyncState(1);
    Object.defineProperty(a, 'runTickLoop', { value: async () => {} });
    Object.defineProperty(b, 'runTickLoop', { value: async () => {} });
    try {
        const root = task(1n);
        const child = task(2n, 1, root.value);
        a.suspendTask({ task: root.value, readyFn: () => false, cancellable: false, onResume() {} });
        b.suspendTask({ task: child.value, readyFn: () => false, cancellable: false, onResume() {} });
        a.exclusiveLock(1n);
        const lock = a.acquireExclusiveLock(3n);
        await new Promise((resolve) => setTimeout(resolve, 5));
        const error = component.storeTrap.error as Error & { deadlockDetail: ComponentDeadlockDetail };
        expect(error).toBeInstanceOf(WebAssembly.RuntimeError);
        expect(error.message).toContain('deadlock detected');
        expect(error.deadlockDetail.unresolvedRootTaskIDs).toEqual([1n]);
        expect(error.deadlockDetail.suspendedTasks.map((t) => t.taskID)).toEqual([1n, 2n]);
        expect(root.errors).toEqual([error]);
        expect(child.errors).toEqual([error]);
        expect(a.isTrapped()).toBe(true);
        expect(b.isTrapped()).toBe(true);
        await lock;
        expect(a.exclusivelyLockedBy(1n)).toBe(true);
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('a task whose threads all exited unresolved deadlocks its unresolved root', async () => {
    const { component } = create();
    const state = component.getOrCreateAsyncState(0);
    Object.defineProperty(state, 'runTickLoop', { value: async () => {} });
    try {
        const root = task(1n);
        const child = task(2n, 0, root.value);
        state.noteUnresolvedExit(child.value);
        await vi.waitFor(() => expect(component.storeTrap.error).not.toBeNull(), { timeout: 2000, interval: 5 });
        const error = component.storeTrap.error as Error & { deadlockDetail: ComponentDeadlockDetail };
        expect(error.message).toContain('deadlock detected');
        expect(error.deadlockDetail.unresolvedRootTaskIDs).toEqual([1n]);
        expect(root.errors).toEqual([error]);
        // A synchronous caller waits on the exited task itself, so it is rejected too.
        expect(child.errors).toEqual([error]);
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('a synchronous call holds back threads of other instances until it ends', () => {
    const { component } = create();
    const caller = component.getOrCreateAsyncState(0);
    const callee = component.getOrCreateAsyncState(1);
    Object.defineProperty(caller, 'runTickLoop', { value: () => {} });
    Object.defineProperty(callee, 'runTickLoop', { value: () => {} });
    try {
        const sync = task(1n, 1);
        const other = task(2n, 0);
        const local = task(3n, 1);
        other.unlock();
        local.unlock();
        const resumed: bigint[] = [];
        caller.suspendThread({
            thread: other.thread,
            readyFn: () => true,
            cancellable: false,
            onResume: () => resumed.push(2n),
        });
        callee.suspendThread({
            thread: local.thread,
            readyFn: () => true,
            cancellable: false,
            onResume: () => resumed.push(3n),
        });

        callee.beginSyncCall(sync.value);
        expect(caller.hasPendingSchedulerWork()).toBe(false);
        expect(caller.tick()).toBe('idle');
        expect(callee.tick()).toBe('resumed');
        expect(resumed).toEqual([3n]);

        callee.endSyncCall(sync.value);
        expect(caller.hasPendingSchedulerWork()).toBe(true);
        expect(caller.tick()).toBe('resumed');
        expect(resumed).toEqual([3n, 2n]);
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('a task that exited unresolved under a resolved root is not a deadlock', async () => {
    const { component } = create();
    const state = component.getOrCreateAsyncState(0);
    Object.defineProperty(state, 'runTickLoop', { value: async () => {} });
    try {
        const root = task(1n);
        const child = task(2n, 0, root.value);
        root.value.reject(null);
        state.noteUnresolvedExit(child.value);
        // Wait for the scheduled check to run rather than for a trap that must not come.
        expect(component.storeAsyncState.deadlockCheck).not.toBeNull();
        await vi.waitFor(() => expect(component.storeAsyncState.deadlockCheck).toBeNull(), {
            timeout: 2000,
            interval: 5,
        });
        expect(component.storeTrap.error).toBeNull();
        expect([...state.unresolvedExitedTasks()]).toEqual([]);
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('an instance held back by a synchronous call keeps polling after the call ends', async () => {
    const { component } = create();
    const held = component.getOrCreateAsyncState(0);
    const callee = component.getOrCreateAsyncState(1);
    Object.defineProperty(callee, 'runTickLoop', { value: () => {} });
    try {
        const sync = task(1n, 1);
        const local = task(2n, 1);
        const waiting = task(3n, 0);
        local.unlock();
        waiting.unlock();
        // The callee has work of its own, so the store is not idle during the call.
        callee.suspendThread({ thread: local.thread, readyFn: () => true, cancellable: false, onResume() {} });
        let ready = false;
        let resumed = false;
        held.suspendThread({
            thread: waiting.thread,
            readyFn: () => ready,
            cancellable: false,
            onResume: () => {
                resumed = true;
            },
        });

        callee.beginSyncCall(sync.value);
        held.runTickLoop();
        // Let the held instance's loop go idle while the call is in progress.
        await new Promise((resolve) => setTimeout(resolve, 40));
        callee.resumeThread(local.thread);
        callee.endSyncCall(sync.value);

        // Readiness that nothing announces is still seen by polling.
        ready = true;
        await vi.waitFor(() => expect(resumed).toBe(true), { timeout: 1000, interval: 10 });
        expect(component.storeTrap.error).toBeNull();
    } finally {
        held.stop();
        clearDeadlockCheck(component);
    }
});

test.concurrent('a blocked synchronous call with no ready thread traps instead of deadlocking', async () => {
    const { component } = create();
    const state = component.getOrCreateAsyncState(0);
    Object.defineProperty(state, 'runTickLoop', { value: () => {} });
    try {
        const sync = task(1n);
        state.beginSyncCall(sync.value);
        state.suspendThread({
            thread: sync.thread,
            suspended: true,
            readyFn: () => false,
            cancellable: false,
            onResume() {},
        });
        await vi.waitFor(() => expect(component.storeTrap.error).not.toBeNull(), { timeout: 2000, interval: 5 });
        expect(component.storeTrap.error).toBeInstanceOf(WebAssembly.RuntimeError);
        expect(component.storeTrap.error?.message).toBe('cannot block a synchronous task before returning');
        expect(sync.errors).toEqual([component.storeTrap.error]);
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('pending host operations defer deadlock detection until settlement', async () => {
    const { component, core } = create();
    const state = component.getOrCreateAsyncState(0);
    Object.defineProperty(state, 'runTickLoop', { value: async () => {} });
    try {
        const deferred = core.promiseWithResolvers<void>();
        const operation = component.trackHostOperation(() => deferred.promise);
        state.suspendTask({ task: task(1n).value, readyFn: () => false, cancellable: false, onResume() {} });
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(component.storeTrap.error).toBeNull();
        deferred.resolve();
        await operation;
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(component.storeTrap.error?.message).toContain('deadlock detected');
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('the timer loop resumes ready work and terminates when no tasks remain', async () => {
    const { component } = create();
    try {
        const state = component.getOrCreateAsyncState(0);
        const a = task(1n);
        a.unlock();
        const waiting = state.suspendTask({ task: a.value, readyFn: () => true, cancellable: false });
        expect(await waiting).toBe(true);
        expect(state.tick()).toBe('done');
        expect(component.storeTrap.error).toBeNull();
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('two threads of one task retain separate suspension records and resume one per tick', () => {
    const { component } = create();
    try {
        const state = component.getOrCreateAsyncState(0);
        const a = task(1n);
        a.unlock();
        const second = { ...a.thread, id: () => 2 };
        const resumed: number[] = [];
        state.suspendThread({
            thread: a.thread,
            readyFn: () => true,
            cancellable: false,
            onResume: () => resumed.push(1),
        });
        state.suspendThread({
            thread: second,
            readyFn: () => true,
            cancellable: true,
            onResume: () => resumed.push(2),
        });
        expect([...state.suspendedTaskMetas()].map((meta) => meta.thread.id())).toEqual([1, 2]);
        expect(state.tick()).toBe('resumed');
        expect(resumed).toEqual([1]);
        expect(state.isTaskSuspended(1n)).toBe(true);
        expect(state.tick()).toBe('resumed');
        expect(resumed).toEqual([1, 2]);
        expect(state.tick()).toBe('done');
        expect(state.threads).not.toBe(state.subtasks);
        expect(state.threads).not.toBe(state.handles);
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('a suspended thread becomes runnable only when explicitly made ready', () => {
    const { component } = create();
    try {
        const state = component.getOrCreateAsyncState(0);
        const a = task(1n);
        a.unlock();
        let resumed = false;
        state.suspendThread({
            thread: a.thread,
            suspended: true,
            readyFn: () => false,
            cancellable: false,
            onResume: () => {
                resumed = true;
            },
        });
        expect(state.isThreadSuspended(a.thread)).toBe(true);
        expect(state.isThreadReady(a.thread)).toBe(false);
        expect(state.tick()).toBe('idle');
        expect(state.markThreadReady(a.thread)).toBe(true);
        expect(state.markThreadReady(a.thread)).toBe(false);
        expect(state.isThreadSuspended(a.thread)).toBe(false);
        expect(state.isThreadReady(a.thread)).toBe(true);
        expect(state.tick()).toBe('resumed');
        expect(resumed).toBe(true);
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('a component trap wakes suspended threads with a failed resume result', () => {
    const { component } = create();
    try {
        const state = component.getOrCreateAsyncState(0);
        const a = task(1n);
        let keepGoing: boolean | undefined;
        state.suspendThread({
            thread: a.thread,
            suspended: true,
            readyFn: () => false,
            cancellable: false,
            onResume: (value) => {
                keepGoing = value;
            },
        });
        state.markTrapped(new WebAssembly.RuntimeError('trapped'));
        expect(state.tick()).toBe('resumed');
        expect(keepGoing).toBe(false);
        expect(state.tick()).toBe('done');
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('promotion does not treat a parked thread as ready while another task holds the lock', () => {
    const { component } = create();
    try {
        const state = component.getOrCreateAsyncState(0);
        const parked = task(1n);
        state.suspendThread({ thread: parked.thread, readyFn: () => true, cancellable: true });
        expect(state.isThreadReady(parked.thread)).toBe(true);
        state.exclusiveLock(2n);
        expect(state.isThreadReady(parked.thread)).toBe(false);
        state.exclusiveRelease(2n);
        expect(state.isThreadReady(parked.thread)).toBe(true);
    } finally {
        clearDeadlockCheck(component);
    }
});

test.concurrent('threads made by thread.new-indirect do not wait for the exclusive lock', () => {
    const { component } = create();
    try {
        const state = component.getOrCreateAsyncState(0);
        const owner = task(1n);
        const explicit = { ...owner.thread, id: () => 2, isImplicit: () => false };
        const resumed: number[] = [];
        state.suspendThread({
            thread: owner.thread,
            readyFn: () => true,
            cancellable: false,
            onResume: () => resumed.push(1),
        });
        state.suspendThread({
            thread: explicit,
            readyFn: () => true,
            cancellable: false,
            onResume: () => resumed.push(2),
        });
        state.exclusiveLock(3n);
        expect(state.suspendedThreadReady(owner.thread)).toBe(false);
        expect(state.suspendedThreadReady(explicit)).toBe(true);
        expect(state.isThreadReady(explicit)).toBe(true);
        expect(state.tick()).toBe('resumed');
        expect(resumed).toEqual([2]);
        expect(state.tick()).toBe('idle');
        state.exclusiveRelease(3n);
        expect(state.tick()).toBe('resumed');
        expect(resumed).toEqual([2, 1]);
    } finally {
        clearDeadlockCheck(component);
    }
});

// The tick loop's own scheduling: only setTimeout is faked, so a slice that runs without
// advancing the clock was scheduled on the next macrotask, not on a timer.
function scriptedTicks(results: string[]) {
    const state = create().component.getOrCreateAsyncState(0);
    const ticks: string[] = [];
    Object.defineProperty(state, 'tick', {
        value: () => {
            const result = results.shift()!;
            ticks.push(result);
            return result;
        },
    });
    return { state, ticks };
}

async function drainMacrotasks(count = 5) {
    for (let i = 0; i < count; i++) {
        await new Promise<void>((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => {
                channel.port1.close();
                resolve();
            };
            channel.port2.postMessage(null);
        });
    }
}

test.sequential('the tick loop starts and resumes on the next macrotask, without a timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
        const { state, ticks } = scriptedTicks(['resumed', 'resumed', 'done']);
        state.runTickLoop();
        await drainMacrotasks();
        expect(ticks).toEqual(['resumed', 'resumed', 'done']);
    } finally {
        vi.useRealTimers();
    }
});

test.sequential('an idle tick loop polls again after the idle interval', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
        const { state, ticks } = scriptedTicks(['idle', 'done']);
        state.runTickLoop();
        await drainMacrotasks();
        expect(ticks).toEqual(['idle']);
        vi.advanceTimersByTime(9);
        expect(ticks).toEqual(['idle']);
        vi.advanceTimersByTime(1);
        expect(ticks).toEqual(['idle', 'done']);
    } finally {
        vi.useRealTimers();
    }
});

test.concurrent('stopping the state cancels the scheduled tick', async () => {
    const { state, ticks } = scriptedTicks(['resumed', 'done']);
    state.runTickLoop();
    state.stop();
    await drainMacrotasks();
    expect(ticks).toEqual([]);
});

test.sequential('the tick loop uses a timer when MessageChannel is unavailable', async () => {
    vi.stubGlobal('MessageChannel', undefined);
    vi.useFakeTimers();
    try {
        const { state, ticks } = scriptedTicks(['resumed', 'done']);
        state.runTickLoop();
        await vi.runAllTimersAsync();
        expect(ticks).toEqual(['resumed', 'done']);
    } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    }
});

test.concurrent('host completions share scheduler wakeups within a checkpoint', async () => {
    const { component } = create();
    const state = component.getOrCreateAsyncState(0);
    const tick = vi.spyOn(state, 'runTickLoop').mockImplementation(() => {});
    try {
        const operations = Array.from({ length: 32 }, (_, index) =>
            component.trackHostOperation(() => Promise.resolve(index)),
        );
        expect(await Promise.all(operations)).toEqual(Array.from({ length: 32 }, (_, index) => index));
        expect(component.storeAsyncState.pendingHostOperations).toBe(0);
        expect(tick).toHaveBeenCalledTimes(1);
    } finally {
        clearDeadlockCheck(component);
    }
});
