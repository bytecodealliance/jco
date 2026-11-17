import type { ThreadLookupContext, AsyncTaskModule, AsyncStringRealloc, TaskMeta } from '../../runtime.js';
import { typeCheckValidI32 } from './helpers.js';
import { getCurrentThread } from './thread-operations.js';
import { debugLog } from '../core/debug.js';
import { getOrCreateAsyncState } from '../component.js';

/**
 * Find the context slots of the thread a register names.
 *
 * @param context - capabilities for locating a component's threads
 * @param meta - the identity the register holds, if any
 * @returns the slots, or `undefined` when the register is empty or its thread no longer exists
 */
function threadSlots(context: ThreadLookupContext, meta: TaskMeta | null | undefined): number[] | undefined {
    if (!meta) {
        return undefined;
    }
    return getCurrentThread(context, meta.componentIdx, meta.threadID, meta.taskID)?.thread?.storage;
}

/**
 * Find the context slots that `context.get` and `context.set` act on.
 *
 * Guest code uses the register of its own component, unless the host is calling that component's
 * realloc, which runs with slots of its own. A FACT adapter has no component index, and a
 * post-return may run after the thread its component's register names has exited; both use the
 * executing thread.
 *
 * @param context - capabilities for locating a component's threads and the executing registers
 * @param componentIdx - index of the component instance calling the built-in, if it has one
 * @param operation - name of the calling built-in, for the error message
 * @returns the slots of the thread the call runs on
 */
function activeSlots(context: ThreadLookupContext, componentIdx: number | undefined, operation: string): number[] {
    const { registers } = context;
    const slots =
        (componentIdx === undefined || componentIdx === null
            ? undefined
            : (registers.contextSlots?.[componentIdx] ?? threadSlots(context, registers[componentIdx]))) ??
        threadSlots(context, registers.current);
    if (!slots) {
        throw new Error(
            `missing/incomplete global current thread meta for component idx [${componentIdx}] during context ${operation}`,
        );
    }
    return slots;
}

/** Implements `canon context.set`. */
export function contextSet(
    _context: ThreadLookupContext,
    ctx: {
        componentIdx?: number;
        slot: number;
    },
    value: number,
): ReturnType<AsyncTaskModule['contextSet']> {
    const { slot } = ctx;
    if (slot === undefined) {
        throw new TypeError('missing slot');
    }
    if (!typeCheckValidI32(value)) {
        throw new Error('invalid value for context set (not valid i32)');
    }
    const storage = activeSlots(_context, ctx.componentIdx, 'set');
    debugLog('[contextSet()] args', { slot, value, storage, componentIdx: ctx.componentIdx });
    if (slot < 0 || slot >= storage.length) {
        throw new Error('invalid slot for current thread');
    }
    storage[slot] = value;
}

/** Implements `canon context.get`. */
export function contextGet(
    _context: ThreadLookupContext,
    ctx: {
        componentIdx?: number;
        slot: number;
    },
): ReturnType<AsyncTaskModule['contextGet']> {
    const { slot } = ctx;
    if (slot === undefined) {
        throw new TypeError('missing slot');
    }
    const storage = activeSlots(_context, ctx.componentIdx, 'get');
    debugLog('[contextGet()] args', { slot, storage, componentIdx: ctx.componentIdx });
    if (slot < 0 || slot >= storage.length) {
        throw new Error('invalid slot for current thread');
    }
    return storage[slot];
}

/**
 * Wrap a guest realloc so each call runs with fresh context slots and without leaving the component.
 *
 * The host calls a guest's realloc to lower values into its memory, possibly while one of the guest's
 * tasks is suspended or while none of its threads is executing. Every such call runs as though on a
 * fresh thread: it reads zeroed context slots, and what it writes to them is discarded when it
 * returns. No thread's own slots are involved, and the registers keep naming what was executing.
 *
 * A realloc that may not leave its component instance cannot suspend, so it has finished by the time
 * the call returns, even where the call yields a promise.
 *
 * @param context - capabilities for locating component state and the executing registers
 * @param componentIdx - index of the component instance that owns the realloc
 * @param realloc - the guest realloc to wrap
 * @returns a realloc with the same signature
 */
export function isolateRealloc(
    context: ThreadLookupContext,
    componentIdx: number,
    realloc: AsyncStringRealloc,
): ReturnType<AsyncTaskModule['isolateRealloc']> {
    return (oldPtr, oldSize, alignment, newSize) => {
        const state = getOrCreateAsyncState(context.lookup, componentIdx);
        const contextSlots = (context.registers.contextSlots ??= {});
        const previousSlots = contextSlots[componentIdx];
        const previousMayLeave = state.mayLeave;

        contextSlots[componentIdx] = [0, 0];
        state.mayLeave = false;
        try {
            return realloc(oldPtr, oldSize, alignment, newSize);
        } finally {
            state.mayLeave = previousMayLeave;
            contextSlots[componentIdx] = previousSlots;
        }
    };
}
