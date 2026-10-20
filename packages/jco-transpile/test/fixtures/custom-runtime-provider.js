import { runtime as defaultRuntime } from '../../../jco-cm-runtime/dist/index.js';

export let tableGetCallCount = 0;
export let runtimeCreateCallCount = 0;

export function resetTableGetCallCount() {
    tableGetCallCount = 0;
}

export function resetRuntimeCreateCallCount() {
    runtimeCreateCallCount = 0;
}

export const runtime = {
    apiVersion: 1,
    create(options) {
        if (options.requestedApiVersion !== 1) {
            throw new Error(`unsupported JavaScript CM runtime API ${options.requestedApiVersion}`);
        }
        runtimeCreateCallCount++;
        const RuntimeError = options.platform?.WebAssembly?.RuntimeError ?? WebAssembly.RuntimeError;
        const defaults = defaultRuntime.create(options);
        return {
            apiVersion: 1,
            intrinsics: {
                ...defaults.intrinsics,
                resource: {
                    tableFlag: 1 << 30,
                    tableGet(table, handle) {
                        tableGetCallCount++;
                        const scope = table[handle << 1];
                        const value = table[(handle << 1) + 1];
                        const own = (value & this.tableFlag) !== 0;
                        const rep = value & ~this.tableFlag;
                        if (value === undefined || rep === 0 || (scope & this.tableFlag) !== 0) {
                            throw new RuntimeError(`unknown handle index ${handle}`);
                        }
                        return { rep, scope, own };
                    },
                },
            },
        };
    },
};
