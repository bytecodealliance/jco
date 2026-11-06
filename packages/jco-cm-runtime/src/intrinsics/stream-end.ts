import type {
    StreamEndConstructor,
    StreamEndOptions,
    StreamCopyResults,
    StreamCopyStates,
    ComponentWaitable,
    StreamEvent,
    AsyncEventCodes,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
export function initializeStreamEndClass(
    events: Pick<AsyncEventCodes, 'STREAM_READ' | 'STREAM_WRITE'>,
): StreamEndConstructor {
    class StreamEnd {
        declare isReadable: () => boolean;
        declare isDoneState: () => boolean;
        declare waitableIdx: () => number | null;
        static CopyResult: StreamCopyResults = {
            COMPLETED: 0,
            DROPPED: 1,
            CANCELLED: 2,
        };

        static CopyState: StreamCopyStates = {
            IDLE: 1,
            SYNC_COPYING: 2,
            ASYNC_COPYING: 3,
            CANCELLING_COPY: 4,
            DONE: 5,
        };

        #waitable: ComponentWaitable;

        #tableIdx: number; // stream table that contains the stream end
        #idx: number | null = null; // stream end index in the table

        #componentIdx: number | null = null;

        #copyState = StreamEnd.CopyState.IDLE;

        #dropped = false;
        #isPeerDroppedFn: () => boolean;
        #notifyPeerDroppedFn: () => void;

        target: unknown;

        constructor(args: StreamEndOptions) {
            const { tableIdx, componentIdx } = args;
            void componentIdx;
            if (tableIdx === undefined || typeof tableIdx !== 'number') {
                throw new TypeError(`missing table idx [${tableIdx}]`);
            }
            if (tableIdx < 0 || tableIdx > 2_147_483_647) {
                throw new TypeError(`invalid  tableIdx [${tableIdx}]`);
            }
            if (!args.waitable) {
                throw new Error('missing/invalid waitable');
            }

            this.#tableIdx = args.tableIdx;
            this.#waitable = args.waitable;

            if (args.isPeerDroppedFn !== undefined && typeof args.isPeerDroppedFn !== 'function') {
                throw new TypeError('isPeerDroppedFn must be a function');
            }
            if (args.notifyPeerDroppedFn !== undefined && typeof args.notifyPeerDroppedFn !== 'function') {
                throw new TypeError('notifyPeerDroppedFn must be a function');
            }
            this.#isPeerDroppedFn = args.isPeerDroppedFn ?? (() => false);
            this.#notifyPeerDroppedFn = args.notifyPeerDroppedFn ?? (() => {});

            this.target = args.target;
        }

        tableIdx() {
            return this.#tableIdx;
        }

        idx() {
            return this.#idx;
        }
        setIdx(idx: number) {
            this.#idx = idx;
        }

        setTarget(tgt: unknown) {
            this.target = tgt;
        }

        getWaitable() {
            return this.#waitable;
        }
        setWaitable(w: ComponentWaitable) {
            this.#waitable = w;
        }

        setCopyState(state: number) {
            this.#copyState = state;
        }
        getCopyState() {
            return this.#copyState;
        }

        isCopying() {
            switch (this.#copyState) {
                case StreamEnd.CopyState.IDLE:
                case StreamEnd.CopyState.DONE:
                    return false;
                    break;
                case StreamEnd.CopyState.SYNC_COPYING:
                case StreamEnd.CopyState.ASYNC_COPYING:
                case StreamEnd.CopyState.CANCELLING_COPY:
                    return true;
                    break;
                default:
                    throw new Error('invalid/unknown copying state');
            }
        }

        setPendingEvent(fn: () => StreamEvent) {
            if (!this.#waitable) {
                throw new Error('missing/invalid waitable');
            }
            debugLog('[StreamEnd#setPendingEvent()]', {
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
            debugLog('[StreamEnd#getPendingEvent()]', {
                waitable: this.#waitable,
                waitableinSet: this.#waitable.isInSet(),
                componentIdx: this.#waitable.componentIdx(),
            });
            const event = this.#waitable.getPendingEvent();
            return event as StreamEvent | null;
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
            const eventCode = this.isReadable() ? events.STREAM_READ : events.STREAM_WRITE;
            this.setPendingEvent(() => {
                this.setCopyState(StreamEnd.CopyState.DONE);
                return {
                    code: eventCode,
                    payload0: this.waitableIdx()!,
                    payload1: StreamEnd.CopyResult.DROPPED,
                };
            });
        }

        drop(opts: { allowPendingEvent?: boolean } = {}) {
            debugLog('[StreamEnd#drop()]', {
                waitable: this.#waitable,
                waitableinSet: this.#waitable.isInSet(),
                componentIdx: this.#waitable.componentIdx(),
            });

            if (this.isDropped()) {
                debugLog('[StreamEnd#drop()] already dropped', {
                    waitable: this.#waitable,
                    waitableinSet: this.#waitable.isInSet(),
                    componentIdx: this.#waitable.componentIdx(),
                });
                return;
            }

            this.#dropped = true;
            this.#notifyPeerDroppedFn();
            if (this.#waitable) {
                const w = this.#waitable;
                if (opts.allowPendingEvent) {
                    // A lifted host read can still be observing this event.
                    // Detach it from any guest waitable set, but leave the
                    // event available for the in-flight host read to consume.
                    w.join(null);
                } else {
                    w.drop();
                }
            }
        }
    }

    return StreamEnd;
}
