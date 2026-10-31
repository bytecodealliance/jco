import { expect, test } from 'vitest';
import { create } from './waitable-test-helpers.js';
import type { WaitableEvent, WaitableSuspendOptions, WaitableTask, WaitableSet } from '../src/index.js';

function task() {
    const pending = Promise.withResolvers<boolean>();
    let suspended: WaitableSuspendOptions | undefined;
    let callback: ((keepGoing: boolean) => void) | undefined;
    let cancelled = false;
    let error: unknown;
    const value: WaitableTask = {
        componentIdx: () => 0,
        deliverPendingCancel: ({ cancellable }) => cancelled && cancellable,
        isErrored: () => error,
        suspendUntil: (options) => {
            suspended = options;
            return pending.promise;
        },
        suspendUntilCallback: (options, fn) => {
            suspended = options;
            callback = fn;
        },
    };
    return {
        value,
        pending,
        get suspended() {
            return suspended;
        },
        resume(keepGoing: boolean) {
            callback!(keepGoing);
        },
        cancel() {
            cancelled = true;
        },
        trap(err: unknown) {
            error = err;
        },
    };
}
const event: WaitableEvent = { code: 1, payload0: 17, payload1: 23 };

test.concurrent('waitable events are consumed once and reset the completion promise', async () => {
    const { waitable } = create();
    const w = new waitable.Waitable({ componentIdx: 7, target: 'future' });
    expect(w.componentIdx()).toBe(7);
    expect(w.idx()).toBeNull();
    expect(() => w.setIdx(0)).toThrow('cannot be zero');
    w.setIdx(4);
    expect(w.idx()).toBe(4);
    w.setTarget('stream');
    expect(w.target).toBe('stream');
    expect(w.getPendingEvent()).toBeNull();
    const first = w.promise();
    let settled = false;
    void first.then(() => {
        settled = true;
    });
    w.setPendingEvent(() => event);
    await Promise.resolve();
    expect(settled).toBe(false);
    w.resolve();
    await first;
    expect(w.getPendingEvent()).toBe(event);
    expect(w.hasPendingEvent()).toBe(false);
    expect(w.getPendingEvent()).toBeNull();
    const second = w.promise();
    expect(second).not.toBe(first);
    const rejection = expect(second).rejects.toThrow('rejected waitable');
    w.reject(new Error('rejected waitable'));
    await rejection;
});

test.concurrent('joining moves a waitable between sets without duplicates', () => {
    const { Waitable, WaitableSet } = create().waitable;
    const w = new Waitable({});
    const a = new WaitableSet(0);
    const b = new WaitableSet(1);
    a.setTarget('first');
    expect(a.target).toBe('first');
    expect(b.componentIdx()).toBe(1);
    w.join(a);
    w.join(a);
    expect(a.numWaitables()).toBe(1);
    // JavaScript callers must not corrupt membership with an omitted argument.
    expect(() => Reflect.apply(w.join, w, [undefined])).toThrow(TypeError);
    expect(a.numWaitables()).toBe(1);
    w.join(b);
    expect(a.numWaitables()).toBe(0);
    expect(w.isInSet()).toBe(true);
    w.setTarget('joined');
    b.shuffleWaitables();
    expect(b.targets()).toEqual(['joined']);
    w.setPendingEvent(() => event);
    expect(b.getPendingEvent()).toBe(event);
    expect(() => b.getPendingEvent()).toThrow('no waitables');
    w.drop();
    expect(b.numWaitables()).toBe(0);
    expect(w.isInSet()).toBe(false);
});

test.concurrent('standalone waits reject overlap and release the waiter after rejection', async () => {
    const { Waitable, WaitableSet } = create().waitable;
    const w = new Waitable({});
    const suspended = Promise.withResolvers<void>();
    const cstate = { waitUntil: () => suspended.promise };
    const first = w.waitForPendingEvent({ cstate });
    await expect(w.waitForPendingEvent({ cstate })).rejects.toThrow('has a sync waiter');
    const failed = expect(first).rejects.toThrow('scheduler failed');
    suspended.reject(new Error('scheduler failed'));
    await failed;
    await w.waitForPendingEvent({
        cstate: {
            waitUntil: ({ readyFn, cancellable }) => {
                expect(cancellable).toBe(false);
                expect(readyFn()).toBe(false);
            },
        },
    });
    w.join(new WaitableSet(0));
    await expect(w.waitForPendingEvent({ cstate })).rejects.toThrow('already in a set');
});

test.concurrent('ready events remain synchronous and cancellation precedes their delivery', () => {
    const { waitable, core } = create();
    const set = new waitable.WaitableSet(0);
    const w = new waitable.Waitable({});
    const t = task();
    w.join(set);
    w.setPendingEvent(() => event);
    t.cancel();
    const opts = { readyFn: () => true, task: t.value, cancellable: true };
    expect(set.tryWait(opts)).toEqual({ code: core.asyncEventCode.TASK_CANCELLED, payload0: 0, payload1: 0 });
    expect(w.hasPendingEvent()).toBe(true);
    expect(set.waitUntil({ ...opts, cancellable: false })).toBe(event);
    expect(t.suspended).toBeUndefined();
    expect(set.numWaiting()).toBe(0);
});

test.concurrent.each(['event', 'cancel', 'trap', 'reject'] as const)(
    'suspended wait completes and releases its count on %s',
    async (outcome) => {
        const { waitable, core } = create();
        const set = new waitable.WaitableSet(0);
        const w = new waitable.Waitable({});
        const t = task();
        w.join(set);
        const result = set.waitUntil({ readyFn: () => true, task: t.value, cancellable: true });
        expect(set.numWaiting()).toBe(1);
        expect(t.suspended?.readyFn()).toBe(false);
        const error = new Error(outcome);
        if (outcome === 'trap' || outcome === 'reject') {
            const failed = expect(result).rejects.toBe(error);
            if (outcome === 'trap') {
                t.trap(error);
                t.pending.resolve(false);
            } else {
                t.pending.reject(error);
            }
            await failed;
        } else {
            if (outcome === 'event') {
                w.setPendingEvent(() => event);
                expect(t.suspended?.readyFn()).toBe(true);
            }
            t.pending.resolve(outcome === 'event');
            expect(await result).toEqual(
                outcome === 'event' ? event : { code: core.asyncEventCode.TASK_CANCELLED, payload0: 0, payload1: 0 },
            );
        }
        expect(set.numWaiting()).toBe(0);
    },
);

test.concurrent.each([false, true])('callback waits resume synchronously (cancel=%s)', (cancel) => {
    const { waitable, core } = create();
    const set = new waitable.WaitableSet(0);
    const w = new waitable.Waitable({});
    const t = task();
    w.join(set);
    const received: (WaitableEvent | null)[] = [];
    const onEvent = (e: WaitableEvent | null) => {
        expect(set.numWaiting()).toBe(0);
        received.push(e);
    };
    const opts = { readyFn: () => true, task: t.value, cancellable: true };
    set.waitUntilCallback(opts, onEvent);
    expect(set.numWaiting()).toBe(1);
    if (!cancel) {
        w.setPendingEvent(() => event);
    }
    t.resume(!cancel);
    expect(received).toEqual([cancel ? { code: core.asyncEventCode.TASK_CANCELLED, payload0: 0, payload1: 0 } : event]);
    w.setPendingEvent(() => event);
    set.waitUntilCallback(opts, onEvent);
    expect(received[1]).toBe(event);
});

test.concurrent('component factory, handle tables, and waitable operations share a store', () => {
    const t = task();
    const { waitable, component, resource } = create({
        waitableContext: { getCurrentTask: () => ({ componentIdx: 0, task: t.value }) },
    });
    const state = component.getOrCreateAsyncState(0);
    const w = state.createWaitable({ target: 'subtask' });
    expect(w).toBeInstanceOf(waitable.Waitable);
    expect(w).not.toBeInstanceOf(create().waitable.Waitable);
    const reserved = resource.getHandleIndexSpace(0).alloc();
    const setRep = waitable.waitableSetNew(0);
    const wRep = state.handles.insert({ getWaitable: () => w });
    expect(new Set([reserved, setRep, wRep]).size).toBe(3);
    const set = state.handles.get(setRep) as WaitableSet;
    expect(set).toBeInstanceOf(waitable.WaitableSet);
    waitable.waitableJoin(0, wRep, setRep);
    expect(set.targets()).toEqual(['subtask']);
    expect(() => waitable.waitableSetDrop(0, setRep)).toThrow('still contains waitables');
    w.setPendingEvent(() => event);
    expect(() => waitable.removeWaitableSet({ state, waitableSetRep: setRep })).toThrow('pending items');
    w.getPendingEvent();
    waitable.waitableJoin(0, wRep, 0);
    set.incrementNumWaiting();
    expect(() => waitable.waitableSetDrop(0, setRep)).toThrow('with waiters');
    set.decrementNumWaiting();
    state.mayLeave = false;
    expect(() => waitable.waitableSetDrop(0, setRep)).toThrow('may leave');
    expect(() => waitable.waitableJoin(0, wRep, setRep)).toThrow('may leave');
    state.mayLeave = true;
    waitable.waitableSetDrop(0, setRep);
    expect(state.handles.get(setRep)).toBeUndefined();
    expect(waitable.waitableSetNew(0)).toBe(setRep);
});

test.concurrent('wait/poll use lazy task and memory bridges and preserve synchronous paths', async () => {
    const t = task();
    const memory = { buffer: new ArrayBuffer(32) };
    let reads = 0;
    let writes = 0;
    const { waitable, component, core } = create({
        waitableContext: {
            getCurrentTask: () => {
                reads++;
                return { componentIdx: 0, task: t.value };
            },
            storeEventInComponentMemory(args) {
                expect(args.task).toBe(t.value);
                expect(args.memory).toBe(memory);
                expect(args.memoryIdx).toBe(2);
                expect(args.componentIdx).toBe(0);
                const view = new DataView(args.memory.buffer);
                view.setUint32(args.ptr, args.event!.payload0, true);
                view.setUint32(args.ptr + 4, args.event!.payload1, true);
                writes++;
                return args.event!.code;
            },
        },
    });
    expect(reads + writes).toBe(0);
    const ctx = { componentIdx: 0, isAsync: true, memoryIdx: 2, getMemoryFn: () => memory };
    const rep = waitable.waitableSetNew(0);
    const w = new waitable.Waitable({});
    w.join(component.getOrCreateAsyncState(0).handles.get(rep) as WaitableSet);
    expect(waitable.waitableSetPoll(ctx, rep, 8)).toBe(core.asyncEventCode.NONE);
    expect(waitable.waitableSetWait(ctx, rep, 8, true)).toBe(-1);
    expect(writes).toBe(1);
    t.cancel(); // Built-in waits must not deliver cancellation.
    w.setPendingEvent(() => event);
    expect(waitable.waitableSetWait(ctx, rep, 8)).toBe(event.code);
    const pending = waitable.waitableSetWait(ctx, rep, 8);
    expect(t.suspended?.cancellable).toBe(false);
    w.setPendingEvent(() => event);
    t.pending.resolve(true);
    expect(await pending).toBe(event.code);
    const view = new DataView(memory.buffer);
    expect([view.getUint32(8, true), view.getUint32(12, true)]).toEqual([17, 23]);
    w.setPendingEvent(() => event);
    expect(waitable.waitableSetPoll(ctx, rep, 8)).toBe(event.code);
    expect(w.hasPendingEvent()).toBe(false);
});

test.concurrent('invalid handles trap in the selected realm and mismatched task metadata is diagnosed', () => {
    class RuntimeError extends Error {}
    const t = task();
    let componentIdx = 0;
    const { waitable, component } = create({
        platform: { WebAssembly: { RuntimeError } },
        waitableContext: { getCurrentTask: () => ({ componentIdx, task: t.value }) },
    });
    const ctx = { componentIdx: 0, isAsync: false, getMemoryFn: () => ({ buffer: new ArrayBuffer(8) }) };
    const state = component.getOrCreateAsyncState(0);
    const w = state.handles.insert(state.createWaitable());
    for (const rep of [0, w, 999]) {
        expect(() => waitable.waitableSetPoll(ctx, rep, 0)).toThrow(RuntimeError);
        expect(() => waitable.waitableSetWait(ctx, rep, 0)).toThrow(RuntimeError);
    }
    expect(() => waitable.waitableJoin(0, w, 999)).toThrow(RuntimeError);
    expect(() => waitable.removeWaitableSet({ state, waitableSetRep: 999 })).toThrow(RuntimeError);
    componentIdx = 3;
    expect(() => waitable.waitableSetPoll(ctx, w, 0)).toThrow('task component idx [3] != component instance ID [0]');
    expect(() => waitable.waitableSetDrop(0, w)).toThrow('task component idx [3]');
    expect(() => create().waitable.waitableSetDrop(0, w)).toThrow('waitableContext.getCurrentTask');
});

test.concurrent('selected event codes stay live and cancellation does not consume a ready event', () => {
    const { waitable, core } = create();
    const set = new waitable.WaitableSet(0);
    const w = new waitable.Waitable({});
    w.join(set);
    w.setPendingEvent(() => event);
    const t = task();
    t.cancel();
    // Deliberately exercise a JavaScript mutation outside the canonical literal type.
    expect(Reflect.set(core.asyncEventCode, 'TASK_CANCELLED', 77)).toBe(true);
    expect(set.tryWait({ readyFn: () => true, task: t.value, cancellable: true })).toEqual({
        code: 77,
        payload0: 0,
        payload1: 0,
    });
    expect(w.hasPendingEvent()).toBe(true);
    expect(set.tryWait({ readyFn: () => true, task: t.value, cancellable: false })).toBe(event);
});

test.concurrent.each([undefined, { componentIdx: 0 }])(
    'missing task metadata is checked before memory access (%s)',
    (meta) => {
        const { waitable } = create({ waitableContext: { getCurrentTask: () => meta } });
        const memory = {
            componentIdx: 0,
            isAsync: false,
            getMemoryFn: () => {
                throw new Error('memory read too early');
            },
        };
        expect(() => waitable.waitableSetWait(memory, 1, 0)).toThrow('invalid/missing async task');
        expect(() => waitable.waitableSetPoll(memory, 1, 0)).toThrow('invalid/missing');
    },
);

test.concurrent('suspended waits write through the live memory buffer after growth', async () => {
    const t = task();
    const memory = new WebAssembly.Memory({ initial: 1 });
    const oldBuffer = memory.buffer;
    const { waitable, component } = create({
        waitableContext: {
            getCurrentTask: () => ({ componentIdx: 0, task: t.value }),
            storeEventInComponentMemory({ memory: selected, event, ptr }) {
                expect(selected).toBe(memory);
                expect(selected.buffer).not.toBe(oldBuffer);
                const view = new DataView(selected.buffer);
                view.setUint32(ptr, event!.payload0, true);
                view.setUint32(ptr + 4, event!.payload1, true);
                return event!.code;
            },
        },
    });
    const rep = waitable.waitableSetNew(0);
    const set = component.getOrCreateAsyncState(0).handles.get(rep) as WaitableSet;
    const w = new waitable.Waitable({});
    w.join(set);
    const pending = waitable.waitableSetWait({ componentIdx: 0, isAsync: true, getMemoryFn: () => memory }, rep, 65536);
    memory.grow(1);
    w.setPendingEvent(() => event);
    t.pending.resolve(true);
    expect(await pending).toBe(event.code);
    expect(new DataView(memory.buffer).getUint32(65536, true)).toBe(event.payload0);
    expect(set.numWaiting()).toBe(0);
});

test.concurrent('join and removal reject foreign constructors and duck-typed handles', () => {
    class RuntimeError extends Error {}
    const { waitable, component } = create({ platform: { WebAssembly: { RuntimeError } } });
    const foreign = create().waitable;
    const state = component.getOrCreateAsyncState(0);
    const setRep = waitable.waitableSetNew(0);
    const wRep = state.handles.insert(new waitable.Waitable({}));
    const wrongHandles = [
        new foreign.Waitable({}),
        new foreign.WaitableSet(0),
        { join() {}, hasPendingEvent: () => false, numWaitables: () => 0, numWaiting: () => 0 },
    ];
    for (const value of wrongHandles) {
        const rep = state.handles.insert(value);
        expect(() => waitable.waitableJoin(0, rep, setRep)).toThrow(RuntimeError);
        expect(() => waitable.waitableJoin(0, wRep, rep)).toThrow(RuntimeError);
        expect(() => waitable.removeWaitableSet({ state, waitableSetRep: rep })).toThrow(RuntimeError);
        expect(state.handles.get(rep)).toBe(value);
    }
    waitable.waitableJoin(0, wRep, setRep);
    expect(() => waitable.removeWaitableSet({ state, waitableSetRep: setRep })).toThrow(RuntimeError);
    waitable.waitableJoin(0, wRep, 0);
    const set = state.handles.get(setRep) as WaitableSet;
    set.incrementNumWaiting();
    expect(() => waitable.removeWaitableSet({ state, waitableSetRep: setRep })).toThrow(RuntimeError);
    set.decrementNumWaiting();
    waitable.removeWaitableSet({ state, waitableSetRep: setRep });
});
