import type {
    RepTableConstructor,
    StreamGlobalMap,
    StreamTables,
    StreamPayloadEnd,
    ComponentAsyncState,
    StreamCreateContext,
    StreamCreateOptions,
    StreamCreated,
    StreamEndLookupContext,
    StreamEndLocation,
    StreamTableContext,
    StreamEndInsertion,
    StreamDeleteOptions,
    StreamEndRemoval,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
import { getOrCreateAsyncState } from './component.js';
export const initializeStreams = (RepTable: RepTableConstructor): StreamGlobalMap =>
    new RepTable({ target: 'global stream map' });
export const initializeStreamTables = (): StreamTables => ({});

export function createStream(
    _context: StreamCreateContext,
    cstate: ComponentAsyncState,
    args: StreamCreateOptions,
): StreamCreated {
    debugLog('[createStream()] args', args);
    const { tableIdx, elemMeta, hostInjectFn } = args;
    if (tableIdx === undefined) {
        throw new Error('missing table idx while adding stream');
    }
    if (elemMeta === undefined) {
        throw new Error('missing element metadata while adding stream');
    }

    const { table: localStreamTable, componentIdx } = _context.tables[tableIdx];
    if (!localStreamTable) {
        throw new Error(`missing global stream table lookup for table [${tableIdx}] while creating stream`);
    }
    if (componentIdx !== cstate.componentIdx()) {
        throw new Error('component idx mismatch while creating stream');
    }

    const readWaitable = cstate.createWaitable();
    const writeWaitable = cstate.createWaitable();

    const stream = new _context.InternalStream({
        tableIdx,
        elemMeta,
        readWaitable,
        writeWaitable,
        hostInjectFn,
    });
    stream.setGlobalStreamMapRep(_context.streams.insert(stream));

    const readEnd = stream.readEnd();
    readEnd.setWaitableIdx(cstate.handles.insert(readEnd));
    readEnd.setHandle(localStreamTable.insert(readEnd));
    if (readEnd.streamTableIdx() !== tableIdx) {
        throw new Error('unexpectedly mismatched stream table');
    }

    const readEndWaitableIdx = readEnd.waitableIdx();
    const readEndHandle = readEnd.handle();
    readWaitable.setTarget(`waitable for read end (waitable [${readEndWaitableIdx}])`);
    readEnd.setTarget(`stream read end (waitable [${readEndWaitableIdx}])`);

    const writeEnd = stream.writeEnd();
    writeEnd.setWaitableIdx(cstate.handles.insert(writeEnd));
    writeEnd.setHandle(localStreamTable.insert(writeEnd));
    if (writeEnd.streamTableIdx() !== tableIdx) {
        throw new Error('unexpectedly mismatched stream table');
    }

    const writeEndWaitableIdx = writeEnd.waitableIdx();
    const writeEndHandle = writeEnd.handle();
    writeWaitable.setTarget(`waitable for stream write end (waitable [${writeEndWaitableIdx}])`);
    writeEnd.setTarget(`stream write end (waitable [${writeEndWaitableIdx}])`);

    return {
        writeEnd,
        writeEndWaitableIdx,
        writeEndHandle,
        readEndWaitableIdx,
        readEndHandle,
        readEnd,
    };
}

export function getStreamEnd(_context: StreamEndLookupContext, args: StreamEndLocation): StreamPayloadEnd {
    debugLog('[getStreamEnd()] args', args);
    const { tableIdx, streamEndHandle, streamEndWaitableIdx } = args;
    if (tableIdx === undefined) {
        throw new Error('missing table idx while getting stream end');
    }

    const { table, componentIdx } = _context.tables[tableIdx];
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);

    let streamEnd;
    if (streamEndWaitableIdx !== undefined) {
        streamEnd = cstate.handles.get(streamEndWaitableIdx) as StreamPayloadEnd | undefined;
    } else if (streamEndHandle !== undefined) {
        if (!table) {
            throw new Error(`missing/invalid table [${tableIdx}] while getting stream end`);
        }
        streamEnd = table.get(streamEndHandle);
    } else {
        throw new TypeError('must specify either waitable idx or handle to retrieve stream');
    }

    if (!(streamEnd instanceof _context.StreamEnd)) {
        throw new _context.RuntimeError(
            `missing stream end (tableIdx [${tableIdx}], handle [${streamEndHandle}], waitableIdx [${streamEndWaitableIdx}])`,
        );
    }
    if (streamEnd.streamTableIdx() !== tableIdx) {
        throw new _context.RuntimeError(
            `stream end table idx [${streamEnd.streamTableIdx()}] does not match [${tableIdx}]`,
        );
    }

    return streamEnd;
}

export function addStreamEndToTable(
    _context: StreamTableContext,
    args: StreamEndInsertion,
): { handle: number; waitableIdx: number } {
    debugLog('[addStreamEndToTable()] args', args);
    const { tableIdx, streamEnd } = args;
    if (typeof streamEnd === 'number') {
        throw new Error('INSERTING BAD STREAMEND');
    }

    let { table, componentIdx } = _context.tables[tableIdx];
    if (componentIdx === undefined || !table) {
        throw new Error(`invalid global stream table state for table [${tableIdx}]`);
    }

    const handle = table.insert(streamEnd);
    streamEnd.setHandle(handle);
    streamEnd.setStreamTableIdx(tableIdx);

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    const waitableIdx = cstate.handles.insert(streamEnd);
    streamEnd.setWaitableIdx(waitableIdx);

    debugLog('[addStreamEndToTable()] added stream end', {
        tableIdx,
        table,
        handle,
        streamEnd,
        destComponentIdx: componentIdx,
    });

    return { handle, waitableIdx };
}

export function deleteStreamEnd(_context: StreamTableContext, args: StreamDeleteOptions): StreamPayloadEnd {
    debugLog('[deleteStreamEnd()] args', args);
    const { tableIdx, streamEndWaitableIdx } = args;
    if (tableIdx === undefined) {
        throw new Error('missing table idx while removing stream end');
    }
    if (streamEndWaitableIdx === undefined) {
        throw new Error('missing stream idx while removing stream end');
    }

    const { table, componentIdx } = _context.tables[tableIdx];
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);

    const streamEnd = cstate.handles.get(streamEndWaitableIdx) as StreamPayloadEnd | undefined;
    if (!(streamEnd instanceof _context.StreamEnd) || streamEnd.streamTableIdx() !== tableIdx) {
        throw new _context.RuntimeError(`invalid stream end for table [${tableIdx}]`);
    }

    let removed = cstate.handles.remove(streamEnd.waitableIdx()!);
    if (!removed) {
        throw new Error(
            `failed to remove stream end [${streamEndWaitableIdx}] waitable obj in component [${componentIdx}]`,
        );
    }

    removed = table.remove(streamEnd.handle()!);
    if (!removed) {
        throw new Error(
            `failed to remove stream end with handle [${streamEnd.handle()}] from stream table [${tableIdx}] in component [${componentIdx}]`,
        );
    }

    return streamEnd;
}

export function removeStreamEndFromTable(_context: StreamTableContext, args: StreamEndRemoval): StreamPayloadEnd {
    debugLog('[removeStreamEndFromTable()] args', args);

    const { tableIdx, streamWaitableIdx } = args;
    if (tableIdx === undefined) {
        throw new Error('missing table idx while removing stream end');
    }
    if (streamWaitableIdx === undefined) {
        throw new Error('missing stream end waitable idx while removing stream end');
    }

    const { table, componentIdx } = _context.tables[tableIdx];
    if (!table) {
        throw new Error(`missing/invalid table [${tableIdx}] while removing stream end`);
    }

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);

    const streamEnd = cstate.handles.get(streamWaitableIdx) as StreamPayloadEnd | undefined;
    if (!(streamEnd instanceof _context.StreamEnd) || streamEnd.streamTableIdx() !== tableIdx) {
        throw new _context.RuntimeError(`invalid stream end for table [${tableIdx}]`);
    }
    const handle = streamEnd.handle();

    let removed = cstate.handles.remove(streamWaitableIdx);
    if (!removed) {
        throw new Error(
            `failed to remove streamEnd from handles (waitable idx [${streamWaitableIdx}]), component [${componentIdx}])`,
        );
    }

    removed = table.remove(handle!);
    if (!removed) {
        throw new Error(
            `failed to remove streamEnd from table (handle [${handle}]), table [${tableIdx}], component [${componentIdx}])`,
        );
    }

    return streamEnd;
}
