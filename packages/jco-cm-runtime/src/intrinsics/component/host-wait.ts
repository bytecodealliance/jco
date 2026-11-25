import type { ComponentHostOperationContext, HostWaitMeta } from '../../runtime.js';
import { trackHostOperation } from '../component.js';
import { promiseWithResolvers } from '../core/promises.js';
import { emptyFunc } from '../js-helper.js';

/**
 * Count a guest copy that only the host can complete as a host operation.
 *
 * A guest copy pending on a stream or future whose other end the host holds
 * completes whenever the host reads, writes or drops that end, which it may
 * do from code the runtime does not track. While such a copy is pending the
 * deadlock check must not report the guest as waiting on nothing.
 *
 * Call this whenever the pending copy or the host-held flag changes: it starts
 * counting when both hold and stops once either does not.
 */
export function trackGuestWaitOnHost(context: ComponentHostOperationContext, meta: HostWaitMeta) {
    const guestCopyPending = !!meta.buffer && meta.componentIdx !== -1 && meta.componentIdx != null;
    if (!guestCopyPending || !meta.hostHeld) {
        const endHostWait = meta.endHostWait;
        meta.endHostWait = null;
        endHostWait?.();
        return;
    }
    if (meta.endHostWait || context.storeTrap.stopped) {
        return;
    }
    const { promise, resolve } = promiseWithResolvers<void>();
    meta.endHostWait = resolve;
    // Stopping the store settles the operation: nothing waits on it.
    Promise.resolve(trackHostOperation(context, () => promise, meta.componentIdx)).catch(emptyFunc);
}
