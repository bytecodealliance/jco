import { expect, test, vi } from 'vitest';
import { create, clearDeadlockCheck, stopStore, task } from './component-helpers.js';

test.concurrent('stopped stores reject host operations before and after reentrant shutdown', () => {
    const { component } = create();
    const error = new WebAssembly.RuntimeError('stopped');
    const stop = () => {
        component.storeTrap.error = error;
        component.storeTrap.stopped = true;
        return 42;
    };
    expect(() => component.trackHostOperation(stop)).toThrow(error);
    const operation = vi.fn();
    expect(() => component.trackHostOperation(operation)).toThrow(error);
    expect(operation).not.toHaveBeenCalled();
});

test.concurrent('shutdown rejects a pending host operation and releases its waiter', async () => {
    const { component } = create();
    const host = Promise.withResolvers<number>();
    const pending = component.trackHostOperation(() => host.promise);
    expect(component.storeTrap.stopWaiters.size).toBe(1);
    expect(component.storeAsyncState.pendingHostOperations).toBe(1);
    const error = new WebAssembly.RuntimeError('stopped');
    stopStore(component, error);
    await expect(pending).rejects.toBe(error);
    expect(component.storeTrap.stopWaiters.size).toBe(0);
    expect(component.storeAsyncState.pendingHostOperations).toBe(0);
    host.resolve(42);
    await host.promise;
    expect(component.storeAsyncState.deadlockCheck).toBeNull();
});

test.concurrent('stopping component state releases suspended threads and rejects new entry', async () => {
    const { component } = create();
    const state = component.getOrCreateAsyncState(0);
    const first = task(1n);
    const pending = state.suspendThread({ thread: first.thread, readyFn: () => false, cancellable: false });
    const error = new WebAssembly.RuntimeError('stopped');
    component.storeTrap.error = error;
    component.storeTrap.stopped = true;
    state.markTrapped(error);
    state.stop();
    clearDeadlockCheck(component);
    await expect(pending).resolves.toBe(false);
    expect(state.isThreadSuspended(first.thread)).toBe(false);
    expect(() => state.throwIfInterrupted()).toThrow(error);
    expect(() => state.throwIfTrapped()).toThrow(error);
    const late = task(2n);
    await expect(state.suspendThread({ thread: late.thread, readyFn: () => false, cancellable: false })).resolves.toBe(
        false,
    );
    expect(state.isThreadSuspended(late.thread)).toBe(false);
    state.stop();
});
