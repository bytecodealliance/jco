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
import { asConstructorOf } from '../core/shared-class.js';

class InternalStream {
    // What one `initializeInternalStreamClass` call shares between the instances it constructs.
    #store: object;

    /**
     * Whether a value was constructed through one `initializeInternalStreamClass` call.
     *
     * @param value - any value
     * @param store - the store of that call
     * @returns whether the value is an instance belonging to that store
     */
    static constructedIn(value: unknown, store: object): boolean {
        return typeof value === 'object' && value !== null && #store in value && value.#store === store;
    }

    #pendingBufferMeta: StreamPendingBufferMeta = {}; // shared between read/write ends
    #elemMeta: StreamElementMetadata;

    #globalStreamMapRep?: number;

    #readEnd: StreamReadableEnd;
    #writeEnd: StreamWritableEnd;

    constructor(context: InternalStreamClassContext, store: object, args: InternalStreamOptions) {
        this.#store = store;
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
}

export function initializeInternalStreamClass(_context: InternalStreamClassContext): InternalStreamConstructor {
    const store: object = {};

    /**
     * Construct a stream whose ends are of the classes in the context.
     *
     * @param args - options of the stream
     * @returns the stream
     */
    function StoreInternalStream(args: InternalStreamOptions) {
        return new InternalStream(_context, store, args);
    }
    return asConstructorOf(StoreInternalStream, InternalStream, (value) => InternalStream.constructedIn(value, store));
}
