import { createLiftContext } from '../call-context.js';
import { scalarLiftValue } from '../scalar-lift.js';
import type {
    TaskReturnRuntimeContext,
    TaskReturnOptions,
    AsyncTaskModule,
    TaskLiftContext,
    TaskCancelContext,
    TaskLookupContext,
    TaskCreateContext,
    TaskClearContext,
    CreateTaskOptions,
    AsyncTask,
    AsyncTaskMeta,
    TaskIdentity,
} from '../../runtime.js';
import { readTaskRegister, registerSlot, withCurrentTaskMeta } from '../task-context.js';
import { debugLog } from '../core/debug.js';
import { getOrCreateAsyncState } from '../component.js';

/** Trap message for resolving a task twice, e.g. with a second `task.return` (Canonical ABI `Task.return_`). */
export const TASK_ALREADY_RESOLVED = 'task has already resolved';

// GetCurrentTask
export function getCurrentTask<T extends TaskIdentity = AsyncTask>(
    _context: TaskLookupContext<T>,
    componentIdx: number,
    taskID?: bigint,
): AsyncTaskMeta<T> | undefined {
    if (componentIdx === undefined || componentIdx === null) {
        throw new Error('missing component idx'); // TODO(fix)
        // componentIdx = currentComponentIdxs.at(-1);
        // usedGlobal = true;
    }
    const taskMetas = _context.tasks.get(componentIdx);
    if (taskMetas === undefined || taskMetas.length === 0) {
        return undefined;
    }
    // Calls nest, so the task asked for is nearly always the most recent one.
    const last = taskMetas[taskMetas.length - 1];
    if (taskID) {
        return last.task.id() === taskID ? last : taskMetas.find((meta) => meta.task.id() === taskID);
    }
    // The task whose guest code is running is the one the metadata
    // wrappers record for the component (and restore when a suspended
    // stack resumes). The component's most recently created task may
    // be another one, e.g. a prepared callee that has not entered yet
    // while an earlier task of the component is suspended.
    const current = _context.registers[registerSlot(componentIdx)];
    if (current && current.taskID !== undefined) {
        const currentMeta =
            last.task.id() === current.taskID ? last : taskMetas.find((meta) => meta.task.id() === current.taskID);
        if (currentMeta) {
            return currentMeta;
        }
    }
    const taskMeta = taskMetas[taskMetas.length - 1];
    if (!taskMeta || !taskMeta.task) {
        return undefined;
    }
    return taskMeta;
}

// CreateNewCurrentTask
export function createNewCurrentImplicitThread<T extends AsyncTask = AsyncTask>(
    _context: TaskCreateContext<T>,
    args: CreateTaskOptions,
): { task: T; taskID: bigint; thread: ReturnType<T['addThread']>; threadID: number } {
    DEBUG: debugLog('[createNewCurrentImplicitThread()] args', args);
    const {
        componentIdx,
        isAsync,
        isManualAsync,
        preserveFutureResult,
        entryFnName,
        callbackFnName,
        getCallbackFn,
        stringEncoding,
        errHandling,
        getCalleeParamsFn,
        resultPtr,
        callingWasmExport,
        indexOnEntry,
    } = args;
    if (componentIdx === undefined || componentIdx === null) {
        throw new Error('missing/invalid component instance index while starting task');
    }
    let taskMetas = _context.tasks.get(componentIdx);
    const callbackFn = getCallbackFn ? getCallbackFn() : null;
    const newTask = new _context.AsyncTask({
        componentIdx,
        isAsync,
        isManualAsync,
        preserveFutureResult,
        entryFnName,
        callbackFn,
        callbackFnName,
        stringEncoding,
        getCalleeParamsFn,
        resultPtr,
        errHandling,
        callingWasmExport,
    });
    const thread = newTask.addThread(new _context.AsyncThread({ componentIdx, task: newTask }), {
        indexOnEntry,
    }) as ReturnType<T['addThread']>;
    const newTaskID = newTask.id();
    const newTaskMeta = { id: newTaskID, componentIdx, task: newTask };
    // NOTE: do not track host tasks
    _context.taskIds.push(newTaskID);
    _context.componentIdxs.push(componentIdx);
    if (!taskMetas) {
        taskMetas = [newTaskMeta];
        _context.tasks.set(componentIdx, [newTaskMeta]);
    } else {
        taskMetas.push(newTaskMeta);
    }
    return { task: newTask, taskID: newTaskID, thread, threadID: thread.id() };
}

// ClearCurrentTask
export function clearCurrentThread<T extends TaskIdentity = AsyncTask>(
    _context: TaskClearContext<T>,
    componentIdx: number,
    taskID?: bigint,
    options: { preserveTask?: boolean } = {},
): T | undefined {
    DEBUG: debugLog('[clearCurrentThread()] args', { componentIdx, taskID });
    if (componentIdx === undefined || componentIdx === null) {
        throw new Error('missing/invalid component instance index while ending current task');
    }
    const tasks = _context.tasks.get(componentIdx);
    if (!tasks || !Array.isArray(tasks)) {
        throw new Error('missing/invalid tasks for component instance while ending task');
    }
    if (tasks.length == 0) {
        throw new Error(`no current tasks for component instance [${componentIdx}] while ending task`);
    }
    // Calls nest, so the task being cleared is nearly always the most recent one.
    // Look there first, and pop rather than splice, which allocates on every call.
    const lastIdx = tasks.length - 1;
    const taskIdx =
        taskID === undefined || tasks[lastIdx].id === taskID ? lastIdx : tasks.findIndex((meta) => meta.id === taskID);
    if (taskIdx === -1) {
        return;
    }
    const taskMeta = tasks[taskIdx];
    if (!options.preserveTask) {
        if (taskIdx === lastIdx) {
            tasks.pop();
        } else {
            tasks.splice(taskIdx, 1);
        }
        _context.checkIdle?.();
    }

    const { taskIds, componentIdxs } = _context;
    if (taskIds.length > 0 && taskIds[taskIds.length - 1] === taskMeta.id) {
        taskIds.pop();
        componentIdxs.pop();
    } else {
        const globalTaskIdx = taskIds.lastIndexOf(taskMeta.id);
        if (globalTaskIdx !== -1) {
            taskIds.splice(globalTaskIdx, 1);
            componentIdxs.splice(globalTaskIdx, 1);
        }
    }
    return taskMeta.task;
}

/** Compatibility helper for consumers that only need the task tuple. */
export function createNewCurrentTask<T extends AsyncTask = AsyncTask>(
    context: TaskCreateContext<T>,
    args: CreateTaskOptions,
): [T, bigint] {
    const { task, taskID } = createNewCurrentImplicitThread(context, args);
    return [task, taskID];
}
export const clearCurrentTask = clearCurrentThread;

/** Implements `canon task.return`. */
export function taskReturn(
    _context: TaskReturnRuntimeContext,
    ctx: TaskReturnOptions,
    ...params: unknown[]
): ReturnType<AsyncTaskModule['taskReturn']> {
    const { componentIdx, getMemoryFn, memoryIdx, callbackFnIdx, liftFns, lowerFns, stringEncoding } = ctx;
    const memory = getMemoryFn();
    let useDirectParams = ctx.useDirectParams;
    const { taskID } = readTaskRegister(_context.registers, componentIdx)!;
    const taskMeta = getCurrentTask(_context, componentIdx, taskID);
    if (!taskMeta) {
        throw new Error('failed to retrieve current task metadata');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('invalid/missing current task in metadata');
    }

    // Canonical ABI `canon_task_return` and `Task.return_`: every check runs
    // before any result is delivered to the caller.
    if (!getOrCreateAsyncState(_context.lookup, componentIdx).mayLeave) {
        throw new _context.RuntimeError('cannot leave component instance');
    }
    if (!task.calleeIsAsync()) {
        throw new _context.RuntimeError('task.return requires an async canonical lift');
    }
    const expectedResultType = task.returnResultTypeIdx();
    if (expectedResultType !== null && ctx.resultTypeIdx !== undefined && ctx.resultTypeIdx !== expectedResultType) {
        throw new _context.RuntimeError('task.return result type does not match the function type');
    }
    const expectedMemoryIdx = task.getReturnMemoryIdx();
    if (typeof expectedMemoryIdx === 'number' && typeof memoryIdx === 'number' && expectedMemoryIdx !== memoryIdx) {
        DEBUG: debugLog('[taskReturn()] mismatched memory indices', { expectedMemoryIdx, memoryIdx });
        throw new _context.RuntimeError(
            'task.return memory [' + memoryIdx + '] does not match task [' + expectedMemoryIdx + ']',
        );
    }
    const expectedStringEncoding = task.getReturnStringEncoding();
    if (expectedStringEncoding && stringEncoding && expectedStringEncoding !== stringEncoding) {
        throw new _context.RuntimeError(
            `task.return string encoding [${stringEncoding}] does not match task [${expectedStringEncoding}]`,
        );
    }
    if (task.isResolvedState()) {
        throw task.isErrored() ?? new _context.RuntimeError(TASK_ALREADY_RESOLVED);
    }
    task.validateResourceBorrowScope();
    DEBUG: debugLog('[taskReturn()] args', {
        componentIdx,
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        callbackFnIdx,
        memoryIdx,
        liftFns,
        lowerFns,
        params,
    });
    // If we are in a subtask, and have a fused helper function provided to use
    // via PrepareCall, we can use that function rather than performing lifting manually.
    //
    // See also documentation on `HostIntrinsic::PrepareCall`
    const subtaskCallMetadata = task.getParentSubtask()?.getCallMetadata();
    if (subtaskCallMetadata?.returnFn && !subtaskCallMetadata.returnFnCalled) {
        DEBUG: debugLog('[taskReturn()] calling return fn on subtask', {
            componentIdx,
            taskID: task.id(),
            subtaskID: task.getParentSubtask()?.id(),
            returnFnParams: [...params, subtaskCallMetadata.resultPtr],
        });
        const callerTask = task.getParentSubtask()!.getParentTask();
        const res = withCurrentTaskMeta(_context.registers, {
            taskID: callerTask.id(),
            threadID: subtaskCallMetadata.callerThreadID!,
            componentIdx: callerTask.componentIdx(),
            fn: () => subtaskCallMetadata.returnFn!.apply(null, [...params, subtaskCallMetadata.resultPtr]),
        });
        // For sync-lowered calls the fused [return-call] helper returns
        // the lowering's flat result directly; stash it for
        // _syncStartCall to return to the blocked caller.
        subtaskCallMetadata.returnFnResult = res;
        subtaskCallMetadata.returnFnCalled = true;
        task.resolve([]);
        return;
    }
    task.callbackFnIdx = callbackFnIdx;
    if (!memory && liftFns.length > 4) {
        DEBUG: debugLog('[taskReturn()] memory not present for max async flat lifts');
        throw new Error('memory must be present if more than max async flat lifts are performed');
    }
    let liftCtx: TaskLiftContext = createLiftContext({ memory, useDirectParams, params, componentIdx, stringEncoding });
    if (!useDirectParams) {
        if (!memory) {
            DEBUG: debugLog('missing memory despite indirect param usage', { useDirectParams, liftCtx, ctx });
            throw new Error('missing memory despite indirect param usage');
        }
        liftCtx.storagePtr = (params[0] as number) >>> 0;
        liftCtx.storageLen = params[1] as number;
    }
    const liftedResults = [];
    DEBUG: debugLog('[taskReturn()] lifting results out of memory', { liftCtx });
    for (const liftFn of liftFns) {
        if (liftCtx.storageLen !== undefined && liftCtx.storageLen <= 0) {
            DEBUG: debugLog(`[taskReturn()] ran out of range while writing storageLen = [${liftCtx.storageLen}]`);
            throw new Error('ran out of storage while writing');
        }
        const scalar = scalarLiftValue(liftFn, liftCtx.useDirectParams);
        if (scalar) {
            liftedResults.push(scalar(liftCtx));
        } else {
            const [val, newLiftCtx] = liftFn(liftCtx);
            liftCtx = newLiftCtx;
            liftedResults.push(val);
        }
    }
    task.resolve(liftedResults);
}

/** Implements `canon task.cancel`. */
export function taskCancel(
    _context: TaskCancelContext,
    componentIdx: number,
): ReturnType<AsyncTaskModule['taskCancel']> {
    DEBUG: debugLog('[taskCancel()] args', { componentIdx });
    const state = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!state.mayLeave) {
        throw new _context.RuntimeError('component instance is not marked as may leave, cannot be cancelled');
    }
    const { taskID } = readTaskRegister(_context.registers, componentIdx)!;
    const taskMeta = getCurrentTask(_context, componentIdx, taskID);
    if (!taskMeta) {
        throw new Error('invalid/missing async task meta');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('invalid/missing async task');
    }
    // Canonical ABI `canon_task_cancel`: only an async-lifted task can be cancelled.
    if (!task.calleeIsAsync()) {
        throw new _context.RuntimeError('task.cancel requires an async canonical lift');
    }
    task.cancel();
}
