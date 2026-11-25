import { emptyFunc } from './js-helper.js';
import { isPromiseLike, promiseWithResolvers } from './core/promises.js';
import type {
    CoreModule,
    ComponentErrorConstructor,
    ComponentMemoryMap,
    MemoryMeta,
    RuntimeMemory,
    FileCompileReader,
    ConditionalTrampoline,
    ConditionalSlowFn,
    ConditionalSuspendingPlatform,
    TaskRegisters,
} from '../runtime.js';
import { checkMayLeave, recordTrap, getOrCreateAsyncState } from './component.js';
import { getCurrentThread } from './async-task/thread-operations.js';
export { debugLog } from './core/debug.js';
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
export const typeCheckValidI32 = (value: unknown): value is number =>
    typeof value === 'number' && value >= i32Min && value <= i32Max;
export const typeCheckAsyncFn: CoreModule['typeCheckAsyncFn'] = (constructor, value) => value instanceof constructor;
export const base64Compile: CoreModule['base64Compile'] = (context, encoded) => {
    const bytes =
        typeof Uint8Array.fromBase64 === 'function'
            ? Uint8Array.fromBase64(encoded)
            : Uint8Array.from(atob(encoded), (byte) => byte.charCodeAt(0));
    return context.WebAssembly.compile(bytes);
};
export const fetchCompile: CoreModule['fetchCompile'] = async (context, url) => {
    if (url.protocol === 'file:' && context.nodejsCompat && context.fileCache.node) {
        // Resolve the filesystem module only for Node file URLs. Browser bundlers
        // can compile the fetch path without resolving Node builtins.
        const moduleUrl = new URL('node:fs/promises');
        context.fileCache.fs ??= (await import(/* @vite-ignore */ moduleUrl.href)) as FileCompileReader;
        return context.WebAssembly.compile(await context.fileCache.fs.readFile(url));
    }
    return fetch(url).then(context.WebAssembly.compileStreaming);
};
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
export { promiseWithResolvers } from './core/promises.js';

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
        const savedThread = saved
            ? getCurrentThread(context.threadLookup, saved.componentIdx, saved.threadID, saved.taskID)
            : null;
        const mayBlock = savedThread
            ? (savedThread.task.mayBlock() ?? (context.mayBlock === false ? undefined : context.mayBlock.value) !== 0)
            : false;
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
            if (isPromiseLike(result)) {
                Promise.resolve(result).catch(emptyFunc);
                throw new RuntimeError('cannot block a synchronous task before returning');
            }
            return result;
        }
        // A built-in that traps before blocking traps the calling stack at
        // once, rather than suspending it with a rejected promise that lets
        // the caller of a not-yet-blocked callee carry on first.
        let started: ReturnType<typeof fn>;
        try {
            started = fn.apply(null, args);
        } catch (error) {
            currentTaskMeta[componentIdx] = saved;
            if (!switchesTask) {
                currentTaskMeta.current = saved;
            }
            throw recordTrap(context.traps, componentIdx, error, convertsRangeErrors);
        }
        // A host import that returns a promise blocks the calling thread.
        const state = getOrCreateAsyncState(context.states, componentIdx);
        if (callsHost && isPromiseLike(started)) {
            savedThread?.task.endInitialInvocationOnBlock();
        }
        // A result that is not a promise still suspends, as JSPI scheduling expects.
        const settled = (async () => started)();

        // The suspended stack resumes in a later job than the one which
        // settles the promise returned here. The registers must still name
        // this stack's task when it does, so stacks resume one at a time.
        const resumption = promiseWithResolvers<ReturnType<typeof fn>>();

        /** Restore this stack's task, then let the stack resume. */
        const resume = (deliver: () => ReturnType<typeof fn>): void =>
            resumeInTurn(currentTaskMeta, () => {
                currentTaskMeta[componentIdx] = saved;
                if (!switchesTask) {
                    currentTaskMeta.current = saved;
                }

                try {
                    resumption.resolve(deliver());
                } catch (error) {
                    resumption.reject(recordTrap(context.traps, componentIdx, error, convertsRangeErrors));
                }
                return resumption.promise;
            });

        /** Resume once no sync call into another instance holds this stack back. */
        const release = (deliver: () => ReturnType<typeof fn>): void => {
            state.resumeWhenNotHeld(savedThread?.task, () => resume(deliver));
        };

        settled.then(
            (result) =>
                release(() => {
                    state.throwIfInterrupted();
                    return result as ReturnType<typeof fn>;
                }),
            (error) =>
                release(() => {
                    throw error;
                }),
        );
        return resumption.promise;
    };
};

/**
 * Resume a suspended stack once every stack resumed before it has run.
 *
 * A suspended stack continues in a job after the one which settles the promise
 * it waits for. Were two stacks of a store released in the same turn, the
 * second would restore its task before the first had continued, and the first
 * would run as the second's task.
 *
 * @param registers The task registers of the store.
 * @param release Restores the stack's task and settles the promise the stack
 *   waits for, returning that promise.
 */
function resumeInTurn(registers: TaskRegisters, release: () => Promise<unknown>): void {
    const previous = registers.resumed ?? Promise.resolve();
    registers.resumed = previous.then(() =>
        // The engine reacts to the promise before this does, so the stack has
        // run until it suspended again or returned by the time this settles.
        release().then(emptyFunc, emptyFunc),
    );
}
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
