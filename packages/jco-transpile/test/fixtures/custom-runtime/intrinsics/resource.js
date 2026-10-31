// Independent implementation, with observations for context/lifetime conformance tests.
export let tableGetCallCount = 0;
export const contexts = new Set();
export const tables = new Map();

export function resetTableGetCallCount() {
    tableGetCallCount = 0;
    contexts.clear();
    tables.clear();
}

export function tableGet(context, table, handle) {
    if (this !== undefined) {
        throw new Error('named operations must not require a receiver');
    }
    if (Object.keys(context).join() !== 'RuntimeError' || typeof context.RuntimeError !== 'function') {
        throw new Error('tableGet requires exactly the documented trap capability');
    }
    tableGetCallCount++;
    contexts.add(context);
    if (!tables.has(context)) {
        tables.set(context, new Set());
    }
    tables.get(context).add(table);
    const scope = table[handle * 2];
    const value = table[handle * 2 + 1];
    const flag = 2 ** 30;
    const own = value >= 2 ** 32;
    const rep = own ? value - 2 ** 32 : value;
    if (value === undefined || (scope & flag) !== 0) {
        throw new context.RuntimeError(`unknown handle index ${handle}`);
    }
    return { rep, scope, own };
}

// Independent API-v2 resource implementation; internal calls have no namespace receiver.
const RESOURCE_TABLE_FLAG = 1 << 30;
const readTable = (context, table, handle) => {
    const scope = table[handle << 1];
    const value = table[(handle << 1) + 1];
    const own = value >= 2 ** 32;
    const rep = own ? value - 2 ** 32 : value;
    // A freed or never allocated index has no entry in this table: its index may
    // belong to another handle kind of the instance, and `value` is undefined
    // past the end of the table.
    if (value === undefined || (scope & RESOURCE_TABLE_FLAG) !== 0) {
        throw new context.RuntimeError(`unknown handle index ${handle}`);
    }
    return { rep, scope, own };
};
export const tableFlag = RESOURCE_TABLE_FLAG;
export const tableOwn = 2 ** 32;
export const initializeHandleIndexSpaces = () => new Map();
export const initializeHandleTables = () => [];
export const initializeCallBorrows = () => ({ borrows: [] });
export const initializeCurrentBorrows = () => ({ borrows: [] });
export const initializeResourceScopeCounter = () => ({ value: 0 });
export const initializeResourceScopeTasks = () => new Map();
export const initializeScopeId = () => ({ value: 0 });
export const getHandleIndexSpace = (spaces, key) => {
    let space = spaces.get(key);
    if (space === undefined) {
        space = {
            next: 1,
            free: [],
            alloc() {
                return this.free.length > 0 ? this.free.pop() : this.next++;
            },
            release(index) {
                this.free.push(index);
            },
        };
        spaces.set(key, space);
    }
    return space;
};
export const tableCreateBorrow = (spaces, table, rep, scopeId) => {
    if (scopeId === undefined) {
        throw new Error('missing scopeId');
    }
    const handle = getHandleIndexSpace(spaces, table._componentIdx ?? table).alloc();
    table[handle << 1] = scopeId;
    table[(handle << 1) + 1] = rep >>> 0;
    return handle;
};
export const tableCreateOwn = (spaces, table, rep) => {
    rep >>>= 0;
    table._createdReps.add(rep);
    const handle = getHandleIndexSpace(spaces, table._componentIdx ?? table).alloc();
    table[handle << 1] = 0;
    table[(handle << 1) + 1] = rep + 2 ** 32;
    return handle;
};
export const tableEnsureBorrowDrop = (table, handle, scope) => {
    if (table[handle << 1] === scope) {
        throw new TypeError('Resource borrow was not dropped at end of call');
    }
};
export const tableRemove = (context, table, handle) => {
    const scope = table[handle << 1];
    const value = table[(handle << 1) + 1];
    const own = value >= 2 ** 32;
    const rep = own ? value - 2 ** 32 : value;
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
function getOrCreateTable(tables, tid) {
    let table = tables[tid];
    if (!table) {
        table = Object.assign([RESOURCE_TABLE_FLAG, 0], { _createdReps: new Set() });
        tables[tid] = table;
    }
    return table;
}
export const transferBorrow = (context, handle, fromTid, toTid) => {
    const fromTable = context.tables[fromTid];
    const { rep, own } = readTable(context, fromTable, handle);
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
export const transferBorrowValidLifting = transferBorrow;
export const transferOwn = (context, handle, fromTid, toTid) => {
    const { rep } = tableRemove(context, context.tables[fromTid], handle);
    return tableCreateOwn(context.indexSpaces, getOrCreateTable(context.tables, toTid), rep);
};
export const callDestructor = (context, { componentIdx, dtor, rep }) => {
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
