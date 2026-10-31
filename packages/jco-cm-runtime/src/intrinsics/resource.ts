import type { ResourceModule, ResourceHandleTables, ResourceTable } from '../runtime.js';

// Bit 30 of a scope marks a freed entry. An owned entry stores its u32 rep plus 2 ** 32.
const RESOURCE_TABLE_FLAG = 1 << 30;
const RESOURCE_TABLE_OWN = 2 ** 32;

export const tableGet: ResourceModule['tableGet'] = (context, table, handle) => {
    const scope = table[handle << 1];
    const value = table[(handle << 1) + 1];
    const own = value >= RESOURCE_TABLE_OWN;
    const rep = own ? value - RESOURCE_TABLE_OWN : value;
    // A freed or never allocated index has no entry in this table: its index may
    // belong to another handle kind of the instance, and `value` is undefined
    // past the end of the table.
    if (value === undefined || (scope & RESOURCE_TABLE_FLAG) !== 0) {
        throw new context.RuntimeError(`unknown handle index ${handle}`);
    }
    return { rep, scope, own };
};

export const tableFlag = RESOURCE_TABLE_FLAG;
export const tableOwn = RESOURCE_TABLE_OWN;
export const initializeHandleIndexSpaces: ResourceModule['initializeHandleIndexSpaces'] = () => new Map();
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
                return this.free.length > 0 ? this.free.pop()! : this.next++;
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
    table[handle << 1] = scopeId;
    table[(handle << 1) + 1] = rep >>> 0;
    return handle;
};
export const tableCreateOwn: ResourceModule['tableCreateOwn'] = (spaces, table, rep) => {
    rep >>>= 0;
    table._createdReps.add(rep);
    const handle = getHandleIndexSpace(spaces, table._componentIdx ?? table).alloc();
    table[handle << 1] = 0;
    table[(handle << 1) + 1] = rep + RESOURCE_TABLE_OWN;
    return handle;
};
export const tableEnsureBorrowDrop: ResourceModule['tableEnsureBorrowDrop'] = (table, handle, scope) => {
    if (table[handle << 1] === scope) {
        throw new TypeError('Resource borrow was not dropped at end of call');
    }
};
export const tableRemove: ResourceModule['tableRemove'] = (context, table, handle) => {
    const scope = table[handle << 1];
    const value = table[(handle << 1) + 1];
    const own = value >= RESOURCE_TABLE_OWN;
    const rep = own ? value - RESOURCE_TABLE_OWN : value;
    if (value === undefined || (scope & RESOURCE_TABLE_FLAG) !== 0) {
        throw new context.RuntimeError('unknown handle index ' + handle);
    }
    if (own && scope !== 0) {
        throw new context.RuntimeError('cannot remove owned resource while borrowed');
    }
    const borrowTask = own ? undefined : context.scopeTasks.get(scope);
    table[handle << 1] = RESOURCE_TABLE_FLAG;
    table[(handle << 1) + 1] = 0;
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
    const borrowTask = componentIdx === undefined ? undefined : context.getCurrentTask?.(componentIdx);
    if (borrowTask && own) {
        fromTable[handle << 1]++;
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
    if (!context.createTask || !context.withTask) {
        throw new TypeError('resource destructors require resourceTasks.createTask and resourceTasks.withTask');
    }
    const { task, threadID } = context.createTask({
        componentIdx,
        isAsync: false,
        callingWasmExport: true,
        entryFnName: '<resource-drop>',
    });
    task.enterSync();
    return context.withTask({
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
