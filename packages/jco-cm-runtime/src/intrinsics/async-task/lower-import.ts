import type { TaskLowerImportRuntimeContext, TaskLowerImportOptions, AsyncTaskModule } from '../../runtime.js';
import { debugLog } from '../core/debug.js';
import { checkMayLeave, getOrCreateAsyncState } from '../component.js';
import { getCurrentTaskMeta, withCurrentTaskMetaAsync, withCurrentTaskMeta } from '../task-context.js';
import { getCurrentTask } from './task-operations.js';
import { promiseWithResolvers } from '../core/promises.js';

// LowerImport
export function lowerImport(
    _context: TaskLowerImportRuntimeContext,
    args: TaskLowerImportOptions,
    ...params: unknown[]
): ReturnType<AsyncTaskModule['lowerImport']> {
    debugLog('[_lowerImport()] args', { args, params });
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
        debugLog('[_lowerImport()] async-lowered import return', {
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
            debugLog('[_lowerImport()] calling lowered import', { importFn, params });
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
            debugLog('[_lowerImport()] import fn error:', err);
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
