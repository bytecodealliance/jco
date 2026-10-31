// Test-only composition of actual selected owners and operation-specific views.
import * as operations from '../src/intrinsics/async-task.js';
import { initializeFutureValueClass } from '../src/intrinsics/future-value.js';
import { initializeResourceScopeCounter, callDestructor } from '../src/intrinsics/resource.js';
import type { AsyncTaskClassContext, TaskMutableRegister, ResourceDestructorArgs } from '../src/runtime.js';
import { create as createWaitable } from './waitable-test-helpers.js';
import { initializeTaskRegisters } from '../src/intrinsics/task-context.js';

type Options = Omit<NonNullable<Parameters<typeof createWaitable>[0]>, 'waitableContext'> & {
    FutureValue?: AsyncTaskClassContext['FutureValue'];
};
type Tail<A extends unknown[]> = A extends [unknown, ...infer Rest] ? Rest : never;

export function create(options: Options = {}) {
    const tasks = operations.initializeTasksByComponent();
    const registers = options.registers ?? options.coreContext?.traps.registers ?? initializeTaskRegisters();
    const selected = createWaitable({ ...options, registers, waitableContext: { taskLookup: { tasks, registers } } });
    const { core, component, lookup, waitable, traps } = selected;
    const threadLookup = { lookup, registers };
    const AsyncThread = operations.initializeAsyncThreadClass({ ...threadLookup, traps });
    const threadControl = { ...threadLookup, AsyncThread, RuntimeError: core.RuntimeError };
    const taskIds = operations.initializeCurrentTaskIds();
    const componentIdxs = operations.initializeCurrentComponentIdxs();
    const stack = operations.initializeSymmetricSyncGuestCallStack();
    const scopeCounter = initializeResourceScopeCounter();
    const scopeTasks = selected.resource.state.scopeTasks;
    const clearing = { tasks, taskIds, componentIdxs };
    const taskLookup = { tasks, registers };
    const mayLeave = { RuntimeError: core.RuntimeError, instanceFlags: component.instanceFlags };
    const AsyncSubtask = operations.initializeAsyncSubtaskClass({
        RuntimeError: core.RuntimeError,
        lookup,
        memories: core.componentMemoryMap,
        disposeSymbol: core.symbolDispose,
    });
    const AsyncTask = operations.initializeAsyncTaskClass({
        traps,
        postReturn: {
            RuntimeError: core.RuntimeError,
            lookup,
            stackOverflow: 'wasm trap: call stack exhausted',
            uncaughtException: 'wasm trap: uncaught exception',
        },
        RuntimeError: core.RuntimeError,
        AsyncSubtask,
        Waitable: waitable.Waitable,
        lookup,
        events: core.asyncEventCode,
        determinism: core.asyncDeterminism,
        scopeCounter,
        scopeTasks,
        clearing,
        registers,
        FutureValue: options.FutureValue ?? initializeFutureValueClass(),
    });
    const creation = { ...clearing, AsyncTask, AsyncThread };
    const cancellation = { ...taskLookup, lookup };
    const subtaskCancellation = { ...cancellation, AsyncSubtask, RuntimeError: core.RuntimeError };
    const taskReturn = { ...taskLookup, RuntimeError: core.RuntimeError };
    const driver = {
        RuntimeError: core.RuntimeError,
        lookup,
        WaitableSet: waitable.WaitableSet,
        events: core.asyncEventCode,
        strictNumeric: { strict: false },
    };
    const lower = { ...cancellation, AsyncTask, mayLeave, events: core.asyncEventCode };
    const compat = { ...cancellation, creation, mayLeave, events: core.asyncEventCode };
    let mayBlock: TaskMutableRegister | undefined;
    let blockingDepth: TaskMutableRegister | undefined;
    const selectMayBlock = () => {
        if (mayBlock === undefined) {
            const value = operations.initializeCurrentTaskMayBlock(options.platform?.WebAssembly ?? WebAssembly);
            if (value === false) {
                throw new Error('test fixture requires a selected WebAssembly implementation');
            }
            mayBlock = value;
        }
        return mayBlock;
    };
    const symmetric = {
        ...cancellation,
        creation,
        stack,
        get mayBlock() {
            return selectMayBlock();
        },
    };
    const asyncTask = {
        AsyncThread,
        createNewCurrentImplicitThread: (args: Parameters<typeof operations.createNewCurrentImplicitThread>[1]) =>
            operations.createNewCurrentImplicitThread(creation, args),
        getCurrentThread: (componentIdx: number, threadID?: number, taskID?: bigint) =>
            operations.getCurrentThread(threadLookup, componentIdx, threadID, taskID),
        AsyncTask,
        AsyncSubtask,
        get currentTaskMayBlock() {
            return selectMayBlock();
        },
        get asyncBlockingCallDepth() {
            return (blockingDepth ??= operations.initializeAsyncBlockingCallDepth(
                options.platform?.WebAssembly ?? WebAssembly,
            ));
        },
        asyncBlockedCode: operations.asyncBlockedCode,
        tasksByComponent: tasks,
        currentTaskIds: taskIds,
        currentComponentIdxs: componentIdxs,
        symmetricSyncGuestCallStack: stack,
        contextSet: (...args: Tail<Parameters<typeof operations.contextSet>>) =>
            operations.contextSet(threadLookup, ...args),
        contextGet: (...args: Tail<Parameters<typeof operations.contextGet>>) =>
            operations.contextGet(threadLookup, ...args),
        taskReturn: (...args: Tail<Parameters<typeof operations.taskReturn>>) =>
            operations.taskReturn(taskReturn, ...args),
        subtaskDrop: (...args: Tail<Parameters<typeof operations.subtaskDrop>>) =>
            operations.subtaskDrop(subtaskCancellation, ...args),
        asyncYield: (...args: Tail<Parameters<typeof operations.asyncYield>>) =>
            operations.asyncYield(threadControl, ...args),
        subtaskCancel: (...args: Tail<Parameters<typeof operations.subtaskCancel>>) =>
            operations.subtaskCancel(subtaskCancellation, ...args),
        taskCancel: (...args: Tail<Parameters<typeof operations.taskCancel>>) =>
            operations.taskCancel(cancellation, ...args),
        createNewCurrentTask: (...args: Tail<Parameters<typeof operations.createNewCurrentTask>>) =>
            operations.createNewCurrentTask(creation, ...args),
        getCurrentTask: (...args: Tail<Parameters<typeof operations.getCurrentTask>>) =>
            operations.getCurrentTask(taskLookup, ...args),
        clearCurrentTask: (...args: Tail<Parameters<typeof operations.clearCurrentTask>>) =>
            operations.clearCurrentTask(clearing, ...args),
        unpackCallbackResult: (...args: Tail<Parameters<typeof operations.unpackCallbackResult>>) =>
            operations.unpackCallbackResult(taskReturn, ...args),
        driverLoop: (...args: Tail<Parameters<typeof operations.driverLoop>>) => operations.driverLoop(driver, ...args),
        lowerImport: (...args: Tail<Parameters<typeof operations.lowerImport>>) =>
            operations.lowerImport(lower, ...args),
        lowerImportBackwardsCompat: (...args: Tail<Parameters<typeof operations.lowerImportBackwardsCompat>>) =>
            operations.lowerImportBackwardsCompat(compat, ...args),
        symmetricSyncGuestCallEnter: (...args: Tail<Parameters<typeof operations.symmetricSyncGuestCallEnter>>) =>
            operations.symmetricSyncGuestCallEnter(symmetric, ...args),
        symmetricSyncGuestCallExit: () => operations.symmetricSyncGuestCallExit(symmetric),
    };
    const resource = {
        ...selected.resource,
        state: { ...selected.resource.state, scopeCounter },
        callDestructor: <T>(args: ResourceDestructorArgs<T>) => callDestructor({ registers, creation }, args),
    };
    return { ...selected, resource, asyncTask, taskLookup, threadLookup, threadControl, creation, clearing, driver };
}
