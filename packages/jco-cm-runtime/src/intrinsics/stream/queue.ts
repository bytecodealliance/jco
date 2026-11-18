/**
 * Buffer values from a host stream and transfer them to readers in source order.
 * Source reads and cooperative batch yields share the store's host-operation tracking.
 */

import type {
    PendingValueQueueConstructor,
    ComponentHostOperationContext,
    StreamReadFn,
    StreamElementMetadata,
    StreamChunk,
} from '../../runtime.js';
import { trackHostOperation } from '../component.js';
import { disposeHostValue } from '../core.js';
import { isPromiseLike } from '../core/promises.js';
import { yieldToHost } from '../core/scheduling.js';

function definePendingValueQueue() {
    return class PendingValueQueue {
        #tracking: ComponentHostOperationContext;

        #readFn: StreamReadFn;
        #elemMeta: StreamElementMetadata;
        #done = false;
        #sourceReadPromise: Promise<number> | null = null;
        #synchronousReads = 0;
        #chunks: ({ data: StreamChunk; offset: number } | undefined)[] = [];
        #head = 0;
        #prepended: { data: StreamChunk; offset: number }[] = [];
        #length = 0;

        constructor(tracking: ComponentHostOperationContext, readFn: StreamReadFn, elemMeta: StreamElementMetadata) {
            this.#tracking = tracking;
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

        /** Keep ready reads synchronous until a bounded batch must yield to the host. */
        readSourceOrPromise(): number | Promise<number> {
            if (this.#sourceReadPromise) {
                return this.#sourceReadPromise;
            }
            let hostRead: ReturnType<StreamReadFn> | undefined;
            try {
                // A batch yield is pending host work just like an asynchronous source read.
                // Track it before suspending so a waiting guest cannot be declared deadlocked.
                const result = trackHostOperation(this.#tracking, () => {
                    if (this.#synchronousReads < 64) {
                        return (hostRead = this.#readFn());
                    }
                    return (hostRead = yieldToHost().then(() => {
                        // Shutdown or disposal can happen while the next read is deferred.
                        if (this.#tracking.storeTrap.stopped) {
                            throw this.#tracking.storeTrap.error;
                        }
                        return this.#readFn.dropped ? { done: true, value: undefined } : this.#readFn();
                    }));
                });
                if (!isPromiseLike(result)) {
                    this.#synchronousReads++;
                    return this.#acceptRead(result);
                }
                this.#synchronousReads = 0;
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
                const cursor = this.#front()!;
                const chunk = cursor.data;
                const transfer = Math.min(remaining, chunk.length - cursor.offset);
                for (let i = 0; i < transfer; i++) {
                    target.push(chunk[cursor.offset + i]);
                }
                this.#advance(cursor, transfer);
                transferred += transfer;
                remaining -= transfer;
            }
            return transferred;
        }

        takeBytes(maxCount: number, allowShort: boolean): Uint8Array | undefined {
            const cursor = this.#front();
            if (!cursor || !(cursor.data instanceof Uint8Array)) {
                return undefined;
            }
            const available = cursor.data.length - cursor.offset;
            if (available < maxCount && !(allowShort && available === this.#length)) {
                return undefined;
            }
            const transfer = Math.min(available, maxCount);
            // The source keeps its chunk, and slicing a `Buffer` would only give a view of it.
            const bytes = new Uint8Array(cursor.data.subarray(cursor.offset, cursor.offset + transfer));
            this.#advance(cursor, transfer);
            return bytes;
        }

        /** The chunk the next value is taken from: the last one prepended, or else the oldest one read. */
        #front() {
            return this.#prepended.length > 0 ? this.#prepended[this.#prepended.length - 1] : this.#chunks[this.#head];
        }

        /** Moves the cursor of the front chunk past `count` values, releasing the chunk once it is used up. */
        #advance(cursor: { data: StreamChunk; offset: number }, count: number) {
            cursor.offset += count;
            this.#length -= count;
            if (cursor.offset !== cursor.data.length) {
                return;
            }
            if (this.#prepended.length > 0) {
                this.#prepended.pop();
                return;
            }
            this.#chunks[this.#head++] = undefined;
            if (this.#head === this.#chunks.length) {
                this.#chunks = [];
                this.#head = 0;
            } else if (this.#head >= 1024 && this.#head * 2 >= this.#chunks.length) {
                this.#chunks = this.#chunks.slice(this.#head);
                this.#head = 0;
            }
        }
    };
}
let sharedPendingValueQueue: ReturnType<typeof definePendingValueQueue>;

export function initializePendingValueQueueClass(
    tracking: ComponentHostOperationContext,
): PendingValueQueueConstructor {
    const PendingValueQueue = (sharedPendingValueQueue ??= definePendingValueQueue());
    /**
     * Construct a queue that tracks its host reads in the context.
     *
     * @param readFn - reads the next value of the source
     * @param elemMeta - metadata of the element type
     * @returns the queue
     */
    class StorePendingValueQueue extends PendingValueQueue {
        constructor(readFn: StreamReadFn, elemMeta: StreamElementMetadata) {
            super(tracking, readFn, elemMeta);
        }
    }
    return StorePendingValueQueue;
}
