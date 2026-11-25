import type { ComponentWaitable } from '../runtime.js';

/**
 * Trap message for using a waitable synchronously while it is in a waitable set,
 * or joining it to one while a synchronous built-in waits on it.
 */
export const WAITABLE_SYNC_IN_SET = 'waitable cannot be used synchronously while added to a waitable set';

/**
 * Mark `waitable` as having a synchronous waiter until `wait` settles, so that
 * `waitable.join` traps rather than let a waitable set take the awaited event.
 *
 * @param waitable - the waitable that a synchronous built-in blocks on
 * @param wait - the pending wait
 * @returns `wait`, settling after the waiter is cleared
 */
export function waitSynchronously<T>(waitable: Pick<ComponentWaitable, 'setSyncWaiter'>, wait: Promise<T>): Promise<T> {
    waitable.setSyncWaiter(true);
    return wait.finally(() => waitable.setSyncWaiter(false));
}
