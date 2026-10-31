import type {
    PendingValueQueueConstructor,
    ComponentHostOperationContext,
    StreamReadFn,
    StreamElementMetadata,
    StreamChunk,
} from '../runtime.js';
import { trackHostOperation } from './component.js';
export function initializePendingValueQueueClass(
    tracking: ComponentHostOperationContext,
): PendingValueQueueConstructor {
    class PendingValueQueue {
        #readFn: StreamReadFn;
        #elemMeta: StreamElementMetadata;
        #done = false;
        #sourceReadPromise: Promise<number> | null = null;
        #chunks: StreamChunk[] = [];
        #offset = 0;
        #length = 0;

        constructor(readFn: StreamReadFn, elemMeta: StreamElementMetadata) {
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
            this.#chunks.push(source);
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

        async readSource() {
            if (!this.#sourceReadPromise) {
                this.#sourceReadPromise = (async () => {
                    const res = await trackHostOperation(tracking, () => this.#readFn());
                    const appended = this.appendReadValue(res.value);
                    this.#done = res.done === true;
                    return appended;
                })().finally(() => {
                    this.#sourceReadPromise = null;
                });
            }
            return this.#sourceReadPromise;
        }

        prepend(source: StreamChunk) {
            if (source.length === 0) {
                return;
            }
            if (this.#offset !== 0 && this.#chunks.length > 0) {
                this.#chunks[0] = this.#chunks[0].slice(this.#offset);
                this.#offset = 0;
            }
            this.#chunks.unshift(source);
            this.#length += source.length;
        }

        drainInto(target: unknown[], maxCount: number) {
            let transferred = 0;
            let remaining = Math.min(maxCount, this.#length);
            while (remaining > 0) {
                const chunk = this.#chunks[0];
                const transfer = Math.min(remaining, chunk.length - this.#offset);
                for (let i = 0; i < transfer; i++) {
                    target.push(chunk[this.#offset + i]);
                }
                this.#offset += transfer;
                this.#length -= transfer;
                transferred += transfer;
                remaining -= transfer;
                if (this.#offset === chunk.length) {
                    this.#chunks.shift();
                    this.#offset = 0;
                }
            }
            return transferred;
        }
    }

    return PendingValueQueue;
}
