import type { ResourceIntrinsics, RuntimeErrorConstructor } from '../types.js';

// Bit 30 of a scope marks a freed entry. An owned entry stores its u32 rep plus 2 ** 32.
const RESOURCE_TABLE_FLAG = 1 << 30;
const RESOURCE_TABLE_OWN = 2 ** 32;

export function createResourceIntrinsics(RuntimeError: RuntimeErrorConstructor): ResourceIntrinsics {
    return {
        tableGet(table, handle) {
            const scope = table[handle << 1];
            const value = table[(handle << 1) + 1];
            const own = value >= RESOURCE_TABLE_OWN;
            const rep = own ? value - RESOURCE_TABLE_OWN : value;
            // A freed or never allocated index has no entry in this table: its index may
            // belong to another handle kind of the instance, and `value` is undefined
            // past the end of the table.
            // Zero reps are valid; freed entries are identified by the scope flag.
            if (value === undefined || (scope & RESOURCE_TABLE_FLAG) !== 0) {
                throw new RuntimeError(`unknown handle index ${handle}`);
            }
            return { rep, scope, own };
        },
    };
}
