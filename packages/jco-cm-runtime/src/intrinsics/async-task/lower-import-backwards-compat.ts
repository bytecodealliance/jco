import { isPromiseLike } from '../core/promises.js';
import type {
    TaskCompatImportRuntimeContext,
    TaskLowerImportOptions,
    AsyncTaskModule,
    AsyncTask as AsyncTaskType,
} from '../../runtime.js';
import { debugLog } from '../core/debug.js';
import { checkMayLeave, getOrCreateAsyncState } from '../component.js';
import { getCurrentTaskMeta, clearCurrentTaskMeta, setCurrentTaskMeta } from '../task-context.js';
import { getCurrentTask, createNewCurrentImplicitThread } from './task-operations.js';
import { promiseWithResolvers } from '../core/promises.js';

// LowerImportBackwardsCompat
export function lowerImportBackwardsCompat(
    _context: TaskCompatImportRuntimeContext,
    args: TaskLowerImportOptions,
    ...params: unknown[]
): ReturnType<AsyncTaskModule['lowerImportBackwardsCompat']> {
    debugLog('[_lowerImportBackwardsCompat()] args', { args, params });
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
        importFn,
        stringEncoding,
    } = args;
    checkMayLeave(_context.mayLeave, componentIdx);
    const meta = getCurrentTaskMeta(_context.registers, componentIdx);
    let taskMeta = meta && getCurrentTask(_context, componentIdx, meta.taskID);
    let createdTask: AsyncTaskType | undefined;
    // Some components depend on initialization logic (i.e. `_initialize` or some such
    // core wasm export) that is embedded in the component, but is not executed or wizer'd
    // away before the transpiled component is attempted to be used.
    //
    // These components execut their initialization logic *when they are imported* in the
    // transpiled context -- so we may get a call to an export that is lowered without going
    // through `CallWasm` or `CallInterface`.
    //
    // A nested synchronous call can leave global metadata for a task
    // that has already exited. Treat it like a call with no current task.
    if (!taskMeta) {
        if (funcTypeIsAsync || (isAsync && !isManualAsync)) {
            throw new Error('p3 async wasm exports cannot use backwards compat auto-task init');
        }
        const {
            task: newTask,
            taskID: newTaskID,
            threadID: newThreadID,
        } = createNewCurrentImplicitThread(_context.creation, {
            componentIdx,
            isAsync,
            isManualAsync,
            callingWasmExport: false,
        });
        createdTask = newTask;
        // Since we're managing the task creation ourselves we must clear ourselves
        createdTask.registerOnResolveHandler(() => {
            clearCurrentTaskMeta(_context.registers, {
                taskID: newTaskID,
                threadID: newThreadID,
                componentIdx: task.componentIdx(),
            });
        });
        setCurrentTaskMeta(_context.registers, {
            componentIdx,
            taskID: newTaskID,
            threadID: newThreadID,
        });
        taskMeta = getCurrentTask(_context, componentIdx, newTaskID);
    }
    if (!taskMeta) {
        throw new Error('invalid/missing async task meta');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('invalid/missing async task');
    }
    getOrCreateAsyncState(_context.lookup, componentIdx);
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
        if (createdTask) {
            createdTask.enterSync();
        }
        importFn(...params);
        // TODO(breaking): remove once we get rid of manual async import specification,
        // as func types cannot be detected in that case only (and we don't need that w/ p3)
        if (!funcTypeIsAsync && !subtask.isReturned()) {
            throw new Error('post-execution subtasks must either be async or returned');
        }
        const syncRes = subtask.getResult();
        if (createdTask) {
            createdTask.resolve([syncRes]);
            createdTask.exit();
        }
        return syncRes;
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
                await importFn(...params);
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
    const subtaskState = subtask.getStateNumber();
    if (subtaskState < 0 || subtaskState >= 2 ** 4) {
        throw new Error('invalid subtask state, out of valid range');
    }
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
    // Call the host in this slice so a synchronous answer stays synchronous.
    // Nonblocking tasks, including destructors, trap only on a returned promise.
    if (!isAsync && !funcTypeIsAsync && isManualAsync) {
        debugLog('[_lowerImportBackwardsCompat()] calling lowered import', { importFn, params });
        if (createdTask) {
            createdTask.enterSync();
        }
        try {
            const result = importFn(...params);
            const isPromise = isPromiseLike(result);
            if (createdTask) {
                createdTask.resolve([isPromise ? undefined : result]);
            }
            if (!isPromise) {
                return subtask.getResult();
            }
            return Promise.resolve(result).then(() => subtask.getResult());
        } catch (error) {
            if (createdTask) {
                createdTask.reject(error);
            }
            throw error;
        } finally {
            if (createdTask) {
                createdTask.exit();
            }
        }
    }
    queueMicrotask(async () => {
        try {
            debugLog('[_lowerImportBackwardsCompat()] calling lowered import', { importFn, params });
            if (createdTask) {
                await createdTask.enter();
            }
            const asyncRes = await importFn(...params);
            if (createdTask) {
                createdTask.resolve([asyncRes]);
            }
        } catch (err) {
            debugLog('[_lowerImportBackwardsCompat()] import fn error:', err);
            task.setErrored(err);
            task.reject(err);
        }
    });
    debugLog('[_lowerImportBackwardsCompat()] async-lowered import return', {
        fnName: importFn.fnName,
        componentIdx,
        subtaskID: subtask.id(),
        waitableRep: subtask.waitableRep(),
        subtaskState,
        packedResult: (Number(subtask.waitableRep()) << 4) | subtaskState,
    });
    return (Number(subtask.ensureHandle()) << 4) | subtaskState;
}
