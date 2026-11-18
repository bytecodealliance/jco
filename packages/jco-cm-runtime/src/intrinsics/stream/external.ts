import type {
    ExternalStreamClassContext,
    ExternalStreamConstructor,
    ExternalStreamOptions,
    StreamReadOptions,
} from '../../runtime.js';
import { debugLog } from '../core/debug.js';

// Calls the drop function of a stream. Assigned in the class body, which alone reaches it.
let dropStream: (stream: InstanceType<ReturnType<typeof defineBaseStream>>) => void;

/** Everything of a stream but the methods named by the symbols of a context. */
function defineBaseStream() {
    return class BaseStream {
        static {
            dropStream = (stream) => {
                stream.#dropFn?.();
            };
        }

        [key: symbol]: unknown;
        #context: ExternalStreamClassContext;
        #isReadable: boolean;
        #isWritable: boolean;
        #writeFn: ExternalStreamOptions['writeFn'];
        #readFn: ExternalStreamOptions['readFn'];
        #dropFn: ExternalStreamOptions['dropFn'];

        constructor(context: ExternalStreamClassContext, args: ExternalStreamOptions) {
            DEBUG: debugLog('[Stream#constructor()] args', args);
            this.#context = context;

            if (args.globalRep === undefined) {
                throw new TypeError('missing host stream rep');
            }
            this[context.resourceRep] = args.globalRep;

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

        async return(): Promise<{ done: true }> {
            (this[this.#context.disposeSymbol] as () => void)();
            return { done: true };
        }

        async next() {
            DEBUG: debugLog('[Stream#next()]');
            return this.read();
        }

        async read(opts?: number | StreamReadOptions) {
            DEBUG: debugLog('[Stream#read()]', { opts });
            if (!this.#isReadable) {
                throw new Error('stream is not marked as readable and cannot be read from');
            }
            // The readable end validates the options.
            return this.#readFn!(opts);
        }

        async write(...objects: unknown[]) {
            DEBUG: debugLog('[Stream#write()]');
            if (!this.#isWritable) {
                throw new Error('stream is not marked as writable and cannot be written to');
            }

            if (objects.length !== 1) {
                throw new Error('only single object writes are currently supported');
            }
            const obj = objects[0];

            await this.#writeFn!(obj);
        }
    };
}
let sharedBaseStream: ReturnType<typeof defineBaseStream>;

export function initializeExternalStreamClass(_context: ExternalStreamClassContext): ExternalStreamConstructor {
    const BaseStream = (sharedBaseStream ??= defineBaseStream());
    return class Stream extends BaseStream {
        constructor(args: ExternalStreamOptions) {
            super(_context, args);
        }

        [_context.asyncIteratorSymbol]() {
            return this;
        }

        [_context.disposeSymbol]() {
            dropStream(this);
        }
    };
}
