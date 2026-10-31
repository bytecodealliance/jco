import { expect, test } from 'vitest';
import { initializeFutureEndClass } from '../src/intrinsics/future-end.js';
import { initializeWaitableClass } from '../src/intrinsics/waitable.js';
import { initializeAsyncEventCodes } from '../src/intrinsics/core.js';
import { createTestIntrinsics } from './core-test-helpers.js';
import type { FuturePendingBufferMeta } from '../src/runtime.js';

function setup(readable = true) {
    const events = initializeAsyncEventCodes();
    const Base = initializeFutureEndClass(events);
    const Waitable = initializeWaitableClass();
    const waitable = new Waitable({ componentIdx: 3 });
    waitable.setIdx(17);
    const meta: FuturePendingBufferMeta = { componentIdx: null, buffer: null, isWrite: null, onCopyDoneFn: null };
    class End extends Base {
        isReadable() {
            return readable;
        }
        waitableIdx() {
            return waitable.idx();
        }
    }
    return { events, Base, End, waitable, meta };
}

test.concurrent('future ends retain shared pending metadata and selected waitable identities', () => {
    const { End, waitable, meta } = setup();
    const first = new End({ pendingBufferMeta: meta, waitable });
    const second = new End({ pendingBufferMeta: meta, waitable });
    expect(first.getPendingBufferMeta()).toBe(meta);
    expect(second.getPendingBufferMeta()).toBe(meta);
    expect(first.getWaitable()).toBe(waitable);
    const {
        core: { ManagedBuffer },
    } = createTestIntrinsics();
    const buffer = new ManagedBuffer({
        componentIdx: -1,
        capacity: 1,
        data: [],
        elemMeta: { align32: 1, isNone: true },
    });
    let result: number | undefined;
    first.setPendingBufferMeta({
        componentIdx: 4,
        buffer,
        isWrite: true,
        onCopyDoneFn: (value) => {
            expect(meta.buffer).toBeNull();
            result = value;
        },
    });
    expect(second.getPendingBufferMeta().buffer).toBe(buffer);
    second.resetAndNotifyPending(23);
    expect(result).toBe(23);
    expect(meta).toEqual({ componentIdx: null, buffer: null, isWrite: null, onCopyDoneFn: null });
});

test.concurrent.each([true, false])(
    'future drop notification preserves the %s endpoint event until consumption',
    (readable) => {
        const { End, Base, events, waitable, meta } = setup(readable);
        const end = new End({ pendingBufferMeta: meta, waitable });
        end.notifyDropped();
        expect(end.hasPendingEvent()).toBe(true);
        expect(end.isDoneState()).toBe(false);
        end.notifyDropped();
        expect(end.getPendingEvent()).toEqual({
            code: readable ? events.FUTURE_READ : events.FUTURE_WRITE,
            payload0: 17,
            payload1: Base.CopyResult.DROPPED,
        });
        expect(end.isDoneState()).toBe(true);
        expect(end.hasPendingEvent()).toBe(false);
    },
);

test.concurrent('future drop completes a pending write, notifies the peer and rejects duplicate drop', () => {
    const { End, Base, waitable, meta } = setup(false);
    const {
        core: { ManagedBuffer },
    } = createTestIntrinsics();
    const buffer = new ManagedBuffer({
        componentIdx: -1,
        capacity: 1,
        data: [],
        elemMeta: { align32: 1, isNone: true },
    });
    let result: number | undefined,
        dropped = false;
    const end = new End({
        pendingBufferMeta: meta,
        waitable,
        notifyPeerDroppedFn: () => {
            dropped = true;
        },
    });
    end.setPendingBufferMeta({
        componentIdx: 4,
        buffer,
        isWrite: true,
        onCopyDoneFn: (value) => {
            result = value;
        },
    });
    end.drop();
    expect(result).toBe(Base.CopyResult.DROPPED);
    expect(dropped).toBe(true);
    expect(end.isDropped()).toBe(true);
    expect(meta.buffer).toBeNull();
    expect(() => end.drop()).toThrow('future already dropped');
});

test.concurrent('future drop rejects an outstanding reader and retains its pending buffer', () => {
    const { End, waitable, meta } = setup();
    const {
        core: { ManagedBuffer },
    } = createTestIntrinsics();
    const buffer = new ManagedBuffer({
        componentIdx: -1,
        capacity: 1,
        data: [],
        elemMeta: { align32: 1, isNone: true },
    });
    const end = new End({ pendingBufferMeta: meta, waitable });
    end.setPendingBufferMeta({ componentIdx: 4, buffer, isWrite: false, onCopyDoneFn: () => {} });
    expect(() => end.drop()).toThrow(/non-writable pending buffer/);
    expect(end.isDropped()).toBe(false);
    expect(meta.buffer).toBe(buffer);
});

test.concurrent('future state and private brands are isolated between selected classes', () => {
    const a = setup(),
        b = setup();
    expect(a.Base).not.toBe(b.Base);
    expect(a.Base.CopyResult).not.toBe(b.Base.CopyResult);
    expect(a.Base.CopyState).not.toBe(b.Base.CopyState);
    const first = new a.End({ pendingBufferMeta: a.meta, waitable: a.waitable });
    const second = new b.End({ pendingBufferMeta: b.meta, waitable: b.waitable });
    expect(first.isIdleState()).toBe(true);
    first.setCopyState(a.Base.CopyState.ASYNC_COPYING);
    expect(first.isCopying()).toBe(true);
    expect(second.isIdleState()).toBe(true);
    first.setCopyState(a.Base.CopyState.DONE);
    expect(first.isDoneState()).toBe(true);
    expect(first.isCopying()).toBe(false);
    expect(() => a.Base.prototype.isDropped.call(second)).toThrow(TypeError);
});
