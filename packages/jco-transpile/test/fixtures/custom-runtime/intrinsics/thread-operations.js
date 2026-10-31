import { getOrCreateAsyncState } from './component.js';
import { getCurrentTaskMeta } from './task-context.js';

export function getCurrentThread(context, componentIdx, threadID, taskID) {
    if (componentIdx === -1 || threadID === undefined || threadID === null || threadID === 0) {
        return undefined;
    }
    const state = getOrCreateAsyncState(context.lookup, componentIdx);
    const thread = state.threads.get(threadID);
    if (!thread || (taskID !== undefined && thread.taskID() !== taskID)) {
        return undefined;
    }
    return { id: threadID, componentIdx, taskID: thread.taskID(), task: thread.task(), thread };
}
export function currentThreadOrThrow(context, componentIdx) {
    const meta = getCurrentTaskMeta(context.registers, componentIdx);
    if (!meta) {
        throw new Error(`missing/incomplete global current thread meta for component idx [${componentIdx}]`);
    }
    const thread = getCurrentThread(context, meta.componentIdx, meta.threadID, meta.taskID);
    if (!thread) {
        throw new Error(`invalid/missing async thread [${meta.threadID}] for component idx [${componentIdx}]`);
    }
    return thread;
}
