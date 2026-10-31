import type {
    TaskLookupContext,
    TaskCreateContext,
    TaskClearContext,
    CreateTaskOptions,
    AsyncTask,
    AsyncTaskMeta,
    TaskIdentity,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
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
    debugLog('[createNewCurrentTask()] args', args);
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
    debugLog('[clearCurrentTask()] args', { componentIdx, taskID });
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
