// Observe provider calls while using the built runtime for resource semantics.
import { tableGet as defaultTableGet } from './resource-default.js';
export * from './resource-default.js';
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
    return defaultTableGet(context, table, handle);
}
