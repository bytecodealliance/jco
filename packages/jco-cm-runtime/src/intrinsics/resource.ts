import type { ResourceModule } from '../runtime.js';

const RESOURCE_TABLE_FLAG = 1 << 30;

export const tableGet: ResourceModule['tableGet'] = (context, table, handle) => {
    const scope = table[handle << 1];
    const value = table[(handle << 1) + 1];
    const own = (value & RESOURCE_TABLE_FLAG) !== 0;
    const rep = value & ~RESOURCE_TABLE_FLAG;
    // A freed or never allocated index has no entry in this table: its index may
    // belong to another handle kind of the instance, and `value` is undefined
    // past the end of the table.
    if (value === undefined || rep === 0 || (scope & RESOURCE_TABLE_FLAG) !== 0) {
        throw new context.RuntimeError(`unknown handle index ${handle}`);
    }
    return { rep, scope, own };
};
