import type { ResourceIntrinsics, RuntimeErrorConstructor } from '../types.js';

const RESOURCE_TABLE_FLAG = 1 << 30;

export function createResourceIntrinsics(RuntimeError: RuntimeErrorConstructor): ResourceIntrinsics {
    return {
        tableGet(table, handle) {
            const scope = table[handle << 1];
            const value = table[(handle << 1) + 1];
            const own = (value & RESOURCE_TABLE_FLAG) !== 0;
            const rep = value & ~RESOURCE_TABLE_FLAG;
            if (rep === 0 || (scope & RESOURCE_TABLE_FLAG) !== 0) {
                throw new RuntimeError(`unknown handle index ${(handle << 1) + 1}`);
            }
            return { rep, scope, own };
        },
    };
}
