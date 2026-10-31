import { debugLog } from './core-debug.js';
export function initializeExternalStreamClass(_context) {
    class Stream {
        #globalRep = null;
        #isReadable;
        #isWritable;
        #writeFn;
        #readFn;
        #dropFn;

        constructor(args) {
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

        async return() {
            this[_context.disposeSymbol]();
            return { done: true };
        }

        async next() {
            debugLog('[Stream#next()]');
            return this.read();
        }

        async read(opts) {
            debugLog('[Stream#read()]', { opts });
            if (!this.#isReadable) {
                throw new Error('stream is not marked as readable and cannot be read from');
            }
            const readOpts = this.#readOpts(opts);
            return this.#readFn(readOpts);
        }

        #readOpts(opts) {
            const count =
                opts === undefined
                    ? 1
                    : typeof opts === 'number'
                      ? opts
                      : opts && typeof opts === 'object'
                        ? (opts.count ?? 1)
                        : undefined;
            const rejectLength = opts && typeof opts === 'object' ? opts.rejectLength : undefined;
            if (count === undefined || !Number.isInteger(count) || count < (rejectLength !== undefined ? 0 : 1)) {
                throw new TypeError(`invalid stream read count [${count}]`);
            }
            if (rejectLength !== undefined && (!Number.isInteger(rejectLength) || rejectLength < 0)) {
                throw new TypeError(`invalid stream read reject length [${rejectLength}]`);
            }
            const dropAfterCopy = opts && typeof opts === 'object' ? opts.dropAfterCopy === true : false;
            return { count, rejectLength, dropAfterCopy };
        }

        async write(...objects) {
            debugLog('[Stream#write()]');
            if (!this.#isWritable) {
                throw new Error('stream is not marked as writable and cannot be written to');
            }

            if (objects.length !== 1) {
                throw new Error('only single object writes are currently supported');
            }
            const obj = objects[0];

            this.#writeFn(obj);
        }

        [_context.disposeSymbol]() {
            this.#dropFn?.();
        }
    }

    return Stream;
}
