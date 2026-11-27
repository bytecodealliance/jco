import type { ResourceTableGetContext } from '../runtime.js';

export const RESOURCE_TABLE_FLAG = 1 << 30;

/** Read a live entry from this table. A hole can belong to another handle kind. */
export function checkedEntryValue(
    context: ResourceTableGetContext,
    table: ArrayLike<number>,
    handle: number,
    scope: number,
): number {
    const value = table[handle * 2 + 1];
    if (value === undefined || (scope & RESOURCE_TABLE_FLAG) !== 0) {
        throw new context.RuntimeError(`unknown handle index ${handle >>> 0}`);
    }
    return value;
}

/** The lower 32 bits hold the complete rep for both owned and borrowed handles. */
export function tableRep(context: ResourceTableGetContext, table: ArrayLike<number>, handle: number): number {
    return checkedEntryValue(context, table, handle, table[handle * 2]) >>> 0;
}
