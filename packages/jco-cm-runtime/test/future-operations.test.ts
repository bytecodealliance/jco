import { expect, test } from 'vitest';
import * as future from '../src/intrinsics/future.js';
import { create } from './future-helpers.js';
import type { FutureElementMetadata, FutureTask, AsyncTaskMeta, TaskLookupContext } from '../src/runtime.js';

const scalar: FutureElementMetadata = {
    align32: 4,
    size32: 4,
    isNumeric: true,
    liftFn: (ctx) => [new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true), ctx],
    lowerFn: (ctx) => new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals![0] as number, true),
};
function taskLookup(): TaskLookupContext<FutureTask> {
    const task: FutureTask = {
        id: () => 1n,
        mayBlock: () => false,
        isErrored: () => null,
        suspendUntil: async (options) => options.readyFn(),
    };
    const meta: AsyncTaskMeta<FutureTask> = { id: 1n, componentIdx: 0, task };
    return { tasks: new Map([[0, [meta]]]), registers: { 0: { componentIdx: 0, taskID: 1n, threadID: 1 } } };
}

test.concurrent('future creation and lookups retain actual table/handle owners and validate table zero', () => {
    const s = create(),
        state = s.addTable(0, 2);
    s.addTable(0, 0);
    const pair = future.createFuture(s.creation, state, { tableIdx: 2, elemMeta: scalar });
    expect(future.getFutureEnd(s.ends, { tableIdx: 2, futureEndWaitableIdx: pair.readEndWaitableIdx! })).toBe(
        pair.readEnd,
    );
    expect(future.getFutureEnd(s.ends, { tableIdx: 2, futureEndHandle: pair.writeEndHandle! })).toBe(pair.writeEnd);
    expect(s.tables[2].table.get(pair.readEndHandle!)).toBe(pair.readEnd);
    expect(() => future.getFutureEnd(s.ends, { tableIdx: 0, futureEndWaitableIdx: pair.readEndWaitableIdx! })).toThrow(
        /does not match/,
    );
    expect(() =>
        future.removeFutureEndFromTable(s.tableContext, { tableIdx: 0, futureWaitableIdx: pair.readEndWaitableIdx! }),
    ).toThrow(s.core.RuntimeError);
    expect(state.handles.get(pair.readEndWaitableIdx!)).toBe(pair.readEnd);
    const moved = future.futureTransfer(s.ends, pair.readEndWaitableIdx!, 2, (s.addTable(1, 3), 3));
    expect(future.getFutureEnd(s.ends, { tableIdx: 3, futureEndWaitableIdx: moved })).toBe(pair.readEnd);
    expect(state.handles.get(pair.readEndWaitableIdx!)).toBeUndefined();
    expect(pair.readEnd.futureTableIdx()).toBe(3);
    const removed = future.removeFutureEndFromTable(s.tableContext, { tableIdx: 3, futureWaitableIdx: moved });
    expect(removed).toBe(pair.readEnd);
    expect(s.tables[3].table.size()).toBe(0);
    removed.drop();
    pair.writeEnd.getPendingEvent();
    future.futureDropWritable(
        { RuntimeError: s.core.RuntimeError, tables: s.tableContext, FutureEnd: s.FutureWritableEnd },
        { componentIdx: 0, futureTableIdx: 2 },
        pair.writeEndWaitableIdx!,
    );
    expect(s.tables[2].table.size()).toBe(0);
});

test.concurrent('canonical future new packs handles and async read/write use the actual memory buffers', () => {
    const s = create();
    s.addTable(0, 2);
    const tasks = taskLookup();
    const packed = future.futureNew(
        { taskLookup: tasks, lookup: s.lookup, creation: s.creation },
        { componentIdx: 0, futureTableIdx: 2, elemMeta: scalar },
    );
    const readIdx = Number(packed & 0xffffffffn),
        writeIdx = Number(packed >> 32n),
        memory = { buffer: new ArrayBuffer(16) };
    new DataView(memory.buffer).setUint32(0, 42, true);
    const common = {
        RuntimeError: s.core.RuntimeError,
        lookup: s.lookup,
        taskLookup: tasks,
        ends: s.ends,
        events: s.core.asyncEventCode,
        Base: s.FutureEnd,
    };
    const options = {
        componentIdx: 0,
        futureTableIdx: 2,
        isAsync: true,
        stringEncoding: 'utf8',
        getMemoryFn: () => memory,
    };
    expect(future.futureRead({ ...common, FutureEnd: s.FutureReadableEnd }, options, readIdx, 4)).toBe(0xffffffff);
    expect(future.futureWrite({ ...common, FutureEnd: s.FutureWritableEnd }, options, writeIdx, 0)).toBe(
        s.FutureEnd.CopyResult.COMPLETED,
    );
    const read = future.getFutureEnd(s.ends, { tableIdx: 2, futureEndWaitableIdx: readIdx });
    expect(read.getPendingEvent()).toEqual({
        code: s.core.asyncEventCode.FUTURE_READ,
        payload0: readIdx,
        payload1: s.FutureEnd.CopyResult.COMPLETED,
    });
    expect(new DataView(memory.buffer).getUint32(4, true)).toBe(42);
    expect(() => future.futureRead({ ...common, FutureEnd: s.FutureReadableEnd }, options, readIdx, 4)).toThrow(
        /previous read succeeded/,
    );
    future.futureDropReadable(
        { RuntimeError: s.core.RuntimeError, tables: s.tableContext, FutureEnd: s.FutureReadableEnd },
        options,
        readIdx,
    );
    future.futureDropWritable(
        { RuntimeError: s.core.RuntimeError, tables: s.tableContext, FutureEnd: s.FutureWritableEnd },
        options,
        writeIdx,
    );
    expect(s.tables[2].table.size()).toBe(0);
});

test.concurrent('async future cancellation consumes its event and leaves the selected endpoint idle', () => {
    const s = create(),
        state = s.addTable(0, 2),
        pair = future.createFuture(s.creation, state, { tableIdx: 2, elemMeta: scalar });
    pair.readEnd.guestRead({ componentIdx: -1, data: [] });
    pair.readEnd.setCopyState(s.FutureEnd.CopyState.ASYNC_COPYING);
    const context = {
        RuntimeError: s.core.RuntimeError,
        lookup: s.lookup,
        taskLookup: taskLookup(),
        ends: s.ends,
        events: s.core.asyncEventCode,
        Base: s.FutureEnd,
        FutureEnd: s.FutureReadableEnd,
    };
    expect(
        future.futureCancelRead(
            context,
            { componentIdx: 0, futureTableIdx: 2, isAsync: true },
            pair.readEndWaitableIdx!,
        ),
    ).toBe(s.FutureEnd.CopyResult.CANCELLED);
    expect(pair.readEnd.isIdleState()).toBe(true);
    expect(pair.readEnd.hasPendingEvent()).toBe(false);
    expect(pair.readEnd.getPendingBufferMeta().buffer).toBeNull();
    pair.readEnd.drop();
    pair.writeEnd.getPendingEvent();
    pair.writeEnd.drop();
});

test.concurrent('host injection delivers a promise once and balances host operation tracking', async () => {
    const s = create(),
        state = s.addTable(0, 2),
        pair = future.createFuture(s.creation, state, { tableIdx: 2, elemMeta: scalar });
    const inject = future.genFutureHostInjectFn(s.injection, {
        promise: Promise.resolve(23),
        hostWriteEnd: pair.writeEnd,
        stringEncoding: 'utf8',
    });
    pair.readEnd.setHostInjectFn(inject);
    expect(await pair.readEnd.promise()).toBe(23);
    await Promise.resolve();
    expect(s.component.storeAsyncState.pendingHostOperations).toBe(0);
    expect(pair.writeEnd.isDropped()).toBe(true);
    pair.readEnd.drop();
});

test.concurrent('future predicate accepts native promises and awaitables and rejects null without a store', () => {
    const Value = future.initializeFutureValueClass();
    expect(future.isFutureLowerableObject(null)).toBe(false);
    expect(future.isFutureLowerableObject(0)).toBe(false);
    expect(future.isFutureLowerableObject(Promise.resolve(0))).toBe(true);
    expect(future.isFutureLowerableObject(new Value(() => ({ value: 42 })))).toBe(true);
});

test.concurrent('future handles reject wrong kinds and foreign constructors with the selected trap', () => {
    const selected = create(),
        other = create();
    const state = selected.addTable(0, 0);
    other.addTable(0, 0);
    const pair = future.createFuture(other.creation, other.component.getOrCreateAsyncState(0), {
        tableIdx: 0,
        elemMeta: scalar,
    });
    class SelectedTrap extends Error {}
    const context = { ...selected.tableContext, RuntimeError: SelectedTrap };
    for (const invalid of [{ futureTableIdx: () => 0 }, pair.readEnd]) {
        const index = state.handles.insert(invalid);
        expect(() => future.getFutureEnd(context, { tableIdx: 0, futureEndWaitableIdx: index })).toThrow(SelectedTrap);
        expect(() => future.removeFutureEndFromTable(context, { tableIdx: 0, futureWaitableIdx: index })).toThrow(
            SelectedTrap,
        );
        expect(state.handles.get(index)).toBe(invalid);
    }
    pair.readEnd.drop();
    pair.writeEnd.getPendingEvent();
    pair.writeEnd.drop();
});
