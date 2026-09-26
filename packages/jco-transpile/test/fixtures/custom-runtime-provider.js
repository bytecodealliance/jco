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
    abiVersion: defaultRuntime.abiVersion,
    create(options) {
        runtimeCreateCallCount++;
        const instance = defaultRuntime.create(options);
        const resource = instance.intrinsics.resource;
        return {
            ...instance,
            intrinsics: {
                ...instance.intrinsics,
                resource: {
                    ...resource,
                    tableGet(...args) {
                        tableGetCallCount++;
                        return resource.tableGet(...args);
                    },
                },
            },
        };
    },
};
