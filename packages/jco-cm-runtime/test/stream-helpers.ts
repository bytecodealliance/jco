// Test-only composition of selected constructors and actual shared owners.
import * as stream from '../src/intrinsics/stream.js';
import { create as createComponent } from './component-helpers.js';
import type { StreamPayloadEnd, StreamTask, TaskLookupContext, AsyncTaskMeta } from '../src/runtime.js';
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
    const StreamEnd = stream.initializeStreamEndClass(core.asyncEventCode);
    const endpoint = {
        RuntimeError: core.RuntimeError,
        StreamEnd,
        ManagedBuffer: core.ManagedBuffer,
        buffers: core.bufferManager,
        lookup,
        taskLookup,
        tracking,
        events: core.asyncEventCode,
    };
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
    const tableContext = { tables, lookup, StreamEnd, RuntimeError: core.RuntimeError },
        ends = { ...tableContext, RuntimeError: core.RuntimeError };
    const creation = { tables, streams, InternalStream };
    const HostStream = stream.initializeHostStreamClass({ RuntimeError: core.RuntimeError, lookup, ends, Stream });
    const lowerable = {
        Stream,
        asyncIteratorSymbol: Symbol.asyncIterator,
        iteratorSymbol: Symbol.iterator,
        ReadableStream,
    };
    const source = { lowerable, disposeSymbol: core.symbolDispose };
    const injection = { PendingValueQueue };
    return {
        ...selected,
        StreamEnd,
        StreamReadableEnd,
        StreamWritableEnd,
        InternalStream,
        Stream,
        HostStream,
        PendingValueQueue,
        streams,
        tables,
        tableContext,
        ends,
        creation,
        lowerable,
        source,
        injection,
        taskLookup,
        tracking,
        addTable(componentIdx: number, tableIdx: number) {
            tables[tableIdx] = {
                componentIdx,
                table: new core.RepTable<StreamPayloadEnd>({ target: `stream table ${tableIdx}` }),
            };
            return component.getOrCreateAsyncState(componentIdx);
        },
    };
}
