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
