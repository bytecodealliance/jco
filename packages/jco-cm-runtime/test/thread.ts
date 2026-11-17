import { expect, test } from 'vitest';
import { create } from './async-task-helpers.js';
import { clearDeadlockCheck } from './component-helpers.js';
import * as operations from '../src/intrinsics/async-task.js';

function store() {
    const selected = create();
    return {
        ...selected,
        cleanup() {
            selected.component.setAllError();
            clearDeadlockCheck(selected.component);
        },
    };
}

test.concurrent('thread indices are instance-scoped and recycled indices cannot revive stale task metadata', () => {
    const s = store();
    try {
        const a = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        const b = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        expect(a.threadID).not.toBe(b.threadID);
        expect(s.asyncTask.getCurrentThread(0, a.threadID, b.taskID)).toBeUndefined();
        a.task.resolve([]);
        a.task.exit({ skipExclusiveLockCheck: true });
        const c = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        expect(c.threadID).toBe(a.threadID);
        expect(s.asyncTask.getCurrentThread(0, a.threadID, a.taskID)).toBeUndefined();
        expect(s.asyncTask.getCurrentThread(0, c.threadID, c.taskID)?.thread).toBe(c.thread);
        for (const value of [b, c]) {
            value.task.resolve([]);
            value.task.exit({ skipExclusiveLockCheck: true });
        }
        expect(s.component.getOrCreateAsyncState(0).threads.size()).toBe(0);
    } finally {
        s.cleanup();
    }
});

test.concurrent('context slots belong to the executing thread and restore across nested thread scopes', () => {
    const s = store();
    try {
        const a = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        const other = a.task.addThread(new s.asyncTask.AsyncThread({ componentIdx: 0, task: a.task }));
        s.core.withCurrentTaskMeta({
            componentIdx: 0,
            taskID: a.taskID,
            threadID: a.threadID,
            fn() {
                s.asyncTask.contextSet({ componentIdx: 0, slot: 0 }, 17);
                s.core.withCurrentTaskMeta({
                    componentIdx: 0,
                    taskID: a.taskID,
                    threadID: other.id(),
                    fn() {
                        expect(s.asyncTask.contextGet({ componentIdx: 0, slot: 0 })).toBe(0);
                        s.asyncTask.contextSet({ slot: 0 }, 42);
                        expect(operations.threadIndex(s.threadLookup, 0)).toBe(other.id());
                    },
                });
                expect(s.asyncTask.contextGet({ slot: 0 })).toBe(17);
            },
        });
        expect(other.storage[0]).toBe(42);
        a.task.resolve([]);
        a.task.removeThread(other);
        a.task.exit({ skipExclusiveLockCheck: true });
    } finally {
        s.cleanup();
    }
});

test.concurrent('a task remains addressable until its last spawned thread exits', () => {
    const s = store();
    try {
        const a = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        const other = a.task.addThread(new s.asyncTask.AsyncThread({ componentIdx: 0, task: a.task }));
        a.task.resolve([]);
        a.task.exit({ skipExclusiveLockCheck: true });
        expect(s.asyncTask.getCurrentTask(0, a.taskID)?.task).toBe(a.task);
        expect(s.asyncTask.currentTaskIds).toEqual([]);
        expect(s.asyncTask.getCurrentThread(0, a.threadID, a.taskID)).toBeUndefined();
        expect(s.asyncTask.getCurrentThread(0, other.id(), a.taskID)?.thread).toBe(other);
        a.task.removeThread(other);
        expect(s.asyncTask.getCurrentTask(0, a.taskID)).toBeUndefined();
    } finally {
        s.cleanup();
    }
});

test.concurrent('host task threads do not allocate a guest instance or guest thread table', () => {
    const s = store();
    try {
        const a = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: -1 });
        expect(s.component.asyncState.has(-1)).toBe(false);
        expect(s.asyncTask.getCurrentThread(-1, a.threadID, a.taskID)).toBeUndefined();
        a.task.resolve([]);
        a.task.exit();
        expect(s.component.asyncState.has(-1)).toBe(false);
    } finally {
        s.cleanup();
    }
});

test.concurrent('task.return rejects a synchronous canonical lift even when JSPI is enabled', () => {
    const s = store();
    try {
        const a = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0, isManualAsync: true });
        a.task.setCalleeIsAsync(false);
        s.core.withCurrentTaskMeta({
            componentIdx: 0,
            taskID: a.taskID,
            threadID: a.threadID,
            fn() {
                expect(() =>
                    s.asyncTask.taskReturn({
                        componentIdx: 0,
                        getMemoryFn: () => undefined,
                        liftFns: [],
                        useDirectParams: true,
                    }),
                ).toThrow(WebAssembly.RuntimeError);
            },
        });
        a.task.resolve([]);
        a.task.exit({ skipExclusiveLockCheck: true });
    } finally {
        s.cleanup();
    }
});

test.concurrent("context slot accessors of an instance follow the instance's current thread", () => {
    const s = store();
    try {
        const get = operations.contextSlotAccessor(s.threadLookup, { componentIdx: 0, slot: 0 }, 'get') as () => number;
        const set = operations.contextSlotAccessor(s.threadLookup, { componentIdx: 0, slot: 0 }, 'set') as (
            value: number,
        ) => void;
        const getSecond = operations.contextSlotAccessor(
            s.threadLookup,
            { componentIdx: 0, slot: 1 },
            'get',
        ) as () => number;

        const a = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        const other = a.task.addThread(new s.asyncTask.AsyncThread({ componentIdx: 0, task: a.task }));
        other.storage[1] = 5;
        s.core.withCurrentTaskMeta({
            componentIdx: 0,
            taskID: a.taskID,
            threadID: a.threadID,
            fn() {
                // The accessors and the JS implementation see the same slots.
                set(17);
                expect(s.asyncTask.contextGet({ componentIdx: 0, slot: 0 })).toBe(17);
                s.asyncTask.contextSet({ slot: 0 }, 18);
                expect(get()).toBe(18);
                expect(getSecond()).toBe(0);

                s.core.withCurrentTaskMeta({
                    componentIdx: 0,
                    taskID: a.taskID,
                    threadID: other.id(),
                    fn() {
                        expect(get()).toBe(0);
                        expect(getSecond()).toBe(5);
                        set(42);
                        expect(s.asyncTask.contextGet({ slot: 0 })).toBe(42);
                    },
                });
                expect(get()).toBe(18);
                expect(getSecond()).toBe(0);

                // A realloc runs with fresh slots, which the accessors and the
                // JS implementation both see, and which are then discarded.
                const realloc = s.asyncTask.guardCannotLeave(
                    0,
                    () => {
                        expect(get()).toBe(0);
                        set(97);
                        expect(s.asyncTask.contextGet({ componentIdx: 0, slot: 0 })).toBe(97);
                        s.asyncTask.contextSet({ componentIdx: 0, slot: 1 }, 98);
                        expect(getSecond()).toBe(98);
                    },
                    true,
                );
                realloc();
                expect(get()).toBe(18);
                expect(getSecond()).toBe(0);
            },
        });

        // Slots return to a thread once it is no longer current.
        expect(a.thread.storage).toEqual([18, 0]);
        expect(other.storage).toEqual([42, 5]);
        a.task.resolve([]);
        a.task.removeThread(other);
        a.task.exit({ skipExclusiveLockCheck: true });
    } finally {
        s.cleanup();
    }
});

test.concurrent('context slot accessors stop using a thread which exits while current', () => {
    const s = store();
    try {
        const get = operations.contextSlotAccessor(s.threadLookup, { componentIdx: 0, slot: 0 }, 'get') as () => number;
        const set = operations.contextSlotAccessor(s.threadLookup, { componentIdx: 0, slot: 0 }, 'set') as (
            value: number,
        ) => void;

        const a = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        const other = a.task.addThread(new s.asyncTask.AsyncThread({ componentIdx: 0, task: a.task }));
        s.core.withCurrentTaskMeta({
            componentIdx: 0,
            taskID: a.taskID,
            threadID: other.id(),
            fn() {
                set(9);
                a.task.removeThread(other);
                expect(other.storage[0]).toBe(9);

                // The register now names no live thread.
                expect(() => get()).toThrow(/missing\/incomplete global current thread meta/);
                expect(() => set(1)).toThrow(/missing\/incomplete global current thread meta/);
            },
        });
        a.task.resolve([]);
        a.task.exit({ skipExclusiveLockCheck: true });
    } finally {
        s.cleanup();
    }
});

test.concurrent('context slot accessors fall back to the executing task of another instance', () => {
    const s = store();
    try {
        const get = operations.contextSlotAccessor(s.threadLookup, { componentIdx: 0, slot: 0 }, 'get') as () => number;
        const calleeGet = operations.contextSlotAccessor(
            s.threadLookup,
            { componentIdx: 1, slot: 0 },
            'get',
        ) as () => number;
        const calleeSet = operations.contextSlotAccessor(s.threadLookup, { componentIdx: 1, slot: 0 }, 'set') as (
            value: number,
        ) => void;

        const caller = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        s.core.withCurrentTaskMeta({
            componentIdx: 0,
            taskID: caller.taskID,
            threadID: caller.threadID,
            fn() {
                s.asyncTask.contextSet({ componentIdx: 0, slot: 0 }, 21);

                // Instance 1 has no task of its own, as in a post-return
                // function: it shares the caller's slots in both directions.
                expect(calleeGet()).toBe(21);
                calleeSet(22);
                expect(get()).toBe(22);
                expect(s.asyncTask.contextGet({ slot: 0 })).toBe(22);

                const callee = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 1 });
                s.core.withCurrentTaskMeta({
                    componentIdx: 1,
                    taskID: callee.taskID,
                    threadID: callee.threadID,
                    fn() {
                        expect(calleeGet()).toBe(0);
                        calleeSet(7);
                        expect(get()).toBe(22);
                    },
                });
                expect(callee.thread.storage[0]).toBe(7);
                expect(calleeGet()).toBe(22);
                callee.task.resolve([]);
                callee.task.exit({ skipExclusiveLockCheck: true });
            },
        });
        caller.task.resolve([]);
        caller.task.exit({ skipExclusiveLockCheck: true });
    } finally {
        s.cleanup();
    }
});

test.concurrent('context slot accessors follow registers which are written directly', () => {
    const s = store();
    try {
        const get = operations.contextSlotAccessor(s.threadLookup, { componentIdx: 0, slot: 0 }, 'get') as () => number;
        const set = operations.contextSlotAccessor(s.threadLookup, { componentIdx: 0, slot: 0 }, 'set') as (
            value: number,
        ) => void;
        const { registers } = s.threadLookup;

        const a = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        const b = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        const metaA = { componentIdx: 0, taskID: a.taskID, threadID: a.threadID };
        const metaB = { componentIdx: 0, taskID: b.taskID, threadID: b.threadID };

        // Resuming a suspended stack restores its task without entering a scope.
        registers[0] = metaA;
        set(1);
        registers[0] = metaB;
        expect(get()).toBe(0);
        set(2);
        registers[0] = metaA;
        expect(get()).toBe(1);

        // Code without a live task of its own uses the executing task.
        registers[0] = null;
        registers.current = metaB;
        expect(get()).toBe(2);
        registers.current = null;
        expect(() => get()).toThrow(/missing\/incomplete global current thread meta/);

        for (const value of [a, b]) {
            value.task.resolve([]);
            value.task.exit({ skipExclusiveLockCheck: true });
        }
    } finally {
        s.cleanup();
    }
});

test.concurrent('context slot accessors give a thread on a recycled index empty slots', () => {
    const s = store();
    try {
        const get = operations.contextSlotAccessor(s.threadLookup, { componentIdx: 0, slot: 0 }, 'get') as () => number;
        const set = operations.contextSlotAccessor(s.threadLookup, { componentIdx: 0, slot: 0 }, 'set') as (
            value: number,
        ) => void;
        const { registers } = s.threadLookup;

        const a = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        const stale = { componentIdx: 0, taskID: a.taskID, threadID: a.threadID };
        registers.current = null;
        registers[0] = stale;
        set(5);
        a.task.resolve([]);
        a.task.exit({ skipExclusiveLockCheck: true });
        expect(() => get()).toThrow(/missing\/incomplete global current thread meta/);

        // The register of the exited task names the index, but not the new thread.
        const b = s.asyncTask.createNewCurrentImplicitThread({ componentIdx: 0 });
        expect(b.threadID).toBe(a.threadID);
        registers.current = null;
        registers[0] = stale;
        expect(() => get()).toThrow(/missing\/incomplete global current thread meta/);
        registers[0] = { componentIdx: 0, taskID: b.taskID, threadID: b.threadID };
        expect(get()).toBe(0);

        b.task.resolve([]);
        b.task.exit({ skipExclusiveLockCheck: true });
    } finally {
        s.cleanup();
    }
});
