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
import { asConstructorOf } from '../core/shared-class.js';

class InternalFuture {
    // What one `initializeInternalFutureClass` call shares between the instances it constructs.
    #store: object;

    /**
     * Whether a value was constructed through one `initializeInternalFutureClass` call.
     *
     * @param value - any value
     * @param store - the store of that call
     * @returns whether the value is an instance belonging to that store
     */
    static constructedIn(value: unknown, store: object): boolean {
        return typeof value === 'object' && value !== null && #store in value && value.#store === store;
    }

    #globalFutureMapRep?: number;
    #pendingBufferMeta: FuturePendingBufferMeta = {}; // Shared between read and write ends
    #elemMeta: FutureElementMetadata;

    #readEnd: FutureReadableEnd;
    #writeEnd: FutureWritableEnd;

    constructor(context: InternalFutureClassContext, store: object, args: InternalFutureOptions) {
        DEBUG: debugLog('[InternalFuture#constructor()] args', args);
        this.#store = store;
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
}

/** Create future pairs using the selected readable and writable constructors. */
export function initializeInternalFutureClass(_context: InternalFutureClassContext): InternalFutureConstructor {
    const store: object = {};

    /**
     * Construct a future whose ends are of the classes in the context.
     *
     * @param args - options of the future
     * @returns the future
     */
    function StoreInternalFuture(args: InternalFutureOptions) {
        return new InternalFuture(_context, store, args);
    }
    return asConstructorOf(StoreInternalFuture, InternalFuture, (value) => InternalFuture.constructedIn(value, store));
}
