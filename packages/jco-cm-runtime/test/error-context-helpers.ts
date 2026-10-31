// Test-only assembly; production exports take the actual narrow context directly.
import * as operations from '../src/intrinsics/error-context.js';
import { create as createWaitable } from './waitable-test-helpers.js';

export function create(options: Parameters<typeof createWaitable>[0] = {}) {
    const selected = createWaitable(options);
    const { core, lookup } = selected;
    const GlobalErrorContextTable = operations.initializeGlobalErrorContextTableClass(core.RepTable);
    const tables = operations.initializeErrorContextTableRegistrations();
    const localTables = operations.initializeLocalErrorContextTables();
    const local = { localTables, RepTable: core.RepTable };
    const handles = { RuntimeError: core.RuntimeError, globalTable: GlobalErrorContextTable, lookup };
    const context = { ...handles, local };
    const transfer = { ...context, tables };
    const errorContext = {
        GlobalErrorContextTable,
        tables,
        localTables,
        errCtxNew: (...args: Parameters<typeof operations.errCtxNew> extends [unknown, ...infer A] ? A : never) =>
            operations.errCtxNew(context, ...args),
        errCtxDrop: (...args: Parameters<typeof operations.errCtxDrop> extends [unknown, ...infer A] ? A : never) =>
            operations.errCtxDrop(context, ...args),
        errCtxDebugMessage: (
            ...args: Parameters<typeof operations.errCtxDebugMessage> extends [unknown, ...infer A] ? A : never
        ) => operations.errCtxDebugMessage(handles, ...args),
        errCtxTransfer: (handle: number, src: number, dest: number) =>
            operations.errCtxTransfer(transfer, handle, src, dest),
        errCtxGetLocalTable: (idx: number, table: number, options?: { upsert?: boolean }) =>
            operations.errCtxGetLocalTable(local, idx, table, options),
        errCtxGlobalRefCountAdd: (rep: number, amount?: number | null) =>
            operations.errCtxGlobalRefCountAdd(GlobalErrorContextTable, rep, amount),
        errCtxCreateLocalHandle: (
            ...args: Parameters<typeof operations.errCtxCreateLocalHandle> extends [unknown, ...infer A] ? A : never
        ) => operations.errCtxCreateLocalHandle(handles, ...args),
        errCtxReserveGlobalRep: (message: string, count: number) =>
            operations.errCtxReserveGlobalRep(GlobalErrorContextTable, message, count),
    };
    return { ...selected, errorContext };
}
