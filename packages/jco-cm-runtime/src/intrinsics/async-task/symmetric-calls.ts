import type {
    TaskSymmetricEnterContext,
    AsyncTaskModule,
    TaskMutableRegister,
    TaskSymmetricExitContext,
} from '../../runtime.js';
import { debugLog } from '../core-debug.js';
import { getOrCreateAsyncState } from '../component.js';
import { getCurrentTask, createNewCurrentImplicitThread } from './task-operations.js';
import { getCurrentTaskMeta, setCurrentTaskMeta } from '../task-context.js';

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
