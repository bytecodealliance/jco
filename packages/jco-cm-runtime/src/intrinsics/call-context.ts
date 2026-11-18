import { initializeParams } from './flat-params.js';
import type { TaskLiftContext, TaskLowerContext, BufferElementContext } from '../runtime.js';

/** Initialize optional fields consistently for direct and memory-based calls. */
export function createLiftContext(
    options: TaskLiftContext,
    useCursor = (options.params?.length ?? 0) >= 64,
): TaskLiftContext {
    if (options.useDirectParams && !useCursor) {
        return options;
    }
    const context = {
        componentIdx: options.componentIdx,
        memory: options.memory,
        memoryView: undefined,
        useDirectParams: options.useDirectParams,
        stringEncoding: options.stringEncoding,
        storagePtr: options.storagePtr,
        storageLen: options.storageLen,
        isBorrowed: options.isBorrowed,
        liftResource: options.liftResource,
    } as TaskLiftContext;
    // Accessor setup costs more than slicing short, one-shot argument vectors.
    if (useCursor) {
        initializeParams(context, options.params!);
    } else {
        context.params = options.params;
    }
    return context;
}

/** Keep list and scalar lowering contexts on the same field layout. */
export function createLowerContext(
    options: TaskLowerContext,
    useCursor = (options.params?.length ?? 0) >= 64,
): TaskLowerContext {
    const context: TaskLowerContext = {
        componentIdx: options.componentIdx,
        vals: options.vals,
        memory: options.memory,
        memoryView: undefined,
        useDirectParams: options.useDirectParams,
        stringEncoding: options.stringEncoding,
        storagePtr: options.storagePtr,
        storageLen: options.storageLen,
        realloc: options.realloc,
        lowerResource: options.lowerResource,
    };
    // Accessor setup costs more than slicing short, one-shot argument vectors.
    if (useCursor) {
        initializeParams(context, options.params!);
    } else {
        context.params = options.params;
    }
    return context;
}

/** Give element callbacks the same layout for both read and write buffers. */
export function createBufferContext(options: BufferElementContext): BufferElementContext {
    return {
        componentIdx: options.componentIdx,
        memory: options.memory,
        memoryView: undefined,
        storagePtr: options.storagePtr,
        stringEncoding: options.stringEncoding,
        realloc: options.realloc,
        getReallocFn: options.getReallocFn,
        vals: options.vals,
        liftResource: options.liftResource,
        lowerResource: options.lowerResource,
    };
}
