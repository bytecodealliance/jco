export let tableGetCallCount = 0;
export let runtimeCreateCallCount = 0;

export function resetTableGetCallCount() {
    tableGetCallCount = 0;
}

export function resetRuntimeCreateCallCount() {
    runtimeCreateCallCount = 0;
}

export const runtime = {
    abiVersion: 1,
    create(options) {
        if (options.requestedAbiVersion !== 1) {
            throw new Error(`unsupported runtime ABI ${options.requestedAbiVersion}`);
        }
        runtimeCreateCallCount++;
        return {
            abiVersion: 1,
            intrinsics: {
                resource: {
                    tableGet(table, handle) {
                        tableGetCallCount++;
                        const flag = 1 << 30;
                        const scope = table[handle << 1];
                        const value = table[(handle << 1) + 1];
                        const own = (value & flag) !== 0;
                        const rep = value & ~flag;
                        if (rep === 0 || (scope & flag) !== 0) {
                            throw new WebAssembly.RuntimeError(`unknown handle index ${(handle << 1) + 1}`);
                        }
                        return { rep, scope, own };
                    },
                },
            },
        };
    },
};
