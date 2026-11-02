import { expect, test, vi } from 'vitest';
import { initializeFutureValueClass } from '../src/intrinsics/future-value.js';
import { initializeFutureEndClass } from '../src/intrinsics/future-end.js';
import { initializeFutureReadableEndClass } from '../src/intrinsics/future-readable.js';
import { initializeFutureWritableEndClass } from '../src/intrinsics/future-writable.js';
import { initializeInternalFutureClass } from '../src/intrinsics/future-internal.js';
import { initializeWaitableClass } from '../src/intrinsics/waitable.js';
import { create } from './component-helpers.js';
import type { FutureElementMetadata } from '../src/runtime.js';

function setup() {
    const { core, lookup } = create();
    const Waitable = initializeWaitableClass();
    const FutureValue = initializeFutureValueClass();
    const FutureEnd = initializeFutureEndClass(core.asyncEventCode);
    const context = {
        RuntimeError: core.RuntimeError,
        FutureEnd,
        FutureValue,
        buffers: core.bufferManager,
        events: core.asyncEventCode,
    };
    const Readable = initializeFutureReadableEndClass({ ...context, lookup });
    const Writable = initializeFutureWritableEndClass(context);
    const Internal = initializeInternalFutureClass({ FutureReadableEnd: Readable, FutureWritableEnd: Writable });
    const readWaitable = new Waitable({ componentIdx: -1 }),
        writeWaitable = new Waitable({ componentIdx: -1 });
    const elemMeta: FutureElementMetadata = { align32: 4, size32: 4, isNumeric: true };
    const pair = new Internal({ tableIdx: 2, elemMeta, readWaitable, writeWaitable });
    pair.readEnd().setWaitableIdx(17);
    pair.writeEnd().setWaitableIdx(23);
    return { core, FutureEnd, FutureValue, Readable, Writable, Internal, pair, elemMeta };
}

test.concurrent.each([false, true])('connected endpoints transfer one value with reader-first=%s', (readerFirst) => {
    const { pair, core, FutureEnd, elemMeta } = setup();
    const read = pair.readEnd(),
        write = pair.writeEnd();
    expect(read.getPendingBufferMeta()).toBe(write.getPendingBufferMeta());
    const readValue = () => read.guestRead({ componentIdx: -1, data: [], stringEncoding: 'utf8' });
    const writeValue = () => write.guestWrite({ componentIdx: -1, data: [42], stringEncoding: 'utf8' });
    let result;
    if (readerFirst) {
        result = readValue();
        writeValue();
    } else {
        writeValue();
        result = readValue();
    }
    expect(read.getPendingEvent()).toEqual({
        code: core.asyncEventCode.FUTURE_READ,
        payload0: 17,
        payload1: FutureEnd.CopyResult.COMPLETED,
    });
    expect(write.getPendingEvent()).toEqual({
        code: core.asyncEventCode.FUTURE_WRITE,
        payload0: 23,
        payload1: FutureEnd.CopyResult.COMPLETED,
    });
    expect(result.buffer.read(1)).toEqual([42]);
    expect(read.isDoneState()).toBe(true);
    expect(write.isDoneState()).toBe(true);
    expect(elemMeta.stringEncoding).toBeUndefined();
    read.drop();
    write.drop();
});

test.concurrent('host await is lazy and transfers a value through the selected endpoint classes', async () => {
    const { pair, FutureValue } = setup(),
        read = pair.readEnd(),
        write = pair.writeEnd();
    const value = read.promise();
    expect(value).toBeInstanceOf(FutureValue);
    expect(read.promise()).toBe(value);
    expect(read.getPendingBufferMeta().buffer).toBeUndefined();
    const [result, delivered] = await Promise.all([
        Promise.resolve(value),
        write.hostWrite({ value: 23, stringEncoding: 'utf8' }),
    ]);
    try {
        expect(result).toBe(23);
        expect(delivered).toBe(true);
        expect(read.isDoneState()).toBe(true);
        expect(write.isDoneState()).toBe(true);
    } finally {
        read.drop();
        write.drop();
    }
});

test.concurrent('selected constructor inheritance, statics and private brands stay isolated per store', () => {
    const a = setup(),
        b = setup();
    expect(a.pair.readEnd()).toBeInstanceOf(a.Readable);
    expect(a.pair.readEnd()).toBeInstanceOf(a.FutureEnd);
    expect(a.pair.readEnd()).not.toBeInstanceOf(b.Readable);
    expect(a.Readable.CopyState).toBe(a.FutureEnd.CopyState);
    expect(a.Writable.CopyResult).toBe(a.FutureEnd.CopyResult);
    expect(a.Readable.CopyState).not.toBe(b.Readable.CopyState);
    a.pair.setGlobalFutureMapRep(42);
    expect(a.pair.readEnd().globalFutureMapRep()).toBe(42);
    expect(a.pair.writeEnd().globalFutureMapRep()).toBe(42);
    expect(b.pair.globalFutureMapRep()).toBeUndefined();
    expect(() => a.Readable.prototype.getElemMeta.call(b.pair.readEnd())).toThrow(TypeError);
    a.pair.readEnd().drop();
    a.pair.writeEnd().getPendingEvent();
    a.pair.writeEnd().drop();
    b.pair.readEnd().drop();
    b.pair.writeEnd().getPendingEvent();
    b.pair.writeEnd().drop();
});

test.concurrent.each([false, true])(
    'future copies transfer guest resource ownership, reader first=%s',
    (readerFirst) => {
        const { pair, core, elemMeta } = setup();
        const source = new core.ManagedBuffer({ componentIdx: 1, capacity: 1, elemMeta, data: [42] });
        const destination = new core.ManagedBuffer({ componentIdx: 2, capacity: 1, elemMeta, data: [] });
        const read = vi.spyOn(source, 'read'),
            write = vi.spyOn(destination, 'write');
        const receive = () => pair.readEnd().guestRead({ componentIdx: 2, buffer: destination });
        const send = () => pair.writeEnd().guestWrite({ componentIdx: 1, buffer: source });
        if (readerFirst) {
            receive();
            send();
        } else {
            send();
            receive();
        }
        expect(read).toHaveBeenCalledWith(1, { transferResources: true });
        expect(write).toHaveBeenCalledWith([42], { transferResources: true });
        pair.readEnd().getPendingEvent();
        pair.writeEnd().getPendingEvent();
        pair.readEnd().drop();
        pair.writeEnd().drop();
    },
);

test.concurrent.each(['read', 'write'] as const)(
    'future %s uses operation metadata without mutating creation metadata',
    (direction) => {
        const { pair, elemMeta } = setup();
        const endpoint = direction === 'read' ? pair.readEnd() : pair.writeEnd();
        const operationMeta = { ...elemMeta, payloadTypeName: 'operation', stringEncoding: 'utf8' };
        const realloc = () => 8;
        const options = {
            componentIdx: -1,
            data: direction === 'read' ? [] : [42],
            elemMeta: operationMeta,
            stringEncoding: 'compact-utf16',
            getReallocFn: () => realloc,
        };
        if (direction === 'read') {
            pair.readEnd().guestRead(options);
        } else {
            pair.writeEnd().guestWrite(options);
        }
        const selected = endpoint.getPendingBufferMeta().buffer!.getElemMeta();
        expect(selected.payloadTypeName).toBe('operation');
        expect(selected.stringEncoding).toBe('compact-utf16');
        expect(selected.getReallocFn!()).toBe(realloc);
        expect(operationMeta.stringEncoding).toBe('utf8');
        expect(elemMeta.stringEncoding).toBeUndefined();
        endpoint.resetAndNotifyPending(2);
        pair.readEnd().getPendingEvent();
        pair.writeEnd().getPendingEvent();
        pair.readEnd().drop();
        pair.writeEnd().getPendingEvent();
        pair.writeEnd().drop();
    },
);
