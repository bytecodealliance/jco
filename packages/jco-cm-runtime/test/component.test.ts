import { expect, test } from 'vitest';
import { create, clearDeadlockCheck } from './component-helpers.js';
import type { ComponentWaitable } from '../src/index.js';

test.concurrent('component stores isolate state and share the resource handle index space', () => {
    const { component, resource, core } = create();
    const other = create().component;
    for (const key of ['instanceFlags', 'storeTrap', 'storeAsyncState', 'asyncState', 'ComponentAsyncState'] as const) {
        expect(component[key]).not.toBe(other[key]);
    }
    const state = component.getOrCreateAsyncState(0);
    expect(component.getOrCreateAsyncState(0)).toBe(state);
    expect(component.asyncState.get(0)).toBe(state);
    expect(state).toBeInstanceOf(component.ComponentAsyncState);
    expect(state.handles).toBeInstanceOf(core.RepTable);
    expect(resource.getHandleIndexSpace(0).alloc()).toBe(1);
    expect(state.handles.insert({})).toBe(2);
    expect(state.subtasks.insert({})).toBe(1);
    expect(component.getOrCreateAsyncState(1).handles.insert({})).toBe(1);
});

test.concurrent('component flags remain live and guarded calls preserve their receiver', () => {
    const { component } = create();
    const state = component.getOrCreateAsyncState(0);
    expect(state.mayLeave).toBe(true);
    expect(() => component.checkMayLeave(0)).toThrow('cannot leave component instance');
    const flags = new WebAssembly.Global({ value: 'i32', mutable: true }, 1);
    component.instanceFlags.set(0, flags);
    const receiver = { value: 40 };
    const guarded = component.guardMayLeave(0, function (this: typeof receiver, n: number) {
        return this.value + n;
    });
    expect(guarded.call(receiver, 2)).toBe(42);
    state.mayLeave = false;
    expect(flags.value).toBe(0);
    expect(() => guarded.call(receiver, 2)).toThrow(WebAssembly.RuntimeError);
    flags.value = 1;
    expect(state.mayLeave).toBe(true);
    expect(() => {
        // @ts-expect-error Generated JavaScript can supply an invalid flag.
        state.mayLeave = 1;
    }).toThrow('mayLeave must be a boolean');
});

test.concurrent('trap recording uses the selected realm, compiler messages and current task register', () => {
    class Trap extends Error {}
    const { component, core } = create({
        platform: { WebAssembly: { RuntimeError: Trap } },
        componentTrapMessages: { core: { unreachable: 'compiler unreachable' }, cannotEnter: 'compiler cannot enter' },
    });
    core.setCurrentTaskMeta({ componentIdx: 0, taskID: 1n, threadID: 1 });
    const sibling = component.getOrCreateAsyncState(1);
    const error = new Trap('unreachable');
    expect(component.recordTrap(undefined, error)).toBe(error);
    expect(error.message).toBe('compiler unreachable');
    const state = component.getOrCreateAsyncState(0);
    expect(component.storeTrap.error).toBe(error);
    expect(() => state.throwIfInterrupted()).toThrow(error);
    expect(() => state.throwIfTrapped()).toThrow('compiler cannot enter');
    expect(sibling.isTrapped()).toBe(false);
    expect(() => sibling.throwIfTrapped()).not.toThrow();
    const ordinary = new Error('unreachable');
    expect(component.normalizeCoreTrap(ordinary)).toBe(ordinary);
    expect(ordinary.message).toBe('unreachable');
    expect(component.recordTrap(1, ordinary)).toBe(ordinary);
    expect(sibling.isTrapped()).toBe(false);
    const converted = component.recordTrap(1, new RangeError('memory'), true);
    expect(converted).toBeInstanceOf(Trap);
    expect(component.storeTrap.error).toBe(error); // First store trap wins.
    expect(() => sibling.throwIfInterrupted()).toThrow('out of bounds memory access');
});

test.concurrent('guardTrap records synchronous traps and preserves values, promises and receivers', async () => {
    const { component } = create();
    const receiver = { result: Promise.resolve(42) };
    const guarded = component.guardTrap(0, function (this: typeof receiver) {
        return this.result;
    });
    expect(guarded.call(receiver)).toBe(receiver.result);
    expect(await guarded.call(receiver)).toBe(42);
    const ordinary = new RangeError('host range');
    const fail = component.guardTrap(0, () => {
        throw ordinary;
    });
    expect(fail).toThrow(ordinary);
    expect(component.storeTrap.error).toBeNull();
    const convert = component.guardTrap(
        0,
        () => {
            throw ordinary;
        },
        true,
    );
    expect(convert).toThrow(WebAssembly.RuntimeError);
    expect(component.getOrCreateAsyncState(0).isTrapped()).toBe(true);
});

test.concurrent('backpressure waits for zero, wakes every waiter, and cleans up handlers once', async () => {
    const { component } = create();
    const state = component.getOrCreateAsyncState(0);
    expect(await state.waitForBackpressure()).toBeNull();
    component.backpressureInc(0);
    component.backpressureInc(0);
    let reentered = false;
    state.registerHandler({
        event: 'backpressure-change',
        fn: (bp) => {
            if (bp === 0 && !reentered) {
                reentered = true;
                state.setBackpressure(0);
            }
        },
    });
    let completed = 0;
    const a = state.waitForBackpressure().then(() => {
        completed++;
    });
    const b = state.waitForBackpressure().then(() => {
        completed++;
    });
    expect(state.getBackpressureWaiters()).toBe(2n);
    component.backpressureDec(0);
    await Promise.resolve();
    expect(completed).toBe(0);
    component.backpressureDec(0);
    await Promise.all([a, b]);
    expect(completed).toBe(2);
    expect(state.getBackpressureWaiters()).toBe(0n);
    state.setBackpressure(0);
    expect(state.getBackpressureWaiters()).toBe(0n);
    expect(() => component.backpressureDec(0)).toThrow('backpressure counter underflow');
    state.setBackpressure(65535);
    expect(() => component.backpressureInc(0)).toThrow('overflow');
    expect(state.getBackpressure()).toBe(65535);
    const changes: number[] = [];
    const handlerID = state.registerHandler({ event: 'backpressure-change', fn: (bp) => changes.push(bp) });
    state.setBackpressure(1);
    state.removeHandler({ event: 'backpressure-change', handlerID });
    state.setBackpressure(0);
    expect(changes).toEqual([1]);
    expect(() => state.registerHandler({ event: 'unknown', fn() {} })).toThrow('unrecognized event');
});

test.concurrent('sync import completion wakes the current generation of waiters', async () => {
    const state = create().component.getOrCreateAsyncState(0);
    expect(state.callingSyncImport()).toBe(false);
    state.callingSyncImport(true);
    const first = state.waitForSyncImportCallEnd();
    state.callingSyncImport(false);
    await first;
    let done = false;
    state.callingSyncImport(true);
    const second = state.waitForSyncImportCallEnd().then(() => {
        done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    state.callingSyncImport(false);
    await second;
});

test.concurrent('waitable creation is lazy and setAllError marks every existing component', () => {
    let calls = 0;
    // The selected constructor is retained without constructing an instance yet.
    const waitable = {} as ComponentWaitable;
    const { component } = create({
        Waitable: class {
            constructor(args: { target?: unknown }) {
                expect(args).toEqual({ target: 'future' });
                calls++;
                return waitable;
            }
        } as new (args: { target?: unknown }) => ComponentWaitable,
    });
    const a = component.getOrCreateAsyncState(0);
    const b = component.getOrCreateAsyncState(1);
    expect(calls).toBe(0);
    expect(a.createWaitable({ target: 'future' })).toBe(waitable);
    expect(calls).toBe(1);
    component.setAllError();
    expect(a.errored()).toBe(true);
    expect(b.errored()).toBe(true);
    expect(a.isTrapped()).toBe(false);
    const other = create().component.getOrCreateAsyncState(0).createWaitable({ target: 'other' });
    expect(other.target).toBe('other');
    expect(other.isInSet()).toBe(false);
});

test.concurrent.each([false, true])(
    'host operations track settlement and forward disposal (reject=%s)',
    async (reject) => {
        const { component, core } = create();
        try {
            expect(component.trackHostOperation(() => 42)).toBe(42);
            expect(() =>
                component.trackHostOperation(() => {
                    throw new Error('host');
                }),
            ).toThrow('host');
            expect(component.storeAsyncState.pendingHostOperations).toBe(0);
            const deferred = core.promiseWithResolvers<number>();
            const calls: unknown[] = [];
            const result = Object.assign(deferred.promise, {
                [Symbol.dispose]() {
                    calls.push(this);
                },
                [Symbol.asyncDispose]() {
                    calls.push(this);
                    return Promise.resolve();
                },
            });
            const tracked = component.trackHostOperation(() => result) as typeof result;
            expect(component.storeAsyncState.pendingHostOperations).toBe(1);
            tracked[Symbol.dispose]();
            await tracked[Symbol.asyncDispose]();
            expect(calls).toEqual([result, result]);
            if (reject) {
                deferred.reject(new Error('host failed'));
                await expect(tracked).rejects.toThrow('host failed');
            } else {
                deferred.resolve(42);
                expect(await tracked).toBe(42);
            }
            expect(component.storeAsyncState.pendingHostOperations).toBe(0);
        } finally {
            clearDeadlockCheck(component);
        }
    },
);
