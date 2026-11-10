import { expect, suite, test } from 'vitest';
import * as stream from '../src/intrinsics/stream.js';
import { lowerFlatStream } from '../src/intrinsics/lower.js';
import { create, createPair, dropPair, eventReady, guestOptions, scalar } from './stream-helpers.js';
import type { StreamReadResult } from '../src/runtime.js';

class SelectedTrap extends Error {}

suite.concurrent('stream state', () => {
    test('store constructors retain inheritance, private brands, statics and actual owner identity', () => {
        const a = createPair(),
            b = createPair();
        expect(a.StreamEnd).not.toBe(b.StreamEnd);
        expect(a.StreamReadableEnd).not.toBe(b.StreamReadableEnd);
        expect(Object.getPrototypeOf(a.StreamReadableEnd)).toBe(a.StreamEnd);
        expect(a.StreamReadableEnd.CopyState).toBe(a.StreamEnd.CopyState);
        expect(a.read).toBeInstanceOf(a.StreamEnd);
        expect(a.read).not.toBeInstanceOf(b.StreamEnd);
        expect(() => a.StreamReadableEnd.prototype.streamTableIdx.call(b.read)).toThrow(TypeError);
        expect(stream.getStreamEnd(a.ends, { tableIdx: 2, streamEndWaitableIdx: a.readIdx })).toBe(a.read);
        a.addTable(0, 0);
        expect(() => stream.getStreamEnd(a.ends, { tableIdx: 0, streamEndWaitableIdx: a.readIdx })).toThrow(
            /does not match/,
        );
        dropPair(a.pair);
        dropPair(b.pair);
    });

    test('new, transfer and drop retain table handles and reject busy drops', () => {
        const s = create(),
            ops = s.operations();
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
        expect(() => stream.streamDropReadable(ops.readable, { componentIdx: 0, streamTableIdx: 2 }, readIdx)).toThrow(
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
        stream.streamDropReadable(ops.readable, { componentIdx: 0, streamTableIdx: 3 }, moved);
        const write = stream.getStreamEnd(s.ends, { tableIdx: 2, streamEndWaitableIdx: writeIdx });
        write.getPendingEvent();
        stream.streamDropWritable(ops.writable, { componentIdx: 0, streamTableIdx: 2 }, writeIdx);
        expect(s.tables[2].table.size()).toBe(0);
        expect(s.tables[3].table.size()).toBe(0);
    });

    test('stream lookups and removal reject foreign constructors and mismatched table zero', () => {
        const selected = createPair(),
            foreign = createPair();
        const state = selected.addTable(0, 0);
        const context = { ...selected.tableContext, RuntimeError: SelectedTrap };
        const invalidIndices = [
            selected.readIdx,
            state.handles.insert({ streamTableIdx: () => 0 }),
            state.handles.insert(foreign.read),
        ];
        for (const index of invalidIndices) {
            const original = state.handles.get(index);
            expect(() => stream.getStreamEnd(context, { tableIdx: 0, streamEndWaitableIdx: index })).toThrow(
                SelectedTrap,
            );
            expect(() => stream.deleteStreamEnd(context, { tableIdx: 0, streamEndWaitableIdx: index })).toThrow(
                SelectedTrap,
            );
            expect(() => stream.removeStreamEndFromTable(context, { tableIdx: 0, streamWaitableIdx: index })).toThrow(
                SelectedTrap,
            );
            expect(state.handles.get(index)).toBe(original);
        }
        dropPair(selected.pair);
        dropPair(foreign.pair);
    });
});

suite.concurrent('canonical stream operations', () => {
    test.each([false, true])('nonzero stream payload rendezvous, reader first=%s', (readerFirst) => {
        const s = createPair(),
            ops = s.operations(),
            memory = { buffer: new ArrayBuffer(64) },
            opts = guestOptions(memory);
        const data = new DataView(memory.buffer);
        for (let i = 0; i < 4; i++) {
            data.setUint32(i * 4, 101 + i, true);
        }
        expect(s.read.getPendingBufferMeta()).toBe(s.write.getPendingBufferMeta());
        const read = () => stream.streamRead(ops.readable, opts, s.readIdx, 32, 4),
            write = () => stream.streamWrite(ops.writable, opts, s.writeIdx, 0, 4);
        const [first, second] = readerFirst ? [read(), write()] : [write(), read()];
        expect(first).toBe(0xffffffff);
        expect(second).toBe(64);
        expect(Array.from({ length: 4 }, (_, i) => data.getUint32(32 + i * 4, true))).toEqual([101, 102, 103, 104]);
        const pending = readerFirst ? s.read : s.write;
        expect(pending.getPendingEvent()!.payload1).toBe(64);
        expect(s.read.isIdleState()).toBe(true);
        expect(s.write.isIdleState()).toBe(true);
        expect(s.read.getPendingBufferMeta().buffer).toBeNull();
        dropPair(s.pair);
    });

    test('cancellation completes the pending read and consumes the cancellation event', () => {
        const s = createPair(),
            ops = s.operations(),
            opts = guestOptions({ buffer: new ArrayBuffer(16) });
        expect(stream.streamRead(ops.readable, opts, s.readIdx, 0, 2)).toBe(0xffffffff);
        expect(stream.streamCancelRead(ops.readable, opts, s.readIdx)).toBe(s.StreamEnd.CopyResult.CANCELLED);
        expect(s.read.isIdleState()).toBe(true);
        expect(s.read.hasPendingEvent()).toBe(false);
        dropPair(s.pair);
    });

    test('idle stream cancellation and wrong-direction drops use the selected trap', () => {
        const s = createPair(),
            ops = s.operations(SelectedTrap);
        const options = { componentIdx: 0, streamTableIdx: 2, isAsync: true };
        expect(() => stream.streamCancelRead(ops.readable, options, s.readIdx)).toThrow(SelectedTrap);
        expect(() => stream.streamCancelWrite(ops.writable, options, s.writeIdx)).toThrow(SelectedTrap);
        expect(() => stream.streamDropReadable(ops.readable, options, s.writeIdx)).toThrow(SelectedTrap);
        expect(() => stream.streamDropWritable(ops.writable, options, s.readIdx)).toThrow(SelectedTrap);
        dropPair(s.pair);
    });
});

suite.concurrent('instance stop', () => {
    const stopped = { code: 'ERR_COMPONENT_STOPPED', message: 'component instance has been stopped' };

    test('a pending host read and every later read report the interruption', async () => {
        const s = createPair();
        const pending = s.read.read();
        s.stopInstance();
        await expect(pending).rejects.toMatchObject(stopped);
        await expect(s.read.read()).rejects.toMatchObject(stopped);
        expect(s.read.isDropped()).toBe(true);
        expect(s.write.isDropped()).toBe(true);
    });

    test('a stream closed before the stop still ends normally', async () => {
        const s = createPair();
        s.write.drop();
        s.stopInstance();
        expect(await s.read.read()).toEqual({ value: undefined, done: true });
    });

    test('a host value arriving after the stop is disposed instead of queued', async () => {
        const s = create();
        const disposed: unknown[] = [],
            late = { [s.core.symbolDispose]: () => disposed.push(late) };
        let release!: (value: IteratorResult<unknown>) => void;
        const queue = new s.PendingValueQueue(() => new Promise((resolve) => (release = resolve)), scalar);
        const read = queue.readSource();
        const error = new s.core.RuntimeError('stopped');
        s.component.storeTrap.error = error;
        s.component.storeTrap.stopped = true;
        for (const reject of s.component.storeTrap.stopWaiters) {
            reject(error);
        }
        expect(await read).toBe(0);
        expect(queue.done).toBe(true);
        release({ value: late, done: false });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(disposed).toEqual([late]);
        expect(queue.length).toBe(0);
    });

    test('a host value arriving after its source was dropped is disposed instead of queued', async () => {
        const s = create();
        const disposed: unknown[] = [],
            late = { [s.core.symbolDispose]: () => disposed.push(late) };
        let release!: (value: IteratorResult<unknown>) => void;
        const source = {
            [Symbol.asyncIterator]: () => ({
                next: () => new Promise<IteratorResult<unknown>>((resolve) => (release = resolve)),
            }),
        };
        const readFn = stream.genReadFnFromLowerableStream(s.source, source);
        const queue = new s.PendingValueQueue(readFn, scalar);
        const read = queue.readSource();
        expect(readFn.dropped).toBeUndefined();
        readFn.drop!();
        expect(readFn.dropped).toBe(true);
        release({ value: late, done: false });
        expect(await read).toBe(0);
        expect(queue.done).toBe(true);
        expect(disposed).toEqual([late]);
        expect(queue.length).toBe(0);
    });
});

suite.concurrent('host streams', () => {
    test('host numeric chunks lower into canonical reads and finish without losing the final values', async () => {
        const s = create(),
            ops = s.operations();
        s.addTable(0, 2);
        const index = lowerFlatStream(s.lower, { componentIdx: 0, streamTableIdx: 2, elemMeta: { ...scalar } })({
            componentIdx: 0,
            vals: [new Uint32Array([17, 23, 42, 99])],
            storagePtr: undefined,
        }) as number;
        const read = stream.getStreamEnd(s.ends, { tableIdx: 2, streamEndWaitableIdx: index });
        const memory = { buffer: new ArrayBuffer(32) },
            opts = guestOptions(memory);
        expect(stream.streamRead(ops.readable, opts, index, 0, 4)).toBe(0xffffffff);
        await eventReady(read);
        const completed = read.getPendingEvent()!;
        expect(completed.payload1 >> 4).toBe(4);
        expect(Array.from({ length: 4 }, (_, i) => new DataView(memory.buffer).getUint32(i * 4, true))).toEqual([
            17, 23, 42, 99,
        ]);
        expect(completed.payload1 & 0xf).toBe(s.StreamEnd.CopyResult.COMPLETED);
        // The iterator reports exhaustion on the following read.
        expect(stream.streamRead(ops.readable, opts, index, 16, 1)).toBe(0xffffffff);
        await eventReady(read);
        expect(read.getPendingEvent()!.payload1).toBe(s.StreamEnd.CopyResult.DROPPED);
        read.drop();
    });

    test('pending queue coalesces reads, preserves chunk offsets and returns cancelled values in order', async () => {
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

    test('external streams use selected symbols, validate writes and dispose an in-flight read', async () => {
        const s = createPair();
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
        s.read.setPendingEvent(() => ({ code: 1, payload0: 1, payload1: 1 }));
        s.read.drop({ allowPendingEvent: true });
        expect(s.read.getPendingEvent()).toEqual({ code: 1, payload0: 1, payload1: 1 });
        s.write.getPendingEvent();
        s.write.drop();
    });

    test('supported source protocols retain iterator receiver and deferred disposal', async () => {
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

    test('host read returns the last nonzero payload before reporting the dropped writer', async () => {
        const s = createPair();
        const read = s.read.read(2);
        await s.write.writeMany([42, 23], { dropAfterCopy: true });
        expect(await read).toEqual({ value: [42, 23], done: false } satisfies StreamReadResult);
        expect(await s.read.read()).toEqual({ value: undefined, done: true });
        s.read.drop();
        s.write.drop();
    });
});
