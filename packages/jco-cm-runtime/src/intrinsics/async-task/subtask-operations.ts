import type { SubtaskDropContext, AsyncTaskModule, SubtaskCancelContext } from '../../runtime.js';
import { debugLog } from '../core/debug.js';
import { getOrCreateAsyncState } from '../component.js';
import { getCurrentTaskMeta } from '../task-context.js';
import { getCurrentTask } from './task-operations.js';

/** Implements `canon subtask.drop`. */
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

/** Implements `canon subtask.cancel`. */
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
            throw new _context.RuntimeError('cancellation has already been requested for this subtask');
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
