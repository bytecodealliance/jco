import { checkedEntryValue, RESOURCE_TABLE_FLAG } from './resource-entry.js';
import { readTaskRegister, withCurrentTaskMeta } from './task-context.js';
import { getCurrentTask, createNewCurrentImplicitThread } from './async-task/task-operations.js';
import type { ResourceModule, ResourceHandleTables, ResourceTable } from '../runtime.js';

// Bit 30 of a scope marks a freed entry. An owned entry stores its u32 rep plus 2 ** 32.
// Handle `h` lives at `[h * 2, h * 2 + 1]`: `h << 1` would wrap at 2 ** 31 and alias a live entry.
const RESOURCE_TABLE_OWN = 2 ** 32;
// Canonical ABI `Table.MAX_LENGTH`: `Table.add` traps rather than use a higher index.
const MAX_HANDLE_INDEX = 2 ** 28 - 1;

export const tableGet: ResourceModule['tableGet'] = (context, table, handle) => {
    const scope = table[handle * 2];
    const value = checkedEntryValue(context, table, handle, scope);
    const own = value >= RESOURCE_TABLE_OWN;
    const rep = own ? value - RESOURCE_TABLE_OWN : value;
    return { rep, scope, own };
};

export const tableFlag = RESOURCE_TABLE_FLAG;
export const tableOwn = RESOURCE_TABLE_OWN;
export const initializeHandleIndexSpaces: ResourceModule['initializeHandleIndexSpaces'] = () => new Map();
// Transfers use table IDs to locate the source and destination. Checked synchronous
// leaves already refer to their tables directly, so bindgen omits this registry.
export const initializeHandleTables: ResourceModule['initializeHandleTables'] = () => [];
export const initializeCallBorrows: ResourceModule['initializeCallBorrows'] = () => ({ borrows: [] });
export const initializeCurrentBorrows: ResourceModule['initializeCurrentBorrows'] = () => ({ borrows: [] });
export const initializeResourceScopeCounter: ResourceModule['initializeResourceScopeCounter'] = () => ({ value: 0 });
export const initializeResourceScopeTasks: ResourceModule['initializeResourceScopeTasks'] = () => new Map();
export const initializeScopeId: ResourceModule['initializeScopeId'] = () => ({ value: 0 });

export const getHandleIndexSpace: ResourceModule['getHandleIndexSpace'] = (spaces, key) => {
    let space = spaces.get(key);
    if (space === undefined) {
        space = {
            next: 1,
            free: [],
            alloc() {
                if (this.free.length > 0) {
                    return this.free.pop()!;
                }
                if (this.next > MAX_HANDLE_INDEX) {
                    throw new WebAssembly.RuntimeError('handle table full');
                }
                return this.next++;
            },
            release(index) {
                this.free.push(index);
            },
        };
        spaces.set(key, space);
    }
    return space;
};
export const tableCreateBorrow: ResourceModule['tableCreateBorrow'] = (spaces, table, rep, scopeId) => {
    if (scopeId === undefined) {
        throw new Error('missing scopeId');
    }
    const handle = getHandleIndexSpace(spaces, table._componentIdx ?? table).alloc();
    table[handle * 2] = scopeId;
    table[handle * 2 + 1] = rep >>> 0;
    return handle;
};
// Borrow transfer uses this history to recognize a rep already owned by its
// destination instance. Checked single-instance bindings can skip recording
// it and its per-table Set. Keep the lookup inside this guard: these tables
// have no _createdReps property, and a tracked rep outlives its handle.
export const tableCreateOwn: ResourceModule['tableCreateOwn'] = (spaces, table, rep, trackRep = true) => {
    rep >>>= 0;
    if (trackRep) {
        table._createdReps.add(rep);
    }
    const handle = getHandleIndexSpace(spaces, table._componentIdx ?? table).alloc();
    table[handle * 2] = 0;
    table[handle * 2 + 1] = rep + RESOURCE_TABLE_OWN;
    return handle;
};
export const tableEnsureBorrowDrop: ResourceModule['tableEnsureBorrowDrop'] = (table, handle, scope) => {
    if (table[handle * 2] === scope) {
        throw new TypeError('Resource borrow was not dropped at end of call');
    }
};
export const tableRemove: ResourceModule['tableRemove'] = (context, table, handle) => {
    const scope = table[handle * 2];
    const value = checkedEntryValue(context, table, handle, scope);
    const own = value >= RESOURCE_TABLE_OWN;
    const rep = own ? value - RESOURCE_TABLE_OWN : value;
    if (own && scope !== 0) {
        throw new context.RuntimeError('cannot remove owned resource while borrowed');
    }
    const borrowTask = own ? undefined : context.scopeTasks.get(scope);
    table[handle * 2] = RESOURCE_TABLE_FLAG;
    table[handle * 2 + 1] = 0;
    getHandleIndexSpace(context.indexSpaces, table._componentIdx ?? table).release(handle);
    borrowTask?.removeBorrowedHandle();
    return { rep, scope, own };
};
function getOrCreateTable(tables: ResourceHandleTables, tid: number): ResourceTable {
    let table = tables[tid];
    if (!table) {
        table = Object.assign([RESOURCE_TABLE_FLAG, 0], { _createdReps: new Set<number>() });
        tables[tid] = table;
    }
    return table;
}
export const transferBorrow: ResourceModule['transferBorrow'] = (context, handle, fromTid, toTid) => {
    const fromTable = context.tables[fromTid];
    const { rep, own } = tableGet(context, fromTable, handle);
    const toTable = getOrCreateTable(context.tables, toTid);
    const componentIdx = toTable._componentIdx;
    const meta = componentIdx === undefined ? undefined : readTaskRegister(context.taskLookup.registers, componentIdx);
    const borrowTask = meta ? getCurrentTask(context.taskLookup, componentIdx!, meta.taskID)?.task : undefined;
    if (borrowTask && own) {
        fromTable[handle * 2]++;
        borrowTask.addResourceLender(fromTable, handle);
    }
    if (toTable._createdReps.has(rep)) {
        return rep;
    }
    const newHandle = tableCreateBorrow(
        context.indexSpaces,
        toTable,
        rep,
        borrowTask?.resourceScopeId() ?? context.scope.value,
    );
    if (borrowTask) {
        borrowTask.addBorrowedHandle();
    } else {
        context.callBorrows.borrows.push({ rid: toTid, handle: newHandle });
    }
    return newHandle;
};
export const transferBorrowValidLifting: ResourceModule['transferBorrowValidLifting'] = transferBorrow;
export const transferOwn: ResourceModule['transferOwn'] = (context, handle, fromTid, toTid) => {
    const { rep } = tableRemove(context, context.tables[fromTid], handle);
    return tableCreateOwn(context.indexSpaces, getOrCreateTable(context.tables, toTid), rep);
};
export const callDestructor: ResourceModule['callDestructor'] = (context, { componentIdx, dtor, rep }) => {
    if (context.storeTrap.stopped) {
        return;
    }
    const { task, threadID } = createNewCurrentImplicitThread(context.creation, {
        componentIdx,
        isAsync: false,
        callingWasmExport: true,
        entryFnName: '<resource-drop>',
    });
    task.enterSync();
    return withCurrentTaskMeta(context.registers, {
        taskID: task.id(),
        threadID,
        componentIdx,
        fn: () => {
            try {
                const result = dtor(rep);
                task.resolve([]);
                task.exit();
                return result;
            } catch (error) {
                if (!task.isResolvedState()) {
                    task.setErrored(error);
                    task.reject(error);
                }
                if (!task.isExited()) {
                    task.exit({ skipExclusiveLockCheck: true });
                }
                throw error;
            }
        },
    });
};
