import { expect, test, vi } from 'vitest';

import * as operations from '../src/intrinsics/component.js';
import { tableFlag, tableOwn } from '../src/intrinsics/resource.js';
import type { ComponentStopContext, ResourceTable } from '../src/runtime.js';

const table = (cells: number[]) => cells as unknown as ResourceTable;

const RuntimeError = WebAssembly.RuntimeError;

function idleContext(tasks = new Map<number, unknown[]>()) {
    return {
        storeTrap: operations.initializeStoreTrap(),
        storeAsyncState: operations.initializeStoreAsyncState(),
        tasks,
    };
}

function stopContext(overrides: Partial<ComponentStopContext> = {}): ComponentStopContext {
    return {
        RuntimeError,
        storeTrap: operations.initializeStoreTrap(),
        storeAsyncState: operations.initializeStoreAsyncState(),
        asyncState: new Map(),
        tasks: new Map(),
        symbolDispose: Symbol.dispose,
        RepTable: { FREE: Symbol('free') },
        channels: [],
        ...overrides,
    };
}

test.concurrent('traps are normalized and reported to the embedder once', () => {
    const onTrap = vi.fn();
    const storeTrap = operations.initializeStoreTrap(onTrap);
    const messages = operations.initializeCoreTrapMessages({ unreachable: 'wasm trap: unreachable' });
    const context = { RuntimeError, storeTrap, normalization: { RuntimeError, messages } };
    const trap = new RuntimeError('unreachable');
    operations.reportTrap(context, trap);
    operations.reportTrap(context, trap);
    operations.reportTrap(context, new Error('not a trap'));
    expect(onTrap).toHaveBeenCalledTimes(1);
    expect(onTrap.mock.calls[0][0]).toBe(trap);
    expect(trap.message).toBe('wasm trap: unreachable');
    storeTrap.stopped = true;
    operations.reportTrap(context, new RuntimeError('unreachable'));
    expect(onTrap).toHaveBeenCalledTimes(1);
});

test.concurrent('idle waiters settle once no guest task is live', async () => {
    const tasks = new Map<number, unknown[]>([
        [-1, [{}]],
        [0, [{}]],
    ]);
    const checkCalls = vi.fn();
    const context = { ...idleContext(tasks), checkCalls };
    let settled = false;
    const idle = operations.whenIdle(context).then(() => {
        settled = true;
    });
    operations.checkIdle(context);
    await Promise.resolve();
    expect(settled).toBe(false);
    // Host tasks, under -1, do not keep the instance busy.
    tasks.set(0, []);
    operations.checkIdle(context);
    await idle;
    expect(context.storeAsyncState.idleWaiters.size).toBe(0);
    expect(checkCalls).toHaveBeenCalledTimes(2);
    await operations.whenIdle(context);
});

test.concurrent('a trapped store is idle whatever tasks remain', async () => {
    const context = idleContext(new Map([[0, [{}]]]));
    context.storeTrap.error = new RuntimeError('trapped');
    await operations.whenIdle(context);
});

test.concurrent('stopping releases tasks, channels and guest-owned resources once', () => {
    const order: string[] = [];
    const owned = { [Symbol.dispose]: () => order.push('owned') };
    const dropped = { [Symbol.dispose]: () => order.push('dropped') };
    const borrowed = { [Symbol.dispose]: () => order.push('borrowed') };
    const free = Symbol('free');
    const context = stopContext({ RepTable: { FREE: free } });
    const { storeTrap } = context;
    storeTrap.disposed.add(dropped);
    const captures = new Map<number, object>([
        [1, owned],
        [2, dropped],
        [3, borrowed],
    ]);
    // Two owned handles share a rep; a free slot and a borrow are not the guest's.
    const handles = table([0, 0, 0, tableOwn + 1, 0, tableOwn + 1, 0, tableOwn + 2, tableFlag, 0, 0, 3]);
    storeTrap.resourceTables.push({ handles, captures });
    const reject = vi.fn();
    storeTrap.stopWaiters.add(reject);
    const state = { markTrapped: () => order.push('trapped'), stop: () => order.push('state') };
    const task = { stop: () => order.push('task') };
    const channel = { onInstanceStop: () => order.push('channel') };
    Object.assign(context, {
        asyncState: new Map([[0, state]]),
        tasks: new Map([[0, [{ task }]]]),
        channels: [{ data: () => [0, null, channel, 0, free, 0, undefined, 0] }],
    });
    operations.stopInstance(context);
    expect(order).toEqual(['trapped', 'task', 'state', 'channel', 'owned']);
    expect(storeTrap.stopped).toBe(true);
    expect(storeTrap.error).toBeInstanceOf(RuntimeError);
    expect((storeTrap.error as Error).message).toBe('component instance has been stopped');
    expect(reject).toHaveBeenCalledWith(storeTrap.error);
    expect(storeTrap.stopWaiters.size).toBe(0);
    expect(storeTrap.resourceTables).toHaveLength(0);
    expect(captures.size).toBe(0);
    operations.stopInstance(context);
    expect(order).toHaveLength(5);
});

test.concurrent('stopping keeps an earlier trap and gathers cleanup failures', () => {
    const context = stopContext();
    const trap = new RuntimeError('earlier');
    context.storeTrap.error = trap;
    const failure = new Error('dispose');
    const resource = {
        [Symbol.dispose]: () => {
            throw failure;
        },
    };
    context.storeTrap.resourceTables.push({
        handles: table([0, 0, 0, tableOwn + 1]),
        captures: new Map([[1, resource]]),
    });
    const channelFailure = new Error('channel');
    Object.assign(context, {
        channels: [
            {
                data: () => [
                    0,
                    null,
                    {
                        onInstanceStop: () => {
                            throw channelFailure;
                        },
                    },
                    0,
                ],
            },
        ],
    });
    let thrown: AggregateError | undefined;
    try {
        operations.stopInstance(context);
    } catch (error) {
        thrown = error as AggregateError;
    }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect(thrown!.errors).toEqual([channelFailure, failure]);
    expect(context.storeTrap.error).toBe(trap);
});

function tracking(tasks = new Map<number, { task: { getRootTask: () => unknown; isErrored: () => unknown } }[]>()) {
    const storeTrap = operations.initializeStoreTrap();
    return { storeTrap, tasks, calls: operations.initializeCallTracking({ RuntimeError, storeTrap, tasks }) };
}

test.concurrent('call tracking reports a synchronous export as completed', async () => {
    const { calls } = tracking();
    const receiver = { base: 40 };
    function add(this: { base: number }, value: number) {
        expect(calls.capture(7)).not.toBeNull();
        // A nested or repeated claim is not this invocation.
        expect(calls.capture(7)).toBeNull();
        return this.base + value;
    }
    calls.register(add, 7, false, false, false);
    const handle = calls.publicAPI.startWithThis(receiver, add, 2);
    expect(handle.result).toBe(42);
    expect(Object.isFrozen(handle)).toBe(true);
    await expect(handle.finished).resolves.toEqual({ status: 'completed' });
    expect(() => calls.publicAPI.start(() => {})).toThrow('call tracking requires an export from this instance');
});

test.concurrent('call tracking follows the attached root task until it retires, traps or stops', async () => {
    const { calls, tasks, storeTrap } = tracking();
    const makeTask = () => {
        const task = { getRootTask: () => task, isErrored: (): unknown => null };
        return task;
    };
    const start = (id: number, task: ReturnType<typeof makeTask>) => {
        const fn = () => {
            calls.attach(calls.capture(id), task);
            return Promise.resolve();
        };
        calls.register(fn, id, false, true, false);
        return calls.publicAPI.start(fn).finished;
    };
    const retiring = makeTask();
    const trapping = makeTask();
    const stopping = makeTask();
    tasks.set(0, [{ task: retiring }, { task: trapping }, { task: stopping }]);
    const outcomes = [start(1, retiring), start(2, trapping), start(3, stopping)];
    let settled = 0;
    for (const outcome of outcomes) {
        void outcome.then(() => settled++);
    }
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(0);

    tasks.set(0, [{ task: trapping }, { task: stopping }]);
    calls.check();
    await expect(outcomes[0]).resolves.toEqual({ status: 'completed' });

    const trap = new RuntimeError('task trap');
    trapping.isErrored = () => trap;
    calls.check();
    await expect(outcomes[1]).resolves.toEqual({ status: 'trapped', error: trap });

    storeTrap.error = new RuntimeError('stopped');
    storeTrap.stopped = true;
    calls.check();
    await expect(outcomes[2]).resolves.toEqual({ status: 'stopped' });
});

test.concurrent('a synchronous throw leaves no tracked call behind', () => {
    const { calls } = tracking();
    const failure = new Error('sync');
    const fn = () => {
        throw failure;
    };
    calls.register(fn, 1, false, false, false);
    expect(() => calls.publicAPI.start(fn)).toThrow(failure);
    expect(calls.capture(1)).toBeNull();
});
