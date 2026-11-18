import type {
    InternalFutureClassContext,
    InternalFutureConstructor,
    InternalFutureOptions,
    FuturePendingBufferMeta,
    FutureElementMetadata,
    FutureReadableEnd,
    FutureWritableEnd,
} from '../../runtime.js';
import { debugLog } from '../core/debug.js';

function defineInternalFuture() {
    return class InternalFuture {
        #globalFutureMapRep?: number;
        #pendingBufferMeta: FuturePendingBufferMeta = {}; // Shared between read and write ends
        #elemMeta: FutureElementMetadata;

        #readEnd: FutureReadableEnd;
        #writeEnd: FutureWritableEnd;

        constructor(context: InternalFutureClassContext, args: InternalFutureOptions) {
            DEBUG: debugLog('[InternalFuture#constructor()] args', args);
            if (!args.elemMeta) {
                throw new Error('missing/invalid future element metadata');
            }
            if (args.tableIdx === undefined) {
                throw new Error('missing/invalid future table idx');
            }
            if (!args.readWaitable) {
                throw new Error('missing/invalid read waitable');
            }
            if (!args.writeWaitable) {
                throw new Error('missing/invalid write waitable');
            }
            const { tableIdx, elemMeta, readWaitable, writeWaitable } = args;
            void elemMeta;

            this.#elemMeta = args.elemMeta;

            this.#readEnd = new context.FutureReadableEnd({
                tableIdx,
                elemMeta: this.#elemMeta,
                pendingBufferMeta: this.#pendingBufferMeta,
                target: 'future read end (@ init)',
                waitable: readWaitable,
                // Only in-component read-ends need the host inject fn if provided,
                // as that function will *inject* a write when the future is checked
                // from inside the guest.
                hostInjectFn: args.hostInjectFn,
                isPeerDroppedFn: () => this.#writeEnd?.isDropped() ?? false,
                notifyPeerDroppedFn: () => this.#writeEnd?.notifyDropped(),
            });

            this.#writeEnd = new context.FutureWritableEnd({
                tableIdx,
                elemMeta: this.#elemMeta,
                pendingBufferMeta: this.#pendingBufferMeta,
                target: 'future write end (@ init)',
                waitable: writeWaitable,
                hostOwned: true,
                isPeerDroppedFn: () => this.#readEnd.isDropped(),
                notifyPeerDroppedFn: () => this.#readEnd.notifyDropped(),
            });
        }

        /** Stop both endpoints so pending host and guest operations are released. */
        onInstanceStop() {
            this.#readEnd.onInstanceStop();
            this.#writeEnd.onInstanceStop();
        }

        elemMeta() {
            return this.#elemMeta;
        }
        readEnd() {
            return this.#readEnd;
        }
        writeEnd() {
            return this.#writeEnd;
        }

        globalFutureMapRep() {
            return this.#globalFutureMapRep;
        }
        setGlobalFutureMapRep(rep: number) {
            this.#globalFutureMapRep = rep;
            this.#readEnd.setGlobalFutureMapRep(rep);
            this.#writeEnd.setGlobalFutureMapRep(rep);
        }
    };
}
let sharedInternalFuture: ReturnType<typeof defineInternalFuture>;

/** Create future pairs using the selected readable and writable constructors. */
export function initializeInternalFutureClass(_context: InternalFutureClassContext): InternalFutureConstructor {
    const InternalFuture = (sharedInternalFuture ??= defineInternalFuture());
    /**
     * Construct a future whose ends are of the classes in the context.
     *
     * @param args - options of the future
     * @returns the future
     */
    class StoreInternalFuture extends InternalFuture {
        constructor(args: InternalFutureOptions) {
            super(_context, args);
        }
    }
    return StoreInternalFuture;
}
