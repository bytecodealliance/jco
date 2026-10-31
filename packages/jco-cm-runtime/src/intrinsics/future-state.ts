import type {
    RepTableConstructor,
    FutureGlobalMap,
    FutureTables,
    FutureCreateContext,
    FutureCreateOptions,
    FutureCreated,
    FutureEndLookupContext,
    FutureEndLocation,
    FutureTableContext,
    FutureEndInsertion,
    FutureEndRemoval,
    FuturePayloadEnd,
    ComponentAsyncState,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
import { getOrCreateAsyncState } from './component.js';
export const initializeFutures = (RepTable: RepTableConstructor): FutureGlobalMap =>
    new RepTable({ target: 'global future map' });
export const initializeFutureTables = (): FutureTables => ({});
export const initializeNestedFutureSymbol = (): symbol => Symbol.for('nested-future');

export function createFuture(
    _context: FutureCreateContext,
    cstate: ComponentAsyncState,
    args: FutureCreateOptions,
): FutureCreated {
    debugLog('[createFuture()] args', args);
    const { tableIdx, elemMeta, hostInjectFn } = args;
    if (tableIdx === undefined) {
        throw new Error('missing table idx while adding future');
    }
    if (elemMeta === undefined) {
        throw new Error('missing element metadata while adding future');
    }

    const { table: futureTable, componentIdx } = _context.tables[tableIdx];
    if (!futureTable) {
        throw new Error(`missing global future table lookup for table [${tableIdx}] while creating future`);
    }
    if (componentIdx !== cstate.componentIdx()) {
        throw new Error('component idx mismatch while creating future');
    }

    const readWaitable = cstate.createWaitable();
    const writeWaitable = cstate.createWaitable();

    const future = new _context.InternalFuture({
        tableIdx,
        componentIdx: cstate.componentIdx(),
        elemMeta,
        readWaitable,
        writeWaitable,
        hostInjectFn,
    });
    future.setGlobalFutureMapRep(_context.futures.insert(future));

    const readEnd = future.readEnd();
    readEnd.setWaitableIdx(cstate.handles.insert(readEnd));
    readEnd.setHandle(futureTable.insert(readEnd));
    if (readEnd.futureTableIdx() !== tableIdx) {
        throw new Error('unexpectedly mismatched future table');
    }

    const readEndWaitableIdx = readEnd.waitableIdx();
    const readEndHandle = readEnd.handle();
    readWaitable.setTarget(`waitable for read end (waitable [${readEndWaitableIdx}])`);
    readEnd.setTarget(`future read end (waitable [${readEndWaitableIdx}])`);

    const writeEnd = future.writeEnd();
    writeEnd.setWaitableIdx(cstate.handles.insert(writeEnd));
    writeEnd.setHandle(futureTable.insert(writeEnd));
    if (writeEnd.futureTableIdx() !== tableIdx) {
        throw new Error('unexpectedly mismatched future table');
    }

    const writeEndWaitableIdx = writeEnd.waitableIdx();
    const writeEndHandle = writeEnd.handle();
    writeWaitable.setTarget(`waitable for future write end (waitable [${writeEndWaitableIdx}])`);
    writeEnd.setTarget(`future write end (waitable [${writeEndWaitableIdx}])`);

    return {
        writeEnd,
        writeEndWaitableIdx,
        writeEndHandle,
        readEndWaitableIdx,
        readEndHandle,
        readEnd,
    };
}

export function getFutureEnd(_context: FutureEndLookupContext, args: FutureEndLocation): FuturePayloadEnd {
    debugLog('[getFutureEnd()] args', args);
    const { tableIdx, futureEndHandle, futureEndWaitableIdx } = args;
    if (tableIdx === undefined) {
        throw new Error('missing table idx while getting future end');
    }

    const { table, componentIdx } = _context.tables[tableIdx];
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);

    let futureEnd;
    if (futureEndWaitableIdx !== undefined) {
        futureEnd = cstate.handles.get(futureEndWaitableIdx) as FuturePayloadEnd | undefined;
    } else if (futureEndHandle !== undefined) {
        if (!table) {
            throw new Error(`missing/invalid table [${tableIdx}] while getting future end`);
        }
        futureEnd = table.get(futureEndHandle);
    } else {
        throw new TypeError('must specify either waitable idx or handle to retrieve future');
    }

    if (!(futureEnd instanceof _context.FutureEnd)) {
        throw new _context.RuntimeError(
            `missing future end (tableIdx [${tableIdx}], handle [${futureEndHandle}], waitableIdx [${futureEndWaitableIdx}])`,
        );
    }
    if (futureEnd.futureTableIdx() !== tableIdx) {
        throw new _context.RuntimeError(
            `future end table idx [${futureEnd.futureTableIdx()}] does not match [${tableIdx}]`,
        );
    }

    return futureEnd;
}

export function addFutureEndToTable(_context: FutureTableContext, args: FutureEndInsertion) {
    debugLog('[addFutureEndToTable()] args', args);
    const { tableIdx, futureEnd } = args;
    if (typeof futureEnd === 'number') {
        throw new Error('INSERTING BAD FUTUREEND');
    }

    let { table, componentIdx } = _context.tables[tableIdx];
    if (componentIdx === undefined || !table) {
        throw new Error(`invalid global future table state for table [${tableIdx}]`);
    }

    const handle = table.insert(futureEnd);
    futureEnd.setHandle(handle);
    futureEnd.setFutureTableIdx(tableIdx);

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    const waitableIdx = cstate.handles.insert(futureEnd);
    futureEnd.setWaitableIdx(waitableIdx);

    debugLog('[addFutureEndToTable()] added future end', {
        tableIdx,
        table,
        handle,
        futureEnd,
        destComponentIdx: componentIdx,
    });

    return { handle, waitableIdx };
}

export function removeFutureEndFromTable(_context: FutureTableContext, args: FutureEndRemoval): FuturePayloadEnd {
    debugLog('[removeFutureEndFromTable()] args', args);
    const { tableIdx, futureWaitableIdx } = args;
    if (tableIdx === undefined) {
        throw new Error('missing table idx while removing future end');
    }
    if (futureWaitableIdx === undefined) {
        throw new Error('missing future end waitable idx while removing future end');
    }

    const { table, componentIdx } = _context.tables[tableIdx];
    if (!table) {
        throw new Error(`missing/invalid table [${tableIdx}] while removing future end`);
    }

    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);

    const futureEnd = cstate.handles.get(futureWaitableIdx) as FuturePayloadEnd | undefined;
    if (!(futureEnd instanceof _context.FutureEnd) || futureEnd.futureTableIdx() !== tableIdx) {
        throw new _context.RuntimeError(`invalid future end for table [${tableIdx}]`);
    }
    const handle = futureEnd.handle();

    let removed = cstate.handles.remove(futureWaitableIdx);
    if (!removed) {
        throw new Error(
            `failed to remove futureEnd from handles (waitable idx [${futureWaitableIdx}]), component [${componentIdx}])`,
        );
    }

    removed = table.remove(handle!);
    if (!removed) {
        throw new Error(
            `failed to remove futureEnd from table (handle [${handle}]), table [${tableIdx}], component [${componentIdx}])`,
        );
    }

    return futureEnd;
}
