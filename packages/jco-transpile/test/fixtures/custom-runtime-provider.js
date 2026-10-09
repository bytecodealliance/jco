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
        const RuntimeError = options.platform?.WebAssembly?.RuntimeError ?? WebAssembly.RuntimeError;
        return {
            abiVersion: 1,
            intrinsics: {
                resource: {
                    tableFlag: 1 << 30,
                    tableGet(table, handle) {
                        tableGetCallCount++;
                        const scope = table[handle << 1];
                        const value = table[(handle << 1) + 1];
                        const own = (value & this.tableFlag) !== 0;
                        const rep = value & ~this.tableFlag;
                        if (rep === 0 || (scope & this.tableFlag) !== 0) {
                            throw new RuntimeError(`unknown handle index ${(handle << 1) + 1}`);
                        }
                        return { rep, scope, own };
                    },
                },
            },
        };
    },
};
