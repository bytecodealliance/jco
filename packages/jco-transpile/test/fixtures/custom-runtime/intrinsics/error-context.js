import { debugLog } from './core-debug.js';
import { getOrCreateAsyncState } from './component.js';

export function initializeGlobalErrorContextTableClass(RepTable) {
    class GlobalErrorContextTable {
        static data = null;
        static get() {
            if (GlobalErrorContextTable.data === null) {
                GlobalErrorContextTable.data = new RepTable({
                    target: 'global error context table',
                });
            }
            return GlobalErrorContextTable.data;
        }
    }
    return GlobalErrorContextTable;
}
export const initializeErrorContextTableRegistrations = () => ({});
export const initializeLocalErrorContextTables = () => new Map();

export function errCtxNew(context, args, msgPtr, msgLen) {
    const { globalTable: GlobalErrorContextTable } = context;
    debugLog('[errCtxNew()] args', { args, msgPtr, msgLen });
    const { componentIdx, localTableIdx, readStrFn } = args;
    const localTable = errCtxGetLocalTable(context.local, componentIdx, localTableIdx);
    const debugMessage = readStrFn(msgPtr, msgLen);
    const { globalRep, errCtx: globalErrCtx } = errCtxReserveGlobalRep(GlobalErrorContextTable, debugMessage, 0);
    const { waitableIdx, localIdx } = errCtxCreateLocalHandle(context, componentIdx, localTable, globalRep);
    globalErrCtx.localIdx = localIdx;
    globalErrCtx.waitableIdx = waitableIdx;
    globalErrCtx.componentIdx = componentIdx;
    globalErrCtx.localTableIdx = localTableIdx;
    return waitableIdx;
}

export function errCtxDebugMessage(context, ctx, handle, outputStrPtr) {
    const { globalTable: GlobalErrorContextTable, RuntimeError } = context;
    debugLog('[errCtxDebugMessage()] ctx', { ctx, handle, outputStrPtr });
    const { componentIdx, writeStrFn } = ctx;
    const globalTable = GlobalErrorContextTable.get();
    const cstate = getOrCreateAsyncState(context.lookup, componentIdx);
    const errCtx = cstate.handles.get(handle);
    if (!errCtx || errCtx.globalRep === undefined) {
        throw new RuntimeError(
            `missing error context (handle [${handle}]) in component idx [${componentIdx}] during debug msg`,
        );
    }
    const msg = globalTable.get(errCtx.globalRep).debugMessage;
    writeStrFn(msg, outputStrPtr);
}

export function errCtxDrop(context, ctx, handle) {
    const { globalTable: GlobalErrorContextTable, RuntimeError } = context;
    debugLog('[errCtxDrop()] ctx', { ctx, handle });
    const { componentIdx, localTableIdx } = ctx;
    const globalTable = GlobalErrorContextTable.get();
    const cstate = getOrCreateAsyncState(context.lookup, componentIdx);
    const errCtx = cstate.handles.get(handle);
    if (!errCtx || errCtx.globalRep === undefined) {
        throw new RuntimeError(
            `missing error context (handle [${handle}]) in component idx [${componentIdx}] during drop`,
        );
    }
    const localErrCtxTable = errCtxGetLocalTable(context.local, componentIdx, localTableIdx);
    if (!localErrCtxTable.get(errCtx.localIdx)) {
        throw new RuntimeError(
            `missing error-context with handle [${handle}] in component [${componentIdx}] during drop`,
        );
    }
    errCtx.refCount -= 1;
    if (errCtx.refCount <= 0) {
        localErrCtxTable.remove(errCtx.localIdx);
        cstate.handles.remove(handle);
    }
    const globalRefCount = errCtxGlobalRefCountAdd(GlobalErrorContextTable, errCtx.globalRep, -1);
    if (globalRefCount === 0) {
        if (errCtx.refCount !== 0) {
            throw new Error('local refCount exceeds global during removal');
        }
        globalTable.remove(errCtx.globalRep);
    }
}

export function errCtxTransfer(context, waitableIdx, srcTableIdx, destTableIdx) {
    const { tables } = context;
    debugLog('[errCtxTransfer()] args', { waitableIdx, srcTableIdx, destTableIdx });
    const { componentIdx: srcComponentIdx } = tables[srcTableIdx];
    const { componentIdx: destComponentIdx } = tables[destTableIdx];
    // Validate the source table even though its entries remain for generated cleanup.
    errCtxGetLocalTable(context.local, srcComponentIdx, srcTableIdx);
    const toTbl = errCtxGetLocalTable(context.local, destComponentIdx, destTableIdx, { upsert: true });
    const srcComponentState = getOrCreateAsyncState(context.lookup, srcComponentIdx);
    const errCtx = srcComponentState.handles.get(waitableIdx);
    if (!errCtx) {
        throw new Error(`missing error context (waitable idx [${waitableIdx}])`);
    }
    if (!errCtx.localIdx) {
        throw new Error('unexpectedly missing local idx from error context object');
    }
    if (!errCtx.globalRep) {
        throw new Error('unexpectedly missing globalRep from error context object');
    }
    errCtx.refCount -= 1;
    // Generated return functions can drop the source after transfer, so retain
    // its entries here, matching the inline ownership/refcount convention.
    const { waitableIdx: newWaitableIdx, localIdx } = errCtxCreateLocalHandle(
        context,
        destComponentIdx,
        toTbl,
        errCtx.globalRep,
    );
    debugLog('[errCtxTransfer()] successfully transferred', {
        dest: {
            errCtxHandle: localIdx,
            errCtxWaitableIdx: newWaitableIdx,
            tableIdx: destTableIdx,
            componentIdx: destComponentIdx,
        },
        src: { errCtxWaitableIdx: waitableIdx, tableIdx: srcTableIdx, componentIdx: srcComponentIdx },
    });
    return newWaitableIdx;
}

export function errCtxGlobalRefCountAdd(GlobalErrorContextTable, globalRep, amount) {
    const globalTable = GlobalErrorContextTable.get();
    const errCtx = globalTable.get(globalRep);
    if (!errCtx) {
        throw new Error(`missing global error-context [${globalRep}] while incrementing refcount`);
    }
    return (errCtx.refCount += amount ?? 1);
}

export function errCtxGetLocalTable(context, componentIdx, tableIdx, opts) {
    const { localTables, RepTable } = context;
    let tables = localTables.get(componentIdx);
    if (!tables) {
        if (opts?.upsert) {
            tables = new Map();
            localTables.set(componentIdx, tables);
        } else {
            throw new Error(
                `missing local error context table for component [${componentIdx}] while getting local table`,
            );
        }
    }
    let errCtxTable = tables.get(tableIdx);
    if (!errCtxTable) {
        if (opts?.upsert) {
            errCtxTable = new RepTable({ target: `component [${componentIdx}] error contexts` });
            tables.set(tableIdx, errCtxTable);
        } else {
            throw new Error(
                `missing table [${tableIdx}] in tables for component [${componentIdx}] while getting local table`,
            );
        }
    }
    return errCtxTable;
}

export function errCtxCreateLocalHandle(context, componentIdx, componentLocalTable, globalRep) {
    const { globalTable: GlobalErrorContextTable } = context;
    const globalTable = GlobalErrorContextTable.get();
    if (!globalTable.contains(globalRep)) {
        throw new Error(`missing global error-context [${globalRep}] during local handle create`);
    }
    const cstate = getOrCreateAsyncState(context.lookup, componentIdx);
    // Insert first, then finalize the local index once both tables allocate it.
    const newErrCtx = { globalRep, refCount: 1 };
    const waitableIdx = cstate.handles.insert(newErrCtx);
    const localIdx = componentLocalTable.insert(waitableIdx);
    newErrCtx.localIdx = localIdx;
    globalTable.get(globalRep).refCount += 1;
    return { waitableIdx, localIdx };
}

export function errCtxReserveGlobalRep(GlobalErrorContextTable, debugMessage, refCount) {
    const globalTable = GlobalErrorContextTable.get();
    const errCtx = { refCount, debugMessage };
    const globalRep = globalTable.insert(errCtx);
    return { globalRep, errCtx };
}
