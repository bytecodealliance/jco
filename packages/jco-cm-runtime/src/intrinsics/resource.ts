import type { ResourceIntrinsics, RuntimeErrorConstructor } from '../types.js';

const RESOURCE_TABLE_FLAG = 1 << 30;

export function createResourceIntrinsics(RuntimeError: RuntimeErrorConstructor): ResourceIntrinsics {
    return {
        tableGet(table, handle) {
            const scope = table[handle << 1];
            const value = table[(handle << 1) + 1];
            const own = (value & RESOURCE_TABLE_FLAG) !== 0;
            const rep = value & ~RESOURCE_TABLE_FLAG;
            // A freed or never allocated index has no entry in this table: its index may
            // belong to another handle kind of the instance, and `value` is undefined
            // past the end of the table.
            if (value === undefined || rep === 0 || (scope & RESOURCE_TABLE_FLAG) !== 0) {
                throw new RuntimeError(`unknown handle index ${handle}`);
            }
            return { rep, scope, own };
        },
    };
}
