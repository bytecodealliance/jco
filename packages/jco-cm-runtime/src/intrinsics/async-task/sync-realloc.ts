import type { StringRealloc } from '../../runtime.js';

/**
 * Realloc runs guest code while the Canonical ABI forbids leaving the instance.
 * A synchronous leaf has no task-local context slots to save. Clear the actual
 * instance flag so a reentrant host import sees the guard, and restore the
 * caller's flags even when allocation traps.
 */
export function guardSyncRealloc(flags: { value: number }, realloc: StringRealloc): StringRealloc {
    return (oldPtr, oldSize, alignment, newSize) => {
        const previous = flags.value;
        flags.value = 0;
        try {
            return realloc(oldPtr, oldSize, alignment, newSize) >>> 0;
        } finally {
            flags.value = previous;
        }
    };
}
