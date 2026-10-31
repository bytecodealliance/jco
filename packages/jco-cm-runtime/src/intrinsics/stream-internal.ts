import type {
    InternalStreamClassContext,
    InternalStreamConstructor,
    InternalStreamOptions,
    StreamPendingBufferMeta,
    StreamElementMetadata,
    StreamReadableEnd,
    StreamWritableEnd,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
export function initializeInternalStreamClass(_context: InternalStreamClassContext): InternalStreamConstructor {
    class InternalStream {
        #pendingBufferMeta: StreamPendingBufferMeta = {}; // shared between read/write ends
        #elemMeta: StreamElementMetadata;

        #globalStreamMapRep?: number;

        #readEnd: StreamReadableEnd;
        #writeEnd: StreamWritableEnd;

        constructor(args: InternalStreamOptions) {
            debugLog('[InternalStream#constructor()] args', args);
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

            this.#readEnd = new _context.StreamReadableEnd({
                tableIdx,
                elemMeta: this.#elemMeta,
                pendingBufferMeta: this.#pendingBufferMeta,
                target: 'stream read end (@ init)',
                waitable: readWaitable,
                // Only in-component read-ends need the host inject fn if provided,
                // as that function will *inject* a write when a read is performed
                // from inside the guest.
                hostInjectFn: args.hostInjectFn,
                isPeerDroppedFn: () => this.#writeEnd?.isDropped() ?? false,
                notifyPeerDroppedFn: () => this.#writeEnd?.notifyDropped(),
            });

            this.#writeEnd = new _context.StreamWritableEnd({
                tableIdx,
                elemMeta: this.#elemMeta,
                pendingBufferMeta: this.#pendingBufferMeta,
                target: 'stream write end (@ init)',
                waitable: writeWaitable,
                hostOwned: true,
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
    }

    return InternalStream;
}
