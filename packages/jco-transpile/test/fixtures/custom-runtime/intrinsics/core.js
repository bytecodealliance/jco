import { checkMayLeave, recordTrap, getOrCreateAsyncState } from './component.js';
export { debugLog } from './core-debug.js';
export { initializeRepTableClass } from './rep-table.js';
export { initializeManagedBufferClass, initializeBufferManagerClass } from './buffers.js';
export {
    initializeTaskRegisters,
    getCurrentTaskMeta,
    setCurrentTaskMeta,
    withCurrentTaskMeta,
    withCurrentTaskMetaAsync,
    clearCurrentTaskMeta,
} from './task-context.js';
export const i32Min = -2_147_483_648;
export const i32Max = 2_147_483_647;
export const initializeAsyncDeterminism = (mode) => mode;
export const initializeAsyncFunctionConstructor = () => (async () => {}).constructor;
export const initializeRuntimeErrorConstructor = (platform) => platform.RuntimeError;
export const initializeReadableStream = (chosen) => {
    if (!chosen) {
        throw new Error('builtin stream class [ReadableStream] is not available');
    }
    return chosen;
};
export const initializeComponentErrorClass = () => {
    class ComponentError extends Error {
        constructor(value) {
            const enumerable = typeof value !== 'string';
            super(enumerable ? `${String(value)} (see error.payload)` : value);
            Object.defineProperty(this, 'payload', { value, enumerable });
        }
    }
    return ComponentError;
};
export const initializeBufferManager = (BufferManager) => new BufferManager();
export const initializeFactTrapMessages = (messages) => messages;
export const initializeSymbolCabiDispose = () => Symbol.for('cabiDispose');
export const initializeSymbolCabiLower = () => Symbol.for('cabiLower');
export const initializeSymbolResourceHandle = () => Symbol('handle');
export const initializeSymbolResourceRep = () => Symbol.for('cabiRep');
export const initializeSymbolDispose = () => Symbol.dispose || Symbol.for('dispose');
export const initializeSymbolAsyncIterator = () => Symbol.asyncIterator;
export const initializeSymbolIterator = () => Symbol.iterator;
export const initializeEndianness = () => new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
export const initializeHasOwnProperty = () => Object.prototype.hasOwnProperty;
export const initializeAsyncEventCodes = () => ({
    NONE: 0,
    SUBTASK: 1,
    STREAM_READ: 2,
    STREAM_WRITE: 3,
    FUTURE_READ: 4,
    FUTURE_WRITE: 5,
    TASK_CANCELLED: 6,
});
export const initializeComponentMemoryMap = () => new Map();
export const initializeConditionalSuspendingWasm = () => ({});
export const initializeFileCompileCache = (nodejsCompat) => {
    const host = globalThis;
    return { node: !!(nodejsCompat && host.process?.versions?.node), fs: undefined };
};
export const coinFlip = () => Math.random() > 0.5;
// Preserve the existing range-only check, including fractional values.
export const typeCheckValidI32 = (value) => typeof value === 'number' && value >= i32Min && value <= i32Max;
export const typeCheckAsyncFn = (constructor, value) => value instanceof constructor;
export const base64Compile = (context, encoded) => {
    const host = globalThis;
    return context.WebAssembly.compile(
        context.nodejsCompat && typeof host.Buffer !== 'undefined'
            ? host.Buffer.from(encoded, 'base64')
            : Uint8Array.from(atob(encoded), (byte) => byte.charCodeAt(0)),
    );
};
async function fetchWithNode(context, url) {
    if (context.fileCache.node) {
        context.fileCache.fs = context.fileCache.fs || (await import('node:fs/promises'));
        return context.WebAssembly.compile(await context.fileCache.fs.readFile(url));
    }
    return fetch(url).then(context.WebAssembly.compileStreaming);
}
export const fetchCompile = (context, url) =>
    context.nodejsCompat ? fetchWithNode(context, url) : fetch(url).then(context.WebAssembly.compileStreaming);
export const instantiateCore = (platform, module, imports) => platform.instantiate(module, imports);
export const clampGuest = (value, min, max) => {
    if (value < min || value > max) {
        throw new TypeError(`must be between ${min} and ${max}`);
    }
    return value;
};
export const getErrorPayload = (hasOwnProperty, error) => {
    if (error && hasOwnProperty.call(error, 'payload')) {
        return error.payload;
    }
    if (error instanceof Error) {
        throw error;
    }
    return error;
};
export const getErrorPayloadString = (hasOwnProperty, error) => {
    if (error && hasOwnProperty.call(error, 'payload')) {
        return error.payload;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return error;
};
export const finalizationRegistryCreate = (cleanup) => {
    if (typeof FinalizationRegistry === 'undefined') {
        return { unregister() {} };
    }
    return new FinalizationRegistry(cleanup);
};
export const disposeHostValue = (disposeSymbol, value, disposeFn) => {
    if (!disposeFn) {
        if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
            return;
        }
        const disposable = value;
        if (typeof Symbol.asyncDispose === 'symbol' && typeof disposable[Symbol.asyncDispose] === 'function') {
            disposeFn = disposable[Symbol.asyncDispose];
        } else if (typeof disposable[disposeSymbol] === 'function') {
            disposeFn = disposable[disposeSymbol];
        } else {
            return;
        }
    }
    const dispose = disposeFn;
    const report = (error) => console.error('[jco] error while disposing discarded host value', error);
    queueMicrotask(() => {
        try {
            const result = dispose.call(value);
            if (result && typeof result.then === 'function') {
                result.then(undefined, report);
            }
        } catch (error) {
            report(error);
        }
    });
};
export const throwInvalidBool = () => {
    throw new TypeError('invalid variant discriminant for bool');
};
export const throwUninitialized = () => {
    throw new TypeError('Wasm uninitialized use `await $init` first');
};
export { promiseWithResolvers } from './core-promises.js';
export const registerMemory = (map, args) => {
    const { componentIdx, memory, memoryIdx } = args ?? {};
    if (componentIdx === undefined) {
        throw new TypeError('missing component idx');
    }
    if (memory === undefined && memoryIdx === undefined) {
        throw new TypeError('missing both memory & memory idx');
    }
    let inner = map.get(componentIdx);
    if (!inner) {
        inner = {};
        map.set(componentIdx, inner);
    }
    inner[String(memoryIdx)] = { memory, memoryIdx, componentIdx };
};
export function lookupMemories(map, args) {
    const { componentIdx } = args ?? {};
    if (args.componentIdx === undefined) {
        throw new TypeError('missing component idx');
    }
    const metas = map.get(componentIdx);
    if (!metas) {
        return [];
    }
    return args.memoryIdx === undefined ? Object.values(metas) : metas[args.memoryIdx]?.memory;
}
export const suspendingImport = (
    context,
    componentIdx,
    fn,
    syncOnly = false,
    switchesTask = false,
    convertsRangeErrors = true,
    callsHost = false,
) => {
    const { registers: currentTaskMeta, RuntimeError } = context;
    return function (...args) {
        checkMayLeave(context.mayLeave, componentIdx);
        const saved = currentTaskMeta[componentIdx] ?? null;
        const savedTask = saved
            ? context.getCurrentThread(saved.componentIdx, saved.threadID, saved.taskID)?.task
            : null;
        const mayBlock = savedTask ? (savedTask.mayBlock() ?? context.currentTaskMayBlock() !== 0) : false;
        if (!saved && !mayBlock && !callsHost) {
            throw new RuntimeError('cannot block a synchronous task before returning');
        }
        if (syncOnly || !mayBlock) {
            let result;
            try {
                result = fn.apply(null, args);
            } catch (error) {
                currentTaskMeta[componentIdx] = saved;
                if (!switchesTask) {
                    currentTaskMeta.current = saved;
                }
                throw recordTrap(context.traps, componentIdx, error, convertsRangeErrors);
            }
            currentTaskMeta[componentIdx] = saved;
            if (!switchesTask) {
                currentTaskMeta.current = saved;
            }
            if (
                result !== null &&
                (typeof result === 'object' || typeof result === 'function') &&
                typeof result.then === 'function'
            ) {
                Promise.resolve(result).catch(() => {});
                throw new RuntimeError('cannot block a synchronous task before returning');
            }
            return result;
        }
        // Invocation stays inside the async function to preserve JSPI scheduling.
        return (async () => {
            try {
                const result = await fn.apply(null, args);
                getOrCreateAsyncState(context.states, componentIdx).throwIfInterrupted();
                return result;
            } catch (error) {
                throw recordTrap(context.traps, componentIdx, error, convertsRangeErrors);
            } finally {
                currentTaskMeta[componentIdx] = saved;
                if (!switchesTask) {
                    currentTaskMeta.current = saved;
                }
            }
        })();
    };
};
function instantiateTrampoline(platform, module, fast, slow) {
    return new platform.Instance(module, {
        '': { fast, slow: new platform.Suspending(slow) },
    }).exports.run;
}
export const conditionalSuspending1I32ToI32 = (context, fast, slow) =>
    instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending1I32ToI32, fast, slow);
export const conditionalSuspending2I32ToI32 = (context, fast, slow) =>
    instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending2I32ToI32, fast, slow);
export const conditionalSuspending3I32ToI32 = (context, fast, slow) =>
    instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending3I32ToI32, fast, slow);
export const conditionalSuspending3I32ToVoid = (context, fast, slow) =>
    instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending3I32ToVoid, fast, slow);
