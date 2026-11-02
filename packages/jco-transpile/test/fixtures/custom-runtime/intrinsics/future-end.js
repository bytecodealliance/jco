import { debugLog } from './core-debug.js';

export function initializeFutureEndClass(events) {
    class FutureEnd {
        // Supplied by readable/writable subclasses; declarations emit no properties.

        static CopyResult = {
            COMPLETED: 0,
            DROPPED: 1,
            CANCELLED: 2,
        };

        static CopyState = {
            IDLE: 1,
            SYNC_COPYING: 2,
            ASYNC_COPYING: 3,
            CANCELLING_COPY: 4,
            DONE: 5,
        };

        #pendingBufferMeta;
        #waitable;
        #copyState = FutureEnd.CopyState.IDLE;

        #dropped = false;
        #isPeerDroppedFn;
        #notifyPeerDroppedFn;

        constructor(args) {
            debugLog('[FutureEnd#constructor()] args', args);

            if (!args.pendingBufferMeta) {
                throw new Error('missing pending buffer');
            }
            this.#pendingBufferMeta = args.pendingBufferMeta;

            if (!args.waitable) {
                throw new Error('missing pending buffer');
            }
            this.#waitable = args.waitable;

            if (args.isPeerDroppedFn !== undefined && typeof args.isPeerDroppedFn !== 'function') {
                throw new TypeError('isPeerDroppedFn must be a function');
            }
            this.#isPeerDroppedFn = args.isPeerDroppedFn ?? (() => false);
            if (args.notifyPeerDroppedFn !== undefined && typeof args.notifyPeerDroppedFn !== 'function') {
                throw new TypeError('notifyPeerDroppedFn must be a function');
            }
            this.#notifyPeerDroppedFn = args.notifyPeerDroppedFn ?? (() => {});
        }

        getWaitable() {
            return this.#waitable;
        }
        setWaitable(w) {
            this.#waitable = w;
        }

        setCopyState(state) {
            this.#copyState = state;
        }
        getCopyState() {
            return this.#copyState;
        }

        isDoneState() {
            return this.getCopyState() === FutureEnd.CopyState.DONE;
        }
        isCancelledState() {
            return this.getCopyState() === FutureEnd.CopyState.CANCELLED;
        }
        isIdleState() {
            return this.getCopyState() === FutureEnd.CopyState.IDLE;
        }

        isCopying() {
            switch (this.#copyState) {
                case FutureEnd.CopyState.IDLE:
                case FutureEnd.CopyState.DONE:
                    return false;
                    break;
                case FutureEnd.CopyState.SYNC_COPYING:
                case FutureEnd.CopyState.ASYNC_COPYING:
                case FutureEnd.CopyState.CANCELLING_COPY:
                    return true;
                    break;
                default:
                    throw new Error('invalid/unknown copying state');
            }
        }

        setPendingBufferMeta(args) {
            const { componentIdx, buffer, isWrite, onCopyDoneFn } = args;
            this.#pendingBufferMeta.componentIdx = componentIdx;
            this.#pendingBufferMeta.buffer = buffer;
            this.#pendingBufferMeta.isWrite = isWrite;
            this.#pendingBufferMeta.onCopyDoneFn = onCopyDoneFn;
        }

        resetPendingBufferMeta() {
            this.setPendingBufferMeta({ componentIdx: null, buffer: null, isWrite: null, onCopyDoneFn: null });
        }

        getPendingBufferMeta() {
            return this.#pendingBufferMeta;
        }

        resetAndNotifyPending(result) {
            const f = this.#pendingBufferMeta.onCopyDoneFn;
            this.resetPendingBufferMeta();
            if (f) {
                f(result);
            }
        }

        setPendingEvent(fn) {
            if (!this.#waitable) {
                throw new Error('missing/invalid waitable');
            }
            debugLog('[FutureEnd#setPendingEvent()]', {
                waitable: this.#waitable,
                waitableinSet: this.#waitable.isInSet(),
                componentIdx: this.#waitable.componentIdx(),
            });
            this.#waitable.setPendingEvent(fn);
        }

        hasPendingEvent() {
            if (!this.#waitable) {
                throw new Error('missing/invalid waitable');
            }
            return this.#waitable.hasPendingEvent();
        }

        isInSet() {
            if (!this.#waitable) {
                throw new Error('missing/invalid waitable');
            }
            return this.#waitable.isInSet();
        }

        getPendingEvent() {
            if (!this.#waitable) {
                throw new Error('missing/invalid waitable');
            }
            debugLog('[FutureEnd#getPendingEvent()]', {
                waitable: this.#waitable,
                waitableinSet: this.#waitable.isInSet(),
                componentIdx: this.#waitable.componentIdx(),
            });
            const event = this.#waitable.getPendingEvent();
            return event;
        }

        isDropped() {
            return this.#dropped;
        }
        isPeerDropped() {
            return this.#isPeerDroppedFn();
        }

        notifyDropped() {
            if (this.isDropped() || this.isDoneState() || this.hasPendingEvent()) {
                return;
            }
            const eventCode = this.isReadable() ? events.FUTURE_READ : events.FUTURE_WRITE;
            this.setPendingEvent(() => {
                this.setCopyState(FutureEnd.CopyState.DONE);
                return {
                    code: eventCode,
                    payload0: this.waitableIdx(),
                    payload1: FutureEnd.CopyResult.DROPPED,
                };
            });
        }

        drop() {
            if (this.isDropped()) {
                throw new Error('future already dropped');
            }

            if (this.#pendingBufferMeta.buffer) {
                if (!this.#pendingBufferMeta.isWrite) {
                    throw new Error('non-writable pending buffer during drop (reader blocked)');
                }
                this.resetAndNotifyPending(FutureEnd.CopyResult.DROPPED);
            }

            this.#dropped = true;
            this.#notifyPeerDroppedFn();
            this.#waitable.drop();
        }
    }

    return FutureEnd;
}
