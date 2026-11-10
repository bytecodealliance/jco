import type {
    ExternalStreamClassContext,
    ExternalStreamConstructor,
    ExternalStreamOptions,
    StreamReadOptions,
} from '../../runtime.js';
import { debugLog } from '../core/debug.js';
export function initializeExternalStreamClass(_context: ExternalStreamClassContext): ExternalStreamConstructor {
    class Stream {
        [key: symbol]: unknown;
        #isReadable: boolean;
        #isWritable: boolean;
        #writeFn: ExternalStreamOptions['writeFn'];
        #readFn: ExternalStreamOptions['readFn'];
        #dropFn: ExternalStreamOptions['dropFn'];

        constructor(args: ExternalStreamOptions) {
            debugLog('[Stream#constructor()] args', args);

            if (args.globalRep === undefined) {
                throw new TypeError('missing host stream rep');
            }
            this[_context.resourceRep] = args.globalRep;

            if (args.isReadable === undefined) {
                throw new TypeError('missing readable setting');
            }
            this.#isReadable = args.isReadable;

            if (args.isWritable === undefined) {
                throw new TypeError('missing writable setting');
            }
            this.#isWritable = args.isWritable;

            if (this.#isWritable && args.writeFn === undefined) {
                throw new TypeError('missing write fn');
            }
            this.#writeFn = args.writeFn;

            if (this.#isReadable && args.readFn === undefined) {
                throw new TypeError('missing read fn');
            }
            this.#readFn = args.readFn;

            this.#dropFn = args.dropFn;
        }

        [_context.asyncIteratorSymbol]() {
            return this;
        }

        async return(): Promise<{ done: true }> {
            (this[_context.disposeSymbol] as () => void)();
            return { done: true };
        }

        async next() {
            debugLog('[Stream#next()]');
            return this.read();
        }

        async read(opts?: number | StreamReadOptions) {
            debugLog('[Stream#read()]', { opts });
            if (!this.#isReadable) {
                throw new Error('stream is not marked as readable and cannot be read from');
            }
            // The readable end validates the options.
            return this.#readFn!(opts);
        }

        async write(...objects: unknown[]) {
            debugLog('[Stream#write()]');
            if (!this.#isWritable) {
                throw new Error('stream is not marked as writable and cannot be written to');
            }

            if (objects.length !== 1) {
                throw new Error('only single object writes are currently supported');
            }
            const obj = objects[0];

            await this.#writeFn!(obj);
        }

        [_context.disposeSymbol]() {
            this.#dropFn?.();
        }
    }

    return Stream;
}
