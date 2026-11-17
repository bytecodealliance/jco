import type { ThreadLookupContext, AsyncTaskModule, TaskMeta } from '../../runtime.js';
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
 * A guest function called through {@link guardCannotLeave} with fresh context slots uses those.
 * Otherwise guest code uses the register of its own component. A FACT adapter has no component
 * index, and a post-return may run after the thread its component's register names has exited;
 * both use the executing thread.
 *
 * @param context - capabilities for locating a component's threads and the executing registers
 * @param componentIdx - index of the component instance calling the built-in, if it has one
 * @param operation - name of the calling built-in, for the error message
 * @returns the slots of the thread the call runs on
 */
function activeSlots(context: ThreadLookupContext, componentIdx: number | undefined, operation: string): number[] {
    const { registers } = context;
    const slots =
        registers.freshContextSlots ??
        (componentIdx === undefined || componentIdx === null
            ? undefined
            : threadSlots(context, registers[componentIdx])) ??
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
 * Wrap a guest function that the host calls while lifting or lowering (a realloc or a
 * post-return) so that each call runs without leaving its component instance.
 *
 * The Canonical ABI clears `may_leave` around both. A function that may not leave its component
 * instance can neither call out of it nor suspend, so it has finished by the time the call
 * returns, even where the call yields a promise; `may_leave` is therefore restored on return.
 *
 * A realloc additionally runs as though on a fresh thread (`freshContextSlots`): the host may
 * call it while one of the guest's tasks is suspended or while none of its threads is executing,
 * so it reads zeroed context slots and what it writes to them is discarded when it returns. No
 * thread's own slots are involved, and the registers keep naming what was executing. Only the
 * wrapped function can run until the call returns, so one set of fresh slots serves every
 * component.
 *
 * @param context - capabilities for locating component state and the executing registers
 * @param componentIdx - index of the component instance that owns the function
 * @param fn - the guest function to wrap
 * @param freshContextSlots - whether calls run with zeroed context slots of their own
 * @returns a function with the same signature
 */
export function guardCannotLeave<A extends unknown[], T>(
    context: ThreadLookupContext,
    componentIdx: number,
    fn: (...args: A) => T,
    freshContextSlots = false,
): (...args: A) => T {
    const { registers } = context;
    return (...args) => {
        const state = getOrCreateAsyncState(context.lookup, componentIdx);
        const previousMayLeave = state.mayLeave;

        state.mayLeave = false;
        if (freshContextSlots) {
            registers.freshContextSlots = [0, 0];
        }
        try {
            return fn(...args);
        } finally {
            if (freshContextSlots) {
                registers.freshContextSlots = undefined;
            }
            state.mayLeave = previousMayLeave;
        }
    };
}
