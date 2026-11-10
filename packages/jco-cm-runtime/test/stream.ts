import { expect, test } from 'vitest';
import * as stream from '../src/intrinsics/stream.js';
import { lowerFlatStream } from '../src/intrinsics/lower.js';
import { create } from './stream-helpers.js';
import type { StreamElementMetadata, StreamReadResult } from '../src/runtime.js';
const scalar: StreamElementMetadata = {
    align32: 4,
    size32: 4,
    isNumeric: true,
    payloadTypeName: 'u32',
    stringEncoding: 'utf8',
    liftFn: (ctx) => {
        const value = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
        ctx.storagePtr += 4;
        return [value, ctx];
    },
    lowerFn: (ctx) => {
        new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals![0] as number, true);
        ctx.storagePtr += 4;
    },
};
function pair() {
    const s = create(),
        state = s.addTable(0, 2);
    return { ...s, pair: stream.createStream(s.creation, state, { tableIdx: 2, elemMeta: { ...scalar } }) };
}
async function eventReady(end: { hasPendingEvent(): boolean }) {
    for (let i = 0; i < 100; i++) {
        if (end.hasPendingEvent()) {
            return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    throw new Error('stream did not publish its completion event');
}
test.concurrent.each([false, true])('canonical nonzero stream payload rendezvous, reader first=%s', (readerFirst) => {
    const s = pair(),
        read = s.pair.readEnd,
        write = s.pair.writeEnd,
        memory = { buffer: new ArrayBuffer(64) };
    const data = new DataView(memory.buffer);
    for (let i = 0; i < 4; i++) {
        data.setUint32(i * 4, 101 + i, true);
    }
    const common = {
        RuntimeError: s.core.RuntimeError,
        lookup: s.lookup,
        ends: s.ends,
        mayBlock: { value: 1 },
        ManagedBuffer: s.core.ManagedBuffer,
        events: s.core.asyncEventCode,
    };
    const opts = {
        componentIdx: 0,
        streamTableIdx: 2,
        isAsync: true,
        stringEncoding: 'utf8',
        getMemoryFn: () => memory,
        elemMeta: scalar,
    };
    expect(read.getPendingBufferMeta()).toBe(write.getPendingBufferMeta());
    let first, second;
    if (readerFirst) {
        first = stream.streamRead(
            { ...common, StreamEnd: s.StreamReadableEnd },
            opts,
            s.pair.readEndWaitableIdx!,
            32,
            4,
        );
        second = stream.streamWrite(
            { ...common, StreamEnd: s.StreamWritableEnd },
            opts,
            s.pair.writeEndWaitableIdx!,
            0,
            4,
        );
    } else {
        first = stream.streamWrite(
            { ...common, StreamEnd: s.StreamWritableEnd },
            opts,
            s.pair.writeEndWaitableIdx!,
            0,
            4,
        );
        second = stream.streamRead(
            { ...common, StreamEnd: s.StreamReadableEnd },
            opts,
            s.pair.readEndWaitableIdx!,
            32,
            4,
        );
    }
    expect(first).toBe(0xffffffff);
    expect(second).toBe(64);
    expect(Array.from({ length: 4 }, (_, i) => data.getUint32(32 + i * 4, true))).toEqual([101, 102, 103, 104]);
    const pending = readerFirst ? read : write;
    expect(pending.getPendingEvent()!.payload1).toBe(64);
    expect(read.isIdleState()).toBe(true);
    expect(write.isIdleState()).toBe(true);
    expect(read.getPendingBufferMeta().buffer).toBeNull();
    read.drop();
    write.getPendingEvent();
    write.drop();
});
test.concurrent('store constructors retain inheritance, private brands, statics and actual owner identity', () => {
    const a = pair(),
        b = pair();
    expect(a.StreamEnd).not.toBe(b.StreamEnd);
    expect(a.StreamReadableEnd).not.toBe(b.StreamReadableEnd);
    expect(Object.getPrototypeOf(a.StreamReadableEnd)).toBe(a.StreamEnd);
    expect(a.StreamReadableEnd.CopyState).toBe(a.StreamEnd.CopyState);
    expect(a.pair.readEnd).toBeInstanceOf(a.StreamEnd);
    expect(a.pair.readEnd).not.toBeInstanceOf(b.StreamEnd);
    expect(() => a.StreamReadableEnd.prototype.streamTableIdx.call(b.pair.readEnd)).toThrow(TypeError);
    expect(stream.getStreamEnd(a.ends, { tableIdx: 2, streamEndWaitableIdx: a.pair.readEndWaitableIdx! })).toBe(
        a.pair.readEnd,
    );
    a.addTable(0, 0);
    expect(() =>
        stream.getStreamEnd(a.ends, { tableIdx: 0, streamEndWaitableIdx: a.pair.readEndWaitableIdx! }),
    ).toThrow(/does not match/);
    for (const s of [a, b]) {
        s.pair.readEnd.drop();
        s.pair.writeEnd.getPendingEvent();
        s.pair.writeEnd.drop();
    }
});
test.concurrent('new, transfer and drop retain table handles and reject busy drops', () => {
    const s = create();
    s.addTable(0, 2);
    s.addTable(1, 3);
    const packed = stream.streamNew(
        { taskLookup: s.taskLookup, lookup: s.lookup, creation: s.creation },
        { callerComponentIdx: 0, streamTableIdx: 2, elemMeta: scalar },
    );
    const readIdx = Number(packed & 0xffffffffn),
        writeIdx = Number(packed >> 32n),
        read = stream.getStreamEnd(s.ends, { tableIdx: 2, streamEndWaitableIdx: readIdx });
    read.setCopyState(s.StreamEnd.CopyState.ASYNC_COPYING);
    const drop = {
        RuntimeError: s.core.RuntimeError,
        lookup: s.lookup,
        taskLookup: s.taskLookup,
        ends: s.ends,
        StreamEnd: s.StreamReadableEnd,
    };
    expect(() => stream.streamDropReadable(drop, { componentIdx: 0, streamTableIdx: 2 }, readIdx)).toThrow(
        /busy stream/,
    );
    expect(s.tables[2].table.size()).toBe(2);
    read.setCopyState(s.StreamEnd.CopyState.IDLE);
    const moved = stream.streamTransfer(s.ends, readIdx, 2, 3);
    expect(read.streamTableIdx()).toBe(3);
    expect(s.tables[3].table.get(read.handle()!)).toBe(read);
    expect(s.tables[2].table.size()).toBe(1);
    // The destination has no task register: transfer is a table operation.
    expect(s.taskLookup.registers[1]).toBeUndefined();
    stream.streamDropReadable(drop, { componentIdx: 0, streamTableIdx: 3 }, moved);
    const write = stream.getStreamEnd(s.ends, { tableIdx: 2, streamEndWaitableIdx: writeIdx });
    write.getPendingEvent();
    stream.streamDropWritable(
        { ...drop, StreamEnd: s.StreamWritableEnd },
        { componentIdx: 0, streamTableIdx: 2 },
        writeIdx,
    );
    expect(s.tables[2].table.size()).toBe(0);
    expect(s.tables[3].table.size()).toBe(0);
});
test.concurrent('cancellation completes the pending read and consumes the cancellation event', () => {
    const s = pair(),
        memory = { buffer: new ArrayBuffer(16) };
    const common = {
        RuntimeError: s.core.RuntimeError,
        lookup: s.lookup,
        ends: s.ends,
        taskLookup: s.taskLookup,
        events: s.core.asyncEventCode,
        StreamEnd: s.StreamReadableEnd,
    };
    const opts = { componentIdx: 0, streamTableIdx: 2, isAsync: true, getMemoryFn: () => memory, elemMeta: scalar };
    expect(
        stream.streamRead(
            { ...common, mayBlock: { value: 1 }, ManagedBuffer: s.core.ManagedBuffer },
            opts,
            s.pair.readEndWaitableIdx!,
            0,
            2,
        ),
    ).toBe(0xffffffff);
    expect(stream.streamCancelRead(common, opts, s.pair.readEndWaitableIdx!)).toBe(s.StreamEnd.CopyResult.CANCELLED);
    expect(s.pair.readEnd.isIdleState()).toBe(true);
    expect(s.pair.readEnd.hasPendingEvent()).toBe(false);
    s.pair.readEnd.drop();
    s.pair.writeEnd.getPendingEvent();
    s.pair.writeEnd.drop();
});
test.concurrent('host numeric chunks lower into canonical reads and finish without losing the final values', async () => {
    const s = create();
    s.addTable(0, 2);
    const lower = {
        numeric: { strict: true },
        lookup: s.lookup,
        resourceRep: s.core.symbolResourceRep,
        streams: s.streams,
        InternalStream: s.InternalStream,
        lowerable: s.lowerable,
        creation: s.creation,
        source: s.source,
        injection: s.injection,
    };
    const index = lowerFlatStream(lower, { componentIdx: 0, streamTableIdx: 2, elemMeta: { ...scalar } })({
        componentIdx: 0,
        vals: [new Uint32Array([17, 23, 42, 99])],
        storagePtr: undefined,
    }) as number;
    const read = stream.getStreamEnd(s.ends, { tableIdx: 2, streamEndWaitableIdx: index });
    const memory = { buffer: new ArrayBuffer(32) },
        common = {
            RuntimeError: s.core.RuntimeError,
            lookup: s.lookup,
            ends: s.ends,
            mayBlock: { value: 1 },
            ManagedBuffer: s.core.ManagedBuffer,
            events: s.core.asyncEventCode,
            StreamEnd: s.StreamReadableEnd,
        };
    const opts = { componentIdx: 0, streamTableIdx: 2, isAsync: true, getMemoryFn: () => memory, elemMeta: scalar };
    expect(stream.streamRead(common, opts, index, 0, 4)).toBe(0xffffffff);
    await eventReady(read);
    const completed = read.getPendingEvent()!;
    expect(completed.payload1 >> 4).toBe(4);
    expect(Array.from({ length: 4 }, (_, i) => new DataView(memory.buffer).getUint32(i * 4, true))).toEqual([
        17, 23, 42, 99,
    ]);
    expect(completed.payload1 & 0xf).toBe(s.StreamEnd.CopyResult.COMPLETED);
    // The iterator reports exhaustion on the following read.
    expect(stream.streamRead(common, opts, index, 16, 1)).toBe(0xffffffff);
    await eventReady(read);
    expect(read.getPendingEvent()!.payload1).toBe(s.StreamEnd.CopyResult.DROPPED);
    read.drop();
});
test.concurrent('pending queue coalesces reads, preserves chunk offsets and returns cancelled values in order', async () => {
    const s = create();
    let calls = 0,
        release!: (value: IteratorResult<unknown>) => void;
    const queue = new s.PendingValueQueue(() => {
        calls++;
        return new Promise((resolve) => {
            release = resolve;
        });
    }, scalar);
    const a = queue.readSource(),
        b = queue.readSource();
    expect(calls).toBe(1);
    release({ value: new Uint8Array([1, 2, 3, 4]), done: false });
    expect(await a).toBe(4);
    expect(await b).toBe(4);
    const first: unknown[] = [];
    expect(queue.drainInto(first, 2)).toBe(2);
    expect(first).toEqual([1, 2]);
    queue.prepend([9, 8]);
    const second: unknown[] = [];
    queue.drainInto(second, 9);
    expect(second).toEqual([9, 8, 3, 4]);
    expect(queue.length).toBe(0);
    expect(s.component.storeAsyncState.pendingHostOperations).toBe(0);
});
test.concurrent('external streams use selected symbols, validate writes and dispose an in-flight read', async () => {
    const s = create();
    const writes: unknown[] = [],
        drops: unknown[] = [];
    const source = new s.Stream({
        globalRep: 7,
        isReadable: true,
        isWritable: true,
        readFn: (opts) => ({ value: opts.count, done: false }),
        writeFn: (v) => writes.push(v),
        dropFn: () => drops.push(true),
    });
    expect((source as unknown as Record<symbol, () => unknown>)[Symbol.asyncIterator]()).toBe(source);
    expect(await source.read({ count: 3 })).toEqual({ value: 3, done: false });
    await source.write(42);
    expect(writes).toEqual([42]);
    await expect(source.write()).rejects.toThrow(/single object/);
    await expect(source.write(1, 2)).rejects.toThrow(/single object/);
    await expect(source.read({ count: 0 })).rejects.toThrow(/count/);
    expect(await source.return()).toEqual({ done: true });
    expect(drops).toEqual([true]);
    const pairStore = pair(),
        read = pairStore.pair.readEnd;
    read.setPendingEvent(() => ({ code: 1, payload0: 1, payload1: 1 }));
    read.drop({ allowPendingEvent: true });
    expect(read.getPendingEvent()).toEqual({ code: 1, payload0: 1, payload1: 1 });
    pairStore.pair.writeEnd.getPendingEvent();
    pairStore.pair.writeEnd.drop();
});
test.concurrent('supported source protocols retain iterator receiver and deferred disposal', async () => {
    const s = create();
    expect(stream.isStreamLowerableObject(s.lowerable, null)).toBe(false);
    expect(stream.isStreamLowerableObject(s.lowerable, 42)).toBe(false);
    let disposed = false;
    const input = {
        *[Symbol.iterator]() {
            try {
                yield 42;
                yield 23;
            } finally {
                disposed = true;
            }
        },
    };
    const read = stream.genReadFnFromLowerableStream(s.source, input);
    expect(read.sourceIsSync).toBe(true);
    expect(await read()).toEqual({ value: 42, done: false });
    read.drop!();
    expect(disposed).toBe(false);
    await Promise.resolve();
    expect(disposed).toBe(true);
    const readable = new ReadableStream({
        start(controller) {
            controller.enqueue(99);
            controller.close();
        },
    });
    const next = stream.genReadFnFromLowerableStream(s.source, readable);
    expect(await next()).toEqual({ value: 99, done: false });
    expect(await next()).toEqual({ value: undefined, done: true });
    next.drop!();
});
test.concurrent('host read returns the last nonzero payload before reporting the dropped writer', async () => {
    const s = pair();
    const read = s.pair.readEnd.read(2);
    await s.pair.writeEnd.writeMany([42, 23], { dropAfterCopy: true });
    expect(await read).toEqual({ value: [42, 23], done: false } satisfies StreamReadResult);
    expect(await s.pair.readEnd.read()).toEqual({ value: undefined, done: true });
    s.pair.readEnd.drop();
    s.pair.writeEnd.drop();
});

test.concurrent('stream lookups and removal reject foreign constructors and mismatched table zero', () => {
    const selected = pair(),
        foreign = pair();
    const state = selected.addTable(0, 0);
    class SelectedTrap extends Error {}
    const context = { ...selected.tableContext, RuntimeError: SelectedTrap };
    const mismatched = selected.pair.readEndWaitableIdx!;
    const invalidIndices = [
        mismatched,
        state.handles.insert({ streamTableIdx: () => 0 }),
        state.handles.insert(foreign.pair.readEnd),
    ];
    for (const index of invalidIndices) {
        const original = state.handles.get(index);
        expect(() => stream.getStreamEnd(context, { tableIdx: 0, streamEndWaitableIdx: index })).toThrow(SelectedTrap);
        expect(() => stream.deleteStreamEnd(context, { tableIdx: 0, streamEndWaitableIdx: index })).toThrow(
            SelectedTrap,
        );
        expect(() => stream.removeStreamEndFromTable(context, { tableIdx: 0, streamWaitableIdx: index })).toThrow(
            SelectedTrap,
        );
        expect(state.handles.get(index)).toBe(original);
    }
    for (const s of [selected, foreign]) {
        s.pair.readEnd.drop();
        s.pair.writeEnd.getPendingEvent();
        s.pair.writeEnd.drop();
    }
});

test.concurrent('idle stream cancellation and wrong-direction drops use the selected trap', () => {
    const s = pair();
    class SelectedTrap extends Error {}
    const common = {
        RuntimeError: SelectedTrap,
        lookup: s.lookup,
        ends: s.ends,
        taskLookup: s.taskLookup,
        events: s.core.asyncEventCode,
    };
    const options = { componentIdx: 0, streamTableIdx: 2, isAsync: true };
    expect(() =>
        stream.streamCancelRead({ ...common, StreamEnd: s.StreamReadableEnd }, options, s.pair.readEndWaitableIdx!),
    ).toThrow(SelectedTrap);
    expect(() =>
        stream.streamCancelWrite({ ...common, StreamEnd: s.StreamWritableEnd }, options, s.pair.writeEndWaitableIdx!),
    ).toThrow(SelectedTrap);
    expect(() =>
        stream.streamDropReadable({ ...common, StreamEnd: s.StreamReadableEnd }, options, s.pair.writeEndWaitableIdx!),
    ).toThrow(SelectedTrap);
    expect(() =>
        stream.streamDropWritable({ ...common, StreamEnd: s.StreamWritableEnd }, options, s.pair.readEndWaitableIdx!),
    ).toThrow(SelectedTrap);
    s.pair.readEnd.drop();
    s.pair.writeEnd.getPendingEvent();
    s.pair.writeEnd.drop();
});
