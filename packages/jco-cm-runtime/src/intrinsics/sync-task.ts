// Synchronous lowers reuse the caller's task, but still need its registers,
// implicit thread and lookup operations. Browsers load every dependency of a
// static module, so keep the async driver out of this entry's import graph.
// Re-export the original functions to preserve identity across both entries.
export { createNewCurrentImplicitThread, getCurrentTask } from './async-task/task-operations.js';
export { initializeAsyncTaskClass } from './async-task/async-task.js';
export { initializeAsyncThreadClass } from './async-task/async-thread.js';
export {
    initializeCurrentComponentIdxs,
    initializeCurrentTaskIds,
    initializeTasksByComponent,
} from './async-task/initializers.js';
