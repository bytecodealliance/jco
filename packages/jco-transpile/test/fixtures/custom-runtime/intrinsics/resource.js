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
