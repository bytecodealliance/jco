import { isPromiseLike } from './core/promises.js';
import type { CoreModule, TaskMeta, TaskRegisters } from '../runtime.js';
import { debugLog } from './core/debug.js';

export const initializeTaskRegisters: CoreModule['initializeTaskRegisters'] = () => ({});

/**
 * Key of the register of a component instance.
 *
 * Host tasks use the component index -1. A negative number is not an array index,
 * so engines look it up as a string-keyed property; a named slot keeps the access
 * that every host call makes on the fast path.
 *
 * @param componentIdx - index of a component instance, or -1 for the host
 * @returns the key of that register in the registers object
 */
export function registerSlot(componentIdx: number): number | 'host' {
    return componentIdx === -1 ? 'host' : componentIdx;
}

function validate(args: TaskMeta) {
    if (!args) {
        throw new TypeError('args missing');
    }
    if (args.taskID === undefined) {
        throw new TypeError('missing task ID');
    }
    if (args.threadID === undefined) {
        throw new TypeError('missing thread ID');
    }
    if (args.componentIdx === undefined) {
        throw new TypeError('missing component idx');
    }
}

/**
 * Read a task register without copying what it holds.
 *
 * A register is only ever replaced, never changed in place, so the runtime reads it
 * directly. The value must not be modified; `getCurrentTaskMeta` hands out a copy
 * to callers outside the runtime.
 *
 * @param registers - the task registers of the store
 * @param componentIdx - index of a component instance, or nothing for the executing task
 * @returns the identity the register holds, if any
 */
export function readTaskRegister(
    registers: TaskRegisters,
    componentIdx?: number | null,
): Readonly<TaskMeta> | undefined {
    const value =
        componentIdx === undefined || componentIdx === null ? registers.current : registers[registerSlot(componentIdx)];
    return value === undefined || value === null ? undefined : value;
}

export const getCurrentTaskMeta: CoreModule['getCurrentTaskMeta'] = (registers, componentIdx) => {
    const value = readTaskRegister(registers, componentIdx);
    return value === undefined ? undefined : { ...value };
};

export const setCurrentTaskMeta: CoreModule['setCurrentTaskMeta'] = (registers, args) => {
    validate(args);
    const { taskID, threadID, componentIdx } = args;
    return (registers.current = registers[registerSlot(componentIdx)] = { taskID, threadID, componentIdx });
};

export function withCurrentTaskMeta<T>(registers: TaskRegisters, args: TaskMeta & { fn: () => T }): T {
    DEBUG: debugLog('[_withGlobalCurrentThreadMeta()] args', args);
    validate(args);
    if (!args.fn) {
        throw new TypeError('missing fn');
    }
    const { taskID, threadID, componentIdx, fn } = args;
    const previous = registers[registerSlot(componentIdx)] ?? null;
    const previousCurrent = registers.current ?? null;
    try {
        registers.current = registers[registerSlot(componentIdx)] = { taskID, threadID, componentIdx };
        return fn();
    } catch (error) {
        DEBUG: debugLog('error while executing sync callee/callback', { ...args, err: error });
        throw error;
    } finally {
        registers[registerSlot(componentIdx)] = previous;
        registers.current = previousCurrent;
    }
}

export function withCurrentTaskMetaAsync<T>(
    registers: TaskRegisters,
    args: TaskMeta & { fn: () => T },
): T | Promise<Awaited<T>> {
    DEBUG: debugLog('[_withGlobalCurrentThreadMetaAsync()] args', args);
    validate(args);
    if (!args.fn) {
        throw new TypeError('missing fn');
    }
    const { taskID, threadID, componentIdx, fn } = args;
    const previous = registers[registerSlot(componentIdx)] ?? null;
    const previousCurrent = registers.current ?? null;
    let result: T;
    try {
        registers.current = registers[registerSlot(componentIdx)] = { taskID, threadID, componentIdx };
        result = fn();
    } catch (error) {
        DEBUG: debugLog('error while executing sync callee/callback', { ...args, err: error });
        registers[registerSlot(componentIdx)] = previous;
        registers.current = previousCurrent;
        throw error;
    }
    if (!isPromiseLike(result)) {
        registers[registerSlot(componentIdx)] = previous;
        registers.current = previousCurrent;
        return result;
    }
    return (async (): Promise<Awaited<T>> => {
        try {
            return (await result) as Awaited<T>;
        } catch (error) {
            DEBUG: debugLog('error while executing async callee/callback', { ...args, err: error });
            throw error;
        } finally {
            // A later thread of the same task may already own either register.
            if (
                registers[registerSlot(componentIdx)]?.threadID === threadID &&
                registers[registerSlot(componentIdx)]?.taskID === taskID
            ) {
                registers[registerSlot(componentIdx)] = null;
            }
            if (registers.current?.threadID === threadID && registers.current?.taskID === taskID) {
                registers.current = null;
            }
        }
    })();
}

export const clearCurrentTaskMeta: CoreModule['clearCurrentTaskMeta'] = async (registers, args) => {
    DEBUG: debugLog('[_clearCurrentTask()] args', args);
    validate(args);
    const { taskID, threadID, componentIdx } = args;
    const meta = registers[registerSlot(componentIdx)];
    if (!meta) {
        throw new Error(`missing current thread meta for component idx [${componentIdx}]`);
    }
    if (meta.threadID !== threadID) {
        throw new Error(`thread ID [${meta.threadID}] != requested ID [${threadID}]`);
    }
    if (meta.taskID !== taskID) {
        throw new Error(`task ID [${meta.taskID}] != requested ID [${taskID}]`);
    }
    if (meta.componentIdx !== componentIdx) {
        throw new Error(`component idx [${meta.componentIdx}] != requested idx [${componentIdx}]`);
    }
    registers[registerSlot(componentIdx)] = null;
    if (registers.current?.threadID === threadID && registers.current?.taskID === taskID) {
        registers.current = null;
    }
};
