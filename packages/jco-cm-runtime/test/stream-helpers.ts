// Test-only composition of selected constructors and actual shared owners.
import * as stream from '../src/intrinsics/stream.js';
import { create as createComponent } from './component-helpers.js';
import type {
    InternalStream,
    RuntimeErrorConstructor,
    StreamElementMetadata,
    StreamPayloadEnd,
    StreamTask,
    TaskLookupContext,
    AsyncTaskMeta,
} from '../src/runtime.js';

/** Little-endian `u32` stream elements. */
export const scalar: StreamElementMetadata = {
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

export function create() {
    const selected = createComponent();
    const { core, component, lookup } = selected;
    const tracking = {
        RuntimeError: core.RuntimeError,
        storeTrap: component.storeTrap,
        storeAsyncState: component.storeAsyncState,
        asyncState: component.asyncState,
        symbolDispose: core.symbolDispose,
    };
    const task: StreamTask = {
        id: () => 1n,
        componentIdx: () => 0,
        mayBlock: () => true,
        isErrored: () => null,
        suspendUntil: async (options) => options.readyFn(),
    };
    const meta: AsyncTaskMeta<StreamTask> = { id: 1n, componentIdx: 0, task };
    const taskLookup: TaskLookupContext<StreamTask> = {
        tasks: new Map([[0, [meta]]]),
        registers: { 0: { componentIdx: 0, taskID: 1n, threadID: 1 } },
    };
    const shared = {
        RuntimeError: core.RuntimeError,
        ManagedBuffer: core.ManagedBuffer,
        buffers: core.bufferManager,
        events: core.asyncEventCode,
    };
    const StreamEnd = stream.initializeStreamEndClass({ ...shared, taskLookup, tracking });
    const endpoint = { ...shared, StreamEnd, lookup };
    const StreamReadableEnd = stream.initializeStreamReadableEndClass(endpoint),
        StreamWritableEnd = stream.initializeStreamWritableEndClass(endpoint);
    const InternalStream = stream.initializeInternalStreamClass({ StreamReadableEnd, StreamWritableEnd });
    const Stream = stream.initializeExternalStreamClass({
        disposeSymbol: core.symbolDispose,
        asyncIteratorSymbol: Symbol.asyncIterator,
        resourceRep: core.symbolResourceRep,
    });
    const PendingValueQueue = stream.initializePendingValueQueueClass(tracking);
    const streams = stream.initializeStreams(core.RepTable),
        tables = stream.initializeStreamTables();
    const ends = { tables, lookup, StreamEnd, RuntimeError: core.RuntimeError };
    const creation = { tables, streams, InternalStream };
    const lowerable = {
        Stream,
        asyncIteratorSymbol: Symbol.asyncIterator,
        iteratorSymbol: Symbol.iterator,
        ReadableStream,
    };
    const source = { lowerable, disposeSymbol: core.symbolDispose };
    const lower = {
        numeric: { strict: true },
        lookup,
        resourceRep: core.symbolResourceRep,
        streams,
        InternalStream,
        lowerable,
        creation,
        source,
        injection: { PendingValueQueue },
    };
    return {
        core,
        component,
        lookup,
        StreamEnd,
        StreamReadableEnd,
        Stream,
        PendingValueQueue,
        streams,
        tables,
        ends,
        creation,
        lowerable,
        source,
        lower,
        taskLookup,
        /** Contexts for the canonical read, write, cancel and drop operations of each direction. */
        operations(RuntimeError: RuntimeErrorConstructor = core.RuntimeError) {
            const shared = {
                RuntimeError,
                lookup,
                ends,
                taskLookup,
                ManagedBuffer: core.ManagedBuffer,
                events: core.asyncEventCode,
            };
            return {
                readable: { ...shared, StreamEnd: StreamReadableEnd },
                writable: { ...shared, StreamEnd: StreamWritableEnd },
            };
        },
        addTable(componentIdx: number, tableIdx: number) {
            tables[tableIdx] = {
                componentIdx,
                table: new core.RepTable<StreamPayloadEnd>({ target: `stream table ${tableIdx}` }),
            };
            return component.getOrCreateAsyncState(componentIdx);
        },
    };
}

/** A store with one `u32` stream whose ends both live in `tableIdx` of component 0. */
export function createPair(tableIdx = 2) {
    const s = create();
    const pair = stream.createStream(s.creation, s.addTable(0, tableIdx), { tableIdx, elemMeta: { ...scalar } });
    return {
        ...s,
        pair,
        read: pair.readEnd,
        write: pair.writeEnd,
        readIdx: pair.readEndWaitableIdx!,
        writeIdx: pair.writeEndWaitableIdx!,
        /** Notifies the stream the way stopping its instance does. */
        stopInstance() {
            (s.streams.get(pair.readEnd.globalStreamMapRep()!) as InternalStream).onInstanceStop();
        },
    };
}

/** Drops both ends, consuming the event the writer receives for the dropped reader. */
export function dropPair(pair: { readEnd: { drop(): void }; writeEnd: { getPendingEvent(): unknown; drop(): void } }) {
    pair.readEnd.drop();
    pair.writeEnd.getPendingEvent();
    pair.writeEnd.drop();
}

/** Canonical options for an async guest operation on `scalar` elements in `memory`. */
export function guestOptions(memory: { buffer: ArrayBuffer }, streamTableIdx = 2) {
    return {
        componentIdx: 0,
        streamTableIdx,
        isAsync: true,
        stringEncoding: 'utf8',
        getMemoryFn: () => memory,
        elemMeta: scalar,
    };
}

/** A disposable host value, and a source `next` whose read stays pending until the value is made to `arrive`. */
export function lateValue(disposeSymbol: symbol) {
    const disposed: unknown[] = [];
    const value = { [disposeSymbol]: () => disposed.push(value) };
    const pending = Promise.withResolvers<IteratorResult<unknown>>();
    return {
        value,
        disposed,
        next: () => pending.promise,
        arrive: () => pending.resolve({ value, done: false }),
    };
}
