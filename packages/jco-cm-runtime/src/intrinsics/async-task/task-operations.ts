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
import { getCurrentTaskMeta, withCurrentTaskMeta } from '../task-context.js';
import { debugLog } from '../core-debug.js';
import { getOrCreateAsyncState } from '../component.js';

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
    if (taskID) {
        return taskMetas.find((meta) => meta.task.id() === taskID);
    }
    // The task whose guest code is running is the one the metadata
    // wrappers record for the component (and restore when a suspended
    // stack resumes). The component's most recently created task may
    // be another one, e.g. a prepared callee that has not entered yet
    // while an earlier task of the component is suspended.
    const current = _context.registers[componentIdx];
    if (current && current.taskID !== undefined) {
        const currentMeta = taskMetas.find((meta) => meta.task.id() === current.taskID);
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
    debugLog('[createNewCurrentImplicitThread()] args', args);
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
    const thread = newTask.addThread(new _context.AsyncThread({ componentIdx, task: newTask })) as ReturnType<
        T['addThread']
    >;
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
    debugLog('[clearCurrentThread()] args', { componentIdx, taskID });
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
    const taskIdx = taskID === undefined ? tasks.length - 1 : tasks.findIndex((meta) => meta.id === taskID);
    if (taskIdx === -1) {
        return;
    }
    const taskMeta = tasks[taskIdx];
    if (!options.preserveTask) {
        tasks.splice(taskIdx, 1);
        _context.checkIdle?.();
    }
    const globalTaskIdx = _context.taskIds.lastIndexOf(taskMeta.id);
    if (globalTaskIdx !== -1) {
        _context.taskIds.splice(globalTaskIdx, 1);
        _context.componentIdxs.splice(globalTaskIdx, 1);
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

// TaskReturn
export function taskReturn(
    _context: TaskReturnRuntimeContext,
    ctx: TaskReturnOptions,
    ...params: unknown[]
): ReturnType<AsyncTaskModule['taskReturn']> {
    const { componentIdx, getMemoryFn, memoryIdx, callbackFnIdx, liftFns, lowerFns, stringEncoding } = ctx;
    const memory = getMemoryFn();
    let useDirectParams = ctx.useDirectParams;
    const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx)!;
    const taskMeta = getCurrentTask(_context, componentIdx, taskID);
    if (!taskMeta) {
        throw new Error('failed to retrieve current task metadata');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('invalid/missing current task in metadata');
    }
    if (!task.calleeIsAsync()) {
        throw new _context.RuntimeError('task.return requires an async canonical lift');
    }
    task.validateResourceBorrowScope();
    // Canonical ABI `canon_task_return`: the result type must be the one of
    // the task's function type.
    const expectedResultType = task.returnResultTypeIdx();
    if (expectedResultType !== null && ctx.resultTypeIdx !== undefined && ctx.resultTypeIdx !== expectedResultType) {
        throw new _context.RuntimeError('task.return result type does not match the function type');
    }
    debugLog('[taskReturn()] args', {
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
        debugLog('[taskReturn()] calling return fn on subtask', {
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
    const expectedMemoryIdx = task.getReturnMemoryIdx();
    if (expectedMemoryIdx !== null && memoryIdx !== null && expectedMemoryIdx !== memoryIdx) {
        debugLog('[taskReturn()] mismatched memory indices', { expectedMemoryIdx, memoryIdx });
        throw new Error('task.return memory [' + memoryIdx + '] does not match task [' + expectedMemoryIdx + ']');
    }
    task.callbackFnIdx = callbackFnIdx;
    if (!memory && liftFns.length > 4) {
        debugLog('[taskReturn()] memory not present for max async flat lifts');
        throw new Error('memory must be present if more than max async flat lifts are performed');
    }
    let liftCtx: TaskLiftContext = { memory, useDirectParams, params, componentIdx, stringEncoding };
    if (!useDirectParams) {
        if (!memory) {
            debugLog('missing memory despite indirect param usage', { useDirectParams, liftCtx, ctx });
            throw new Error('missing memory despite indirect param usage');
        }
        liftCtx.storagePtr = (params[0] as number) >>> 0;
        liftCtx.storageLen = params[1] as number;
    }
    const liftedResults = [];
    debugLog('[taskReturn()] lifting results out of memory', { liftCtx });
    for (const liftFn of liftFns) {
        if (liftCtx.storageLen !== undefined && liftCtx.storageLen <= 0) {
            debugLog(`[taskReturn()] ran out of range while writing storageLen = [${liftCtx.storageLen}]`);
            throw new Error('ran out of storage while writing');
        }
        const [val, newLiftCtx] = liftFn(liftCtx);
        liftCtx = newLiftCtx;
        liftedResults.push(val);
    }
    task.resolve(liftedResults);
}

// TaskCancel
export function taskCancel(
    _context: TaskCancelContext,
    componentIdx: number,
): ReturnType<AsyncTaskModule['taskCancel']> {
    debugLog('[taskCancel()] args', { componentIdx });
    const state = getOrCreateAsyncState(_context.lookup, componentIdx);
    if (!state.mayLeave) {
        throw new Error('component instance is not marked as may leave, cannot be cancelled');
    }
    const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx)!;
    const taskMeta = getCurrentTask(_context, componentIdx, taskID);
    if (!taskMeta) {
        throw new Error('invalid/missing async task meta');
    }
    const task = taskMeta.task;
    if (!task) {
        throw new Error('invalid/missing async task');
    }
    if (Reflect.get(task, 'sync') && !task.alwaysTaskReturn) {
        throw new Error('cannot cancel sync tasks without always task return set');
    }
    task.cancel();
}
