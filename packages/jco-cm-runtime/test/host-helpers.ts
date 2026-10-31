// Test-only composition using the same selected owners as generated bindings.
import * as operations from '../src/intrinsics/host.js';
import type {
    HostPromisingPlatform,
    HostPrepareContext,
    HostAsyncStartContext,
    HostSyncStartContext,
} from '../src/runtime.js';
import { create as createTask } from './async-task-helpers.js';

type TaskOptions = NonNullable<Parameters<typeof createTask>[0]>;
type Options = Omit<TaskOptions, 'platform'> & {
    platform?: {
        WebAssembly: NonNullable<TaskOptions['platform']>['WebAssembly'] & HostPromisingPlatform;
    };
};
type Tail<A extends unknown[]> = A extends [unknown, ...infer Rest] ? Rest : never;

export function create(options: Options = {}) {
    const selected = createTask(options);
    const { core, asyncTask, taskLookup, creation, lookup, driver } = selected;
    const prepare: HostPrepareContext = {
        ...taskLookup,
        creation,
        RuntimeError: core.RuntimeError,
        get mayBlock() {
            return asyncTask.currentTaskMayBlock;
        },
    };
    const syncStart: HostSyncStartContext = {
        ...taskLookup,
        componentIdxs: asyncTask.currentComponentIdxs,
        lookup,
        driver,
        platform: options.platform?.WebAssembly ?? (WebAssembly as HostPromisingPlatform),
    };
    const asyncStart: HostAsyncStartContext = {
        ...syncStart,
        get blockingDepth() {
            return asyncTask.asyncBlockingCallDepth;
        },
        memories: core.componentMemoryMap,
        events: core.asyncEventCode,
    };
    const host = {
        prepareCall: (...args: Tail<Parameters<typeof operations.prepareCall>>) =>
            operations.prepareCall(prepare, ...args),
        asyncStartCall: (...args: Tail<Parameters<typeof operations.asyncStartCall>>) =>
            operations.asyncStartCall(asyncStart, ...args),
        syncStartCall: (...args: Tail<Parameters<typeof operations.syncStartCall>>) =>
            operations.syncStartCall(syncStart, ...args),
        storeEventInComponentMemory: operations.storeEventInComponentMemory,
    };
    return { ...selected, host, hostContexts: { prepare, asyncStart, syncStart } };
}
