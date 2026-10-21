export let tableGetCallCount = 0;
export let runtimeCreateCallCount = 0;

export function resetTableGetCallCount() {
    tableGetCallCount = 0;
}

export function resetRuntimeCreateCallCount() {
    runtimeCreateCallCount = 0;
}

export const runtime = {
    apiVersion: 2,
    create(options) {
        if (options.requestedApiVersion !== 2) {
            throw new Error(`unsupported JavaScript CM runtime API ${options.requestedApiVersion}`);
        }
        runtimeCreateCallCount++;
        const RuntimeError = options.platform?.WebAssembly?.RuntimeError ?? WebAssembly.RuntimeError;
        return {
            apiVersion: 2,
            intrinsics: {
                resource: {
                    tableFlag: 1 << 30,
                    tableOwn: 2 ** 32,
                    tableGet(table, handle) {
                        tableGetCallCount++;
                        const scope = table[handle << 1];
                        const value = table[(handle << 1) + 1];
                        const own = value >= this.tableOwn;
                        const rep = own ? value - this.tableOwn : value;
                        if (value === undefined || (scope & this.tableFlag) !== 0) {
                            throw new RuntimeError(`unknown handle index ${handle}`);
                        }
                        return { rep, scope, own };
                    },
                },
            },
        };
    },
};
