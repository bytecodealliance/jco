import { debugLog } from './core-debug.js';

export const initializeTaskRegisters = () => ({});

function validate(args) {
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

export const getCurrentTaskMeta = (registers, componentIdx) => {
    const value = componentIdx === undefined || componentIdx === null ? registers.current : registers[componentIdx];
    return value === undefined || value === null ? undefined : { ...value };
};

export const setCurrentTaskMeta = (registers, args) => {
    validate(args);
    const { taskID, threadID, componentIdx } = args;
    return (registers.current = registers[componentIdx] = { taskID, threadID, componentIdx });
};

export function withCurrentTaskMeta(registers, args) {
    validate(args);
    if (!args.fn) {
        throw new TypeError('missing fn');
    }
    const { taskID, threadID, componentIdx, fn } = args;
    const previous = registers[componentIdx] ?? null;
    const previousCurrent = registers.current ?? null;
    try {
        registers.current = registers[componentIdx] = { taskID, threadID, componentIdx };
        return fn();
    } catch (error) {
        debugLog('error while executing sync callee/callback', { ...args, err: error });
        throw error;
    } finally {
        registers[componentIdx] = previous;
        registers.current = previousCurrent;
    }
}

export function withCurrentTaskMetaAsync(registers, args) {
    validate(args);
    if (!args.fn) {
        throw new TypeError('missing fn');
    }
    const { taskID, threadID, componentIdx, fn } = args;
    const previous = registers[componentIdx] ?? null;
    const previousCurrent = registers.current ?? null;
    let result;
    try {
        registers.current = registers[componentIdx] = { taskID, threadID, componentIdx };
        result = fn();
    } catch (error) {
        registers[componentIdx] = previous;
        registers.current = previousCurrent;
        throw error;
    }
    if (
        result === null ||
        (typeof result !== 'object' && typeof result !== 'function') ||
        typeof result.then !== 'function'
    ) {
        registers[componentIdx] = previous;
        registers.current = previousCurrent;
        return result;
    }
    return (async () => {
        try {
            return await result;
        } catch (error) {
            debugLog('error while executing async callee/callback', { ...args, err: error });
            throw error;
        } finally {
            // A later thread of the same task may already own either register.
            if (registers[componentIdx]?.threadID === threadID && registers[componentIdx]?.taskID === taskID) {
                registers[componentIdx] = null;
            }
            if (registers.current?.threadID === threadID && registers.current?.taskID === taskID) {
                registers.current = null;
            }
        }
    })();
}

export const clearCurrentTaskMeta = async (registers, args) => {
    validate(args);
    const { taskID, threadID, componentIdx } = args;
    const meta = registers[componentIdx];
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
    registers[componentIdx] = null;
    if (registers.current?.threadID === threadID && registers.current?.taskID === taskID) {
        registers.current = null;
    }
};
