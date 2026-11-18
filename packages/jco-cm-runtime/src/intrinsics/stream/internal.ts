import type {
    InternalStreamClassContext,
    InternalStreamConstructor,
    InternalStreamOptions,
    StreamPendingBufferMeta,
    StreamElementMetadata,
    StreamReadableEnd,
    StreamWritableEnd,
} from '../../runtime.js';
import { debugLog } from '../core/debug.js';

function defineInternalStream() {
    return class InternalStream {
        #pendingBufferMeta: StreamPendingBufferMeta = {}; // shared between read/write ends
        #elemMeta: StreamElementMetadata;

        #globalStreamMapRep?: number;

        #readEnd: StreamReadableEnd;
        #writeEnd: StreamWritableEnd;

        constructor(context: InternalStreamClassContext, args: InternalStreamOptions) {
            DEBUG: debugLog('[InternalStream#constructor()] args', args);
            if (!args.elemMeta) {
                throw new Error('missing/invalid stream element metadata');
            }
            if (args.tableIdx === undefined) {
                throw new Error('missing/invalid stream table idx');
            }
            if (!args.readWaitable) {
                throw new Error('missing/invalid read waitable');
            }
            if (!args.writeWaitable) {
                throw new Error('missing/invalid write waitable');
            }
            const { tableIdx, elemMeta, readWaitable, writeWaitable } = args;

            this.#elemMeta = elemMeta;

            this.#readEnd = new context.StreamReadableEnd({
                tableIdx,
                elemMeta: this.#elemMeta,
                pendingBufferMeta: this.#pendingBufferMeta,
                target: 'stream read end (@ init)',
                waitable: readWaitable,
                isPeerDroppedFn: () => this.#writeEnd?.isDropped() ?? false,
                notifyPeerDroppedFn: () => this.#writeEnd?.notifyDropped(),
            });

            this.#writeEnd = new context.StreamWritableEnd({
                tableIdx,
                elemMeta: this.#elemMeta,
                pendingBufferMeta: this.#pendingBufferMeta,
                target: 'stream write end (@ init)',
                waitable: writeWaitable,
                isPeerDroppedFn: () => this.#readEnd.isDropped(),
                notifyPeerDroppedFn: () => this.#readEnd.notifyDropped(),
            });
        }

        elemMeta() {
            return this.#elemMeta;
        }

        globalStreamMapRep() {
            return this.#globalStreamMapRep;
        }
        setGlobalStreamMapRep(rep: number) {
            this.#globalStreamMapRep = rep;
            this.#readEnd.setGlobalStreamMapRep(rep);
            this.#writeEnd.setGlobalStreamMapRep(rep);
        }

        readEnd() {
            return this.#readEnd;
        }
        writeEnd() {
            return this.#writeEnd;
        }

        // The instance stopped. Dropping an end settles a copy pending on either,
        // whose event the host's polling read or write is yet to consume.
        onInstanceStop() {
            this.#readEnd.onInstanceStop();
            this.#writeEnd.drop({ allowPendingEvent: true });
        }
    };
}
let sharedInternalStream: ReturnType<typeof defineInternalStream>;

export function initializeInternalStreamClass(_context: InternalStreamClassContext): InternalStreamConstructor {
    const InternalStream = (sharedInternalStream ??= defineInternalStream());
    /**
     * Construct a stream whose ends are of the classes in the context.
     *
     * @param args - options of the stream
     * @returns the stream
     */
    class StoreInternalStream extends InternalStream {
        constructor(args: InternalStreamOptions) {
            super(_context, args);
        }
    }
    return StoreInternalStream;
}
