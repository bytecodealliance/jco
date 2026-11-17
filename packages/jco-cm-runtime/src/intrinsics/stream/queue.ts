import { asConstructorOf } from '../core/shared-class.js';
import { isPromiseLike } from '../core/promises.js';
import type {
    PendingValueQueueConstructor,
    ComponentHostOperationContext,
    StreamReadFn,
    StreamElementMetadata,
    StreamChunk,
} from '../../runtime.js';
import { trackHostOperation } from '../component.js';
import { disposeHostValue } from '../core.js';

class PendingValueQueue {
    #tracking: ComponentHostOperationContext;
    // What one `initializePendingValueQueueClass` call shares between the instances it constructs.
    #store: object;

    /**
     * Whether a value was constructed through one `initializePendingValueQueueClass` call.
     *
     * @param value - any value
     * @param store - the store of that call
     * @returns whether the value is an instance belonging to that store
     */
    static constructedIn(value: unknown, store: object): boolean {
        return typeof value === 'object' && value !== null && #store in value && value.#store === store;
    }

    #readFn: StreamReadFn;
    #elemMeta: StreamElementMetadata;
    #done = false;
    #sourceReadPromise: Promise<number> | null = null;
    #chunks: ({ data: StreamChunk; offset: number } | undefined)[] = [];
    #head = 0;
    #prepended: { data: StreamChunk; offset: number }[] = [];
    #length = 0;

    constructor(
        tracking: ComponentHostOperationContext,
        store: object,
        readFn: StreamReadFn,
        elemMeta: StreamElementMetadata,
    ) {
        this.#tracking = tracking;
        this.#store = store;
        this.#readFn = readFn;
        this.#elemMeta = elemMeta;
    }

    get length() {
        return this.#length;
    }
    get done() {
        return this.#done;
    }
    get sourceIsSync() {
        return !!this.#readFn.sourceIsSync;
    }

    push(source: StreamChunk) {
        if (source.length === 0) {
            return 0;
        }
        this.#chunks.push({ data: source, offset: 0 });
        this.#length += source.length;
        return source.length;
    }

    appendReadValue(value: unknown) {
        if (value === undefined) {
            return 0;
        }
        if (this.#elemMeta.isNumeric) {
            if (value instanceof ArrayBuffer) {
                value = new Uint8Array(value);
            }
            if (
                Array.isArray(value) ||
                (ArrayBuffer.isView(value) && 'length' in value && typeof value.length === 'number')
            ) {
                return this.push(value as StreamChunk);
            }
        }
        return this.push([value]);
    }

    /** Preserve the promise-returning API and coalesce concurrent public reads. */
    readSource(): Promise<number> {
        if (this.#sourceReadPromise) {
            return this.#sourceReadPromise;
        }
        try {
            const result = this.readSourceOrPromise();
            if (typeof result !== 'number') {
                return result;
            }
            return (this.#sourceReadPromise = Promise.resolve(result).finally(() => {
                this.#sourceReadPromise = null;
            }));
        } catch (error) {
            return (this.#sourceReadPromise = Promise.reject(error).finally(() => {
                this.#sourceReadPromise = null;
            }));
        }
    }

    /** Avoid a promise and a microtask when the source actually completes synchronously. */
    readSourceOrPromise(): number | Promise<number> {
        if (this.#sourceReadPromise) {
            return this.#sourceReadPromise;
        }
        let hostRead: ReturnType<StreamReadFn> | undefined;
        try {
            const result = trackHostOperation(this.#tracking, () => (hostRead = this.#readFn()));
            if (!isPromiseLike(result)) {
                return this.#acceptRead(result);
            }
            return (this.#sourceReadPromise = Promise.resolve(result)
                .then(
                    (value) => this.#acceptRead(value),
                    (error) => this.#failedRead(error, hostRead),
                )
                .finally(() => {
                    this.#sourceReadPromise = null;
                }));
        } catch (error) {
            return this.#failedRead(error, hostRead);
        }
    }

    #acceptRead(result: IteratorResult<unknown>): number {
        if (this.#readFn.dropped) {
            disposeHostValue(this.#tracking.symbolDispose, result.value);
            this.#done = true;
            return 0;
        }
        const appended = this.appendReadValue(result.value);
        this.#done = !!result.done;
        return appended;
    }

    #failedRead(error: unknown, hostRead: ReturnType<StreamReadFn> | undefined): number {
        if (!this.#tracking.storeTrap.stopped) {
            throw error;
        }
        // Stop settles the wait before the host read; dispose its eventual value.
        Promise.resolve(hostRead).then(
            (late) => disposeHostValue(this.#tracking.symbolDispose, late?.value),
            () => {},
        );
        this.#done = true;
        return 0;
    }

    prepend(source: StreamChunk) {
        if (source.length === 0) {
            return;
        }
        const current =
            this.#prepended.length > 0 ? this.#prepended[this.#prepended.length - 1] : this.#chunks[this.#head];
        if (current && current.offset !== 0) {
            // As before, prepend snapshots the unread part of an active chunk.
            // Ordinary partial reads keep their cursor without copying it.
            current.data = current.data.slice(current.offset);
            current.offset = 0;
        }
        this.#prepended.push({ data: source, offset: 0 });
        this.#length += source.length;
    }

    drainInto(target: unknown[], maxCount: number) {
        let transferred = 0;
        let remaining = Math.min(maxCount, this.#length);
        while (remaining > 0) {
            const front = this.#prepended.length > 0;
            const cursor = front ? this.#prepended[this.#prepended.length - 1] : this.#chunks[this.#head]!;
            const chunk = cursor.data;
            const transfer = Math.min(remaining, chunk.length - cursor.offset);
            for (let i = 0; i < transfer; i++) {
                target.push(chunk[cursor.offset + i]);
            }
            cursor.offset += transfer;
            this.#length -= transfer;
            transferred += transfer;
            remaining -= transfer;
            if (cursor.offset === chunk.length) {
                if (front) {
                    this.#prepended.pop();
                } else {
                    this.#chunks[this.#head++] = undefined;
                    if (this.#head === this.#chunks.length) {
                        this.#chunks = [];
                        this.#head = 0;
                    } else if (this.#head >= 1024 && this.#head * 2 >= this.#chunks.length) {
                        this.#chunks = this.#chunks.slice(this.#head);
                        this.#head = 0;
                    }
                }
            }
        }
        return transferred;
    }
}

export function initializePendingValueQueueClass(
    tracking: ComponentHostOperationContext,
): PendingValueQueueConstructor {
    const store: object = {};

    /**
     * Construct a queue that tracks its host reads in the context.
     *
     * @param readFn - reads the next value of the source
     * @param elemMeta - metadata of the element type
     * @returns the queue
     */
    function StorePendingValueQueue(readFn: StreamReadFn, elemMeta: StreamElementMetadata) {
        return new PendingValueQueue(tracking, store, readFn, elemMeta);
    }
    return asConstructorOf(StorePendingValueQueue, PendingValueQueue, (value) =>
        PendingValueQueue.constructedIn(value, store),
    );
}
