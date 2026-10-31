// Test-only assembly of actual selected owners and narrow operation contexts.
import * as operations from '../src/intrinsics/component.js';
import type { ComponentTask, ComponentThread, ComponentWaitable } from '../src/runtime.js';
import { createTestIntrinsics, type CoreTestOptions } from './core-test-helpers.js';
interface ComponentTestOptions extends CoreTestOptions {
    componentTrapMessages?: { core?: Readonly<Record<string, string>>; cannotEnter?: string };
    componentContext?: { createWaitable(args: { target?: unknown }): ComponentWaitable };
}
export function create(options: ComponentTestOptions = {}) {
    const { core, resource } = createTestIntrinsics(options);
    const instanceFlags = operations.initializeInstanceFlags();
    const storeTrap = operations.initializeStoreTrap();
    const storeAsyncState = operations.initializeStoreAsyncState();
    const asyncState = operations.initializeComponentAsyncStates();
    const normalization = {
        RuntimeError: core.RuntimeError,
        messages: operations.initializeCoreTrapMessages(options.componentTrapMessages?.core ?? {}),
    };
    const deadlock = { RuntimeError: core.RuntimeError, storeTrap, storeAsyncState, asyncState };
    const ComponentAsyncState = operations.initializeComponentAsyncStateClass({
        RuntimeError: core.RuntimeError,
        RepTable: core.RepTable,
        indexSpaces: resource.indexSpaces,
        instanceFlags,
        storeTrap,
        normalization,
        cannotEnter: options.componentTrapMessages?.cannotEnter ?? 'wasm trap: cannot enter component instance',
        deadlock,
        createWaitable: options.componentContext?.createWaitable,
    });
    const lookup = { asyncState, ComponentAsyncState };
    const record = { RuntimeError: core.RuntimeError, registers: core.currentTaskMeta, lookup };
    const mayLeave = { RuntimeError: core.RuntimeError, instanceFlags };
    const component = {
        instanceFlags,
        storeTrap,
        storeAsyncState,
        asyncState,
        ComponentAsyncState,
        checkForDeadlock: () => operations.checkForDeadlock(deadlock),
        trackHostOperation: <T>(fn: () => T) =>
            operations.trackHostOperation({ ...deadlock, symbolDispose: core.symbolDispose }, fn),
        normalizeCoreTrap: <T>(error: T) => operations.normalizeCoreTrap(normalization, error),
        checkMayLeave: (idx: number) => operations.checkMayLeave(mayLeave, idx),
        guardMayLeave: <A extends unknown[], T, R>(idx: number, fn: (this: R, ...args: A) => T) =>
            operations.guardMayLeave(mayLeave, idx, fn),
        recordTrap: (idx: number | null | undefined, error: unknown, convertsRangeErrors = false) =>
            operations.recordTrap(record, idx, error, convertsRangeErrors),
        guardTrap: <A extends unknown[], T, R>(
            idx: number | null | undefined,
            fn: (this: R, ...args: A) => T,
            convertsRangeErrors = false,
        ) => operations.guardTrap(record, idx, fn, convertsRangeErrors),
        getOrCreateAsyncState: (idx: number) => operations.getOrCreateAsyncState(lookup, idx),
        backpressureInc: (idx: number) => operations.backpressureInc(lookup, idx),
        backpressureDec: (idx: number) => operations.backpressureDec(lookup, idx),
        setAllError: () => operations.setAllError(asyncState),
    };
    return { core, resource, component };
}
type ComponentIntrinsics = ReturnType<typeof create>['component'];
export function clearDeadlockCheck(component: ComponentIntrinsics) {
    if (component.storeAsyncState.deadlockCheck !== null) {
        clearTimeout(component.storeAsyncState.deadlockCheck as ReturnType<typeof setTimeout>);
        component.storeAsyncState.deadlockCheck = null;
    }
}

export function task(id: bigint, componentIdx = 0, root?: ComponentTask) {
    let rejected = false;
    let cancelled = false;
    let locked = true;
    const errors: unknown[] = [];
    let slices = 0;
    let progress = 0;
    const value: ComponentTask = {
        id: () => id,
        defaultThread: () => thread,
        componentIdx: () => componentIdx,
        taskState: () => (rejected ? 'rejected' : 'pending'),
        entryFnName: () => 'test',
        getParentSubtask: () => undefined,
        getRootTask: () => root ?? value,
        isResolvedState: () => rejected,
        isRejected: () => rejected,
        isCancelled: () => cancelled,
        needsExclusiveLock: () => locked,
        endFirstSlice: () => {
            slices++;
        },
        notifyProgress: () => {
            progress++;
        },
        setErrored: (error) => {
            errors.push(error);
        },
        reject: () => {
            rejected = true;
        },
    };
    const thread: ComponentThread = {
        id: () => Number(id),
        taskID: () => id,
        componentIdx: () => componentIdx,
        task: () => value,
        isCancelled: () => cancelled,
        isRejected: () => rejected,
        notifyProgress: () => {
            progress++;
        },
    };
    return {
        value,
        thread,
        errors,
        get slices() {
            return slices;
        },
        get progress() {
            return progress;
        },
        cancel() {
            cancelled = true;
        },
        unlock() {
            locked = false;
        },
    };
}
