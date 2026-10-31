import { expect, test } from 'vitest';
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

test.concurrent('admission tickets preserve call order and release abandoned entries', async () => {
    const state = create().component.getOrCreateAsyncState(0);
    const a = state.takeAdmissionTicket(1n);
    const b = state.takeAdmissionTicket(2n);
    const c = state.takeAdmissionTicket(3n);
    expect(state.waitForAdmissionTurn(a)).toBeUndefined();
    expect(state.waitForAdmissionTurn(b)).toBe(b.promise);
    state.releaseAdmissionTicket(b); // Giving up out of order must not admit c yet.
    let admitted = false;
    const waiting = state.waitForAdmissionTurn(c)!.then(() => {
        admitted = true;
    });
    await Promise.resolve();
    expect(admitted).toBe(false);
    state.releaseAdmissionTicket(a);
    await waiting;
    expect(state.waitForAdmissionTurn(c)).toBeUndefined();
    const d = state.takeAdmissionTicket(4n);
    state.abandonAdmissionWaiters();
    await d.promise;
    expect(state.hasPendingAdmissions()).toBe(false);
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

test.concurrent('deadlock traps the whole store and releases lock and admission waiters', async () => {
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
        a.takeAdmissionTicket(3n);
        const admission = a.takeAdmissionTicket(4n);
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
        await admission.promise;
        expect(a.exclusivelyLockedBy(1n)).toBe(true);
        expect(a.hasPendingAdmissions()).toBe(false);
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
