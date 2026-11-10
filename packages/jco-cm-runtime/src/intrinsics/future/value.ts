import type {
    FutureValueConstructor,
    FutureValueStart,
    FutureValueBox,
    FutureValueResolve,
    FutureValueReject,
} from '../../runtime.js';
import { disposeHostValue } from '../core.js';

/** Keep each store's constructor and private brand together. */
export function initializeFutureValueClass(disposeSymbol: symbol): FutureValueConstructor {
    class FutureValue {
        #start: FutureValueStart;
        #dropFn?: () => void;
        #dropped = false;
        #delivered = false;
        #settled?: Promise<FutureValueBox>;
        #hideThen = 0;
        #thenFn: (resolve: FutureValueResolve, reject?: FutureValueReject) => Promise<unknown>;

        constructor(start: FutureValueStart, dropFn?: () => void) {
            if (typeof start !== 'function') {
                throw new TypeError('future start operation must be a function');
            }
            this.#start = start;
            this.#dropFn = dropFn;
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
            const droppedError = () => new Error('future was dropped');
            const read = this.#dropped ? Promise.reject(droppedError()) : this.#read();
            return read.then((box) => {
                // A drop between copying and delivery still discards the payload.
                if (this.#dropped) {
                    if (typeof reject === 'function') {
                        return reject(droppedError());
                    }
                    throw droppedError();
                }
                // Once delivered, the recipient owns the payload, even if it throws or drops us.
                this.#delivered = true;
                return this.#deliver(resolve, box.value);
            }, reject);
        }
        /** Drop the readable end and dispose copied values that never reached a recipient. */
        [disposeSymbol]() {
            if (this.#dropped) {
                return;
            }
            this.#dropped = true;
            this.#dropFn?.();
            this.#settled?.then(
                (box) => {
                    if (!this.#delivered) {
                        disposeHostValue(disposeSymbol, box.value);
                    }
                },
                () => {},
            );
        }
    }
    return FutureValue;
}
