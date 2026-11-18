/**
 * Exercise synchronous stream batches while guest tasks wait or the store shuts down.
 * Controlled host timers verify that yields remain visible to deadlock detection.
 */

import { expect, test, vi } from 'vitest';

import { asyncBlockedCode } from '../src/intrinsics/async-task.js';
import { genStreamHostInjectFn } from '../src/intrinsics/stream/injection.js';
import { streamRead } from '../src/intrinsics/stream/operations.js';
import { clearDeadlockCheck, stopStore, task } from './component-helpers.js';
import { create, createPair, dropPair, guestOptions } from './stream-helpers.js';

// Run the actual deadlock timer between batches of a guest's pending read.
test.sequential('a guest awaiting a large synchronous host stream does not deadlock', async () => {
    vi.stubGlobal('MessageChannel', undefined);
    vi.useFakeTimers();
    const selected = createPair();
    const state = selected.component.getOrCreateAsyncState(0);
    const count = 65536;
    let calls = 0;
    const readFn = Object.assign(() => ({ value: ++calls, done: false }), { sourceIsSync: true });
    selected.read.setHostInjectFn(
        genStreamHostInjectFn(selected.lower.injection, {
            readFn,
            hostWriteEnd: selected.write,
            readEnd: selected.read,
        }),
    );

    // Suspend a guest task on the canonical stream operation's completion event.
    const memory = { buffer: new ArrayBuffer(count * 4) };
    try {
        expect(streamRead(selected.operations().readable, guestOptions(memory), selected.readIdx, 0, count)).toBe(
            asyncBlockedCode,
        );
        const root = task(1n);
        const resumed = state.suspendTask({
            task: root.value,
            readyFn: () => selected.read.hasPendingEvent(),
            cancellable: false,
        });

        // Let the detector run before injection has produced the complete read.
        await vi.advanceTimersByTimeAsync(1);
        expect(calls).toBeLessThan(count);
        expect(selected.component.storeTrap.error).toBeNull();
        await vi.runAllTimersAsync();
        await expect(resumed).resolves.toBe(true);

        // Every value arrives in order and all host work is retired.
        expect(calls).toBe(count);
        expect(Array.from(new Uint32Array(memory.buffer))).toEqual(
            Array.from({ length: count }, (_, index) => index + 1),
        );
        expect(selected.component.storeTrap.error).toBeNull();
        expect(selected.component.storeAsyncState.pendingHostOperations).toBe(0);
        selected.read.getPendingEvent();
    } finally {
        clearDeadlockCheck(selected.component);
        dropPair(selected.pair);
        vi.useRealTimers();
        vi.unstubAllGlobals();
    }
});

// Shutdown must settle a deferred read without calling the host source again.
test.sequential('stopping a store during a stream batch yield releases the pending operation', async () => {
    vi.stubGlobal('MessageChannel', undefined);
    vi.useFakeTimers();
    const selected = create();
    let calls = 0;
    const queue = new selected.PendingValueQueue(() => ({ value: ++calls, done: false }), { align32: 1 });

    try {
        // Consume one synchronous batch, then share its deferred continuation.
        for (let index = 0; index < 64; index++) {
            expect(queue.readSourceOrPromise!()).toBe(1);
        }
        const pending = queue.readSourceOrPromise!();
        expect(pending).toBeInstanceOf(Promise);
        expect(queue.readSourceOrPromise!()).toBe(pending);
        expect(selected.component.storeAsyncState.pendingHostOperations).toBe(1);

        // Stop before the scheduled read runs, then drain its host callback.
        stopStore(selected.component, new WebAssembly.RuntimeError('stopped'));
        await expect(pending).resolves.toBe(0);
        await vi.runAllTimersAsync();
        expect(calls).toBe(64);
        expect(queue.done).toBe(true);
        expect(selected.component.storeAsyncState.pendingHostOperations).toBe(0);
        expect(selected.component.storeTrap.stopWaiters.size).toBe(0);
    } finally {
        clearDeadlockCheck(selected.component);
        vi.useRealTimers();
        vi.unstubAllGlobals();
    }
});
