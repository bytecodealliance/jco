import type {
    CoreModule,
    ComponentErrorConstructor,
    ComponentMemoryMap,
    MemoryMeta,
    RuntimeMemory,
    FetchCompileContext,
    ConditionalTrampoline,
    ConditionalSlowFn,
    ConditionalSuspendingPlatform,
} from '../runtime.js';
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
export const initializeAsyncDeterminism: CoreModule['initializeAsyncDeterminism'] = (mode) => mode;
export const initializeAsyncFunctionConstructor: CoreModule['initializeAsyncFunctionConstructor'] = () =>
    (async () => {}).constructor;
export const initializeRuntimeErrorConstructor: CoreModule['initializeRuntimeErrorConstructor'] = (platform) =>
    platform.RuntimeError;
export const initializeReadableStream: CoreModule['initializeReadableStream'] = (chosen) => {
    if (!chosen) {
        throw new Error('builtin stream class [ReadableStream] is not available');
    }
    return chosen;
};
export const initializeComponentErrorClass: CoreModule['initializeComponentErrorClass'] = () => {
    class ComponentError extends Error {
        declare readonly payload: unknown;
        constructor(value: unknown) {
            const enumerable = typeof value !== 'string';
            super(enumerable ? `${String(value)} (see error.payload)` : value);
            Object.defineProperty(this, 'payload', { value, enumerable });
        }
    }
    return ComponentError satisfies ComponentErrorConstructor;
};
export const initializeBufferManager: CoreModule['initializeBufferManager'] = (BufferManager) => new BufferManager();
export const initializeFactTrapMessages: CoreModule['initializeFactTrapMessages'] = (messages) => messages;
export const initializeSymbolCabiDispose: CoreModule['initializeSymbolCabiDispose'] = () => Symbol.for('cabiDispose');
export const initializeSymbolCabiLower: CoreModule['initializeSymbolCabiLower'] = () => Symbol.for('cabiLower');
export const initializeSymbolResourceHandle: CoreModule['initializeSymbolResourceHandle'] = () => Symbol('handle');
export const initializeSymbolResourceRep: CoreModule['initializeSymbolResourceRep'] = () => Symbol.for('cabiRep');
export const initializeSymbolDispose: CoreModule['initializeSymbolDispose'] = () =>
    Symbol.dispose || Symbol.for('dispose');
export const initializeSymbolAsyncIterator: CoreModule['initializeSymbolAsyncIterator'] = () => Symbol.asyncIterator;
export const initializeSymbolIterator: CoreModule['initializeSymbolIterator'] = () => Symbol.iterator;
export const initializeEndianness: CoreModule['initializeEndianness'] = () =>
    new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
export const initializeHasOwnProperty: CoreModule['initializeHasOwnProperty'] = () => Object.prototype.hasOwnProperty;
export const initializeAsyncEventCodes: CoreModule['initializeAsyncEventCodes'] = () => ({
    NONE: 0,
    SUBTASK: 1,
    STREAM_READ: 2,
    STREAM_WRITE: 3,
    FUTURE_READ: 4,
    FUTURE_WRITE: 5,
    TASK_CANCELLED: 6,
});
export const initializeComponentMemoryMap: CoreModule['initializeComponentMemoryMap'] = () => new Map();
export const initializeConditionalSuspendingWasm: CoreModule['initializeConditionalSuspendingWasm'] = () => ({});
export const initializeFileCompileCache: CoreModule['initializeFileCompileCache'] = (nodejsCompat) => {
    const host = globalThis as typeof globalThis & { process?: { versions?: { node?: string } } };
    return { node: !!(nodejsCompat && host.process?.versions?.node), fs: undefined };
};
export const coinFlip: CoreModule['coinFlip'] = () => Math.random() > 0.5;
// Preserve the existing range-only check, including fractional values.
export const typeCheckValidI32: CoreModule['typeCheckValidI32'] = (value) =>
    typeof value === 'number' && value >= i32Min && value <= i32Max;
export const typeCheckAsyncFn: CoreModule['typeCheckAsyncFn'] = (constructor, value) => value instanceof constructor;
export const base64Compile: CoreModule['base64Compile'] = (context, encoded) => {
    const host = globalThis as typeof globalThis & {
        Buffer?: { from(value: string, encoding: string): Uint8Array<ArrayBuffer> };
    };
    return context.WebAssembly.compile(
        context.nodejsCompat && typeof host.Buffer !== 'undefined'
            ? host.Buffer.from(encoded, 'base64')
            : Uint8Array.from(atob(encoded), (byte) => byte.charCodeAt(0)),
    );
};
async function fetchWithNode(context: FetchCompileContext, url: URL) {
    if (context.fileCache.node) {
        context.fileCache.fs = context.fileCache.fs || (await import('node:fs/promises'));
        return context.WebAssembly.compile(await context.fileCache.fs.readFile(url));
    }
    return fetch(url).then(context.WebAssembly.compileStreaming);
}
export const fetchCompile: CoreModule['fetchCompile'] = (context, url) =>
    context.nodejsCompat ? fetchWithNode(context, url) : fetch(url).then(context.WebAssembly.compileStreaming);
export const instantiateCore: CoreModule['instantiateCore'] = (platform, module, imports) =>
    platform.instantiate(module, imports);
export const clampGuest: CoreModule['clampGuest'] = (value, min, max) => {
    if (value < min || value > max) {
        throw new TypeError(`must be between ${min} and ${max}`);
    }
    return value;
};
export const getErrorPayload: CoreModule['getErrorPayload'] = (hasOwnProperty, error) => {
    if (error && hasOwnProperty.call(error, 'payload')) {
        return (error as { payload: unknown }).payload;
    }
    if (error instanceof Error) {
        throw error;
    }
    return error;
};
export const getErrorPayloadString: CoreModule['getErrorPayloadString'] = (hasOwnProperty, error) => {
    if (error && hasOwnProperty.call(error, 'payload')) {
        return (error as { payload: unknown }).payload;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return error;
};
export const finalizationRegistryCreate: CoreModule['finalizationRegistryCreate'] = (cleanup) => {
    if (typeof FinalizationRegistry === 'undefined') {
        return { unregister() {} };
    }
    return new FinalizationRegistry(cleanup);
};
export const disposeHostValue: CoreModule['disposeHostValue'] = (disposeSymbol, value, disposeFn) => {
    if (!disposeFn) {
        if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
            return;
        }
        const disposable = value as { [key: symbol]: unknown };
        if (typeof Symbol.asyncDispose === 'symbol' && typeof disposable[Symbol.asyncDispose] === 'function') {
            disposeFn = disposable[Symbol.asyncDispose] as (this: unknown) => unknown;
        } else if (typeof disposable[disposeSymbol] === 'function') {
            disposeFn = disposable[disposeSymbol] as (this: unknown) => unknown;
        } else {
            return;
        }
    }
    const dispose = disposeFn;
    const report = (error: unknown) => console.error('[jco] error while disposing discarded host value', error);
    queueMicrotask(() => {
        try {
            const result = dispose.call(value) as
                | { then?: (ok: undefined, error: typeof report) => unknown }
                | undefined;
            if (result && typeof result.then === 'function') {
                result.then(undefined, report);
            }
        } catch (error) {
            report(error);
        }
    });
};
export const throwInvalidBool: CoreModule['throwInvalidBool'] = () => {
    throw new TypeError('invalid variant discriminant for bool');
};
export const throwUninitialized: CoreModule['throwUninitialized'] = () => {
    throw new TypeError('Wasm uninitialized use `await $init` first');
};
export { promiseWithResolvers } from './core-promises.js';

export const registerMemory: CoreModule['registerMemory'] = (map, args) => {
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
export function lookupMemories(map: Pick<ComponentMemoryMap, 'get'>, args: { componentIdx: number }): MemoryMeta[];
export function lookupMemories(
    map: Pick<ComponentMemoryMap, 'get'>,
    args: { componentIdx: number; memoryIdx: number },
): RuntimeMemory | undefined | [];
export function lookupMemories(
    map: Pick<ComponentMemoryMap, 'get'>,
    args: { componentIdx: number; memoryIdx?: number },
): MemoryMeta[] | RuntimeMemory | undefined {
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
export const suspendingImport: CoreModule['suspendingImport'] = (
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
        const savedThread = saved ? context.getCurrentThread(saved.componentIdx, saved.threadID, saved.taskID) : null;
        const mayBlock = savedThread ? (savedThread.task.mayBlock() ?? context.currentTaskMayBlock() !== 0) : false;
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
                typeof (result as { then?: unknown }).then === 'function'
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
function instantiateTrampoline(
    platform: ConditionalSuspendingPlatform,
    module: WebAssembly.Module | undefined,
    fast: ConditionalTrampoline,
    slow: ConditionalSlowFn,
): ConditionalTrampoline {
    return new platform.Instance(module!, {
        '': { fast, slow: new platform.Suspending(slow) as WebAssembly.ImportValue },
    }).exports.run as ConditionalTrampoline;
}
export const conditionalSuspending1I32ToI32: CoreModule['conditionalSuspending1I32ToI32'] = (context, fast, slow) =>
    instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending1I32ToI32, fast, slow);
export const conditionalSuspending2I32ToI32: CoreModule['conditionalSuspending2I32ToI32'] = (context, fast, slow) =>
    instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending2I32ToI32, fast, slow);
export const conditionalSuspending3I32ToI32: CoreModule['conditionalSuspending3I32ToI32'] = (context, fast, slow) =>
    instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending3I32ToI32, fast, slow);
export const conditionalSuspending3I32ToVoid: CoreModule['conditionalSuspending3I32ToVoid'] = (context, fast, slow) =>
    instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending3I32ToVoid, fast, slow);
