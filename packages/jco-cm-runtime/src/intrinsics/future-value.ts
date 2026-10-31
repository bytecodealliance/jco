import type {
    FutureValueConstructor,
    FutureValueStart,
    FutureValueBox,
    FutureValueResolve,
    FutureValueReject,
} from '../runtime.js';

/** Keep each store's constructor and private brand together. */
export function initializeFutureValueClass(): FutureValueConstructor {
    class FutureValue {
        #start: FutureValueStart;
        #settled?: Promise<FutureValueBox>;
        #hideThen = 0;
        #thenFn: (resolve: FutureValueResolve, reject?: FutureValueReject) => Promise<unknown>;

        constructor(start: FutureValueStart) {
            if (typeof start !== 'function') {
                throw new TypeError('future start operation must be a function');
            }
            this.#start = start;
            this.#thenFn = this.#then.bind(this);
        }

        get then() {
            // The public awaitable type describes the stable state. Resolution
            // briefly hides this hook while delivering a nested future as a value.
            return (this.#hideThen === 0 ? this.#thenFn : undefined)!;
        }

        #read() {
            if (!this.#settled) {
                // The non-thenable box prevents assimilation of a future-valued payload.
                this.#settled = Promise.resolve().then(this.#start);
            }
            return this.#settled;
        }

        resolveAsValue(resolve: FutureValueResolve) {
            this.#hideThen++;
            try {
                resolve(this);
            } finally {
                this.#hideThen--;
            }
        }

        #deliver(resolve: FutureValueResolve, value: unknown) {
            if (value instanceof FutureValue) {
                // Promise resolution reads `then` synchronously. Hide only that lookup.
                value.resolveAsValue(resolve);
                return;
            }
            resolve(value);
        }

        #then(resolve: FutureValueResolve, reject?: FutureValueReject) {
            return this.#read().then((box) => this.#deliver(resolve, box.value), reject);
        }
    }
    return FutureValue;
}
