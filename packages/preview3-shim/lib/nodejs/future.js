function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

export class FutureReader {
    #promise;
    #consumed = false;

    /**
     * Constructs a FutureReader.
     *
     * @param {Promise} promise - The promise to be read.
     * @throws {Error} If the provided argument is not a promise.
     */
    constructor(promise) {
        if (!(promise instanceof Promise)) {
            throw new Error('Provided future must be a Promise');
        }
        this.#promise = promise;
    }

    /**
     * Reads the value from the promise. Can only be called once.
     *
     * @returns {Promise<*>} Resolves with the value of the promise or null if already consumed.
     * @throws {Error} If the promise is rejected.
     */
    async read() {
        if (this.#consumed) return null;
        try {
            const value = await this.#promise;
            this.#consumed = true;
            return value;
        } catch (err) {
            this.#consumed = true;
            throw err;
        }
    }

    /**
     * Cancels the future. Not supported for FutureReader.
     */
    async cancel() {
        // FutureReader does not support cancel
    }

    /**
     * Closes the reader. No resources are released in this implementation.
     */
    close() {
        // Nothing to release.
    }

    /**
     * Converts the reader back into a promise.
     *
     * @returns {Promise} The original promise.
     */
    intoFuture() {
        this.close();
        return this.#promise;
    }
}

export class FutureWriter {
    #deferred;
    #written = false;

    /**
     * Constructs a FutureWriter.
     *
     * @param {Object} deferred - A deferred object with `resolve` and `reject` methods.
     * @throws {Error} If the deferred object is invalid.
     */
    constructor(deferred) {
        if (!deferred || typeof deferred.resolve !== 'function') {
            throw new Error(
                'Provided deferred object must have a resolve method'
            );
        }
        this.#deferred = deferred;
    }

    /**
     * Resolves the promise with the given value.
     *
     * @param {*} value - The value to resolve the promise with.
     * @throws {Error} If the writer is already closed.
     */
    async write(value) {
        if (this.#written) throw new Error('FutureWriter is closed');
        this.#written = true;
        this.#deferred.resolve(value);
    }

    /**
     * Rejects the promise with the given reason.
     *
     * @param {*} reason - The reason for rejecting the promise.
     * @throws {Error} If the writer is already closed.
     */
    async abort(reason) {
        if (this.#written) throw new Error('FutureWriter is closed');
        this.#written = true;
        this.#deferred.reject(reason);
    }

    /**
     * Resolves the promise with null and closes the writer.
     */
    async close() {
        if (this.#written) return;
        this.#written = true;
        this.#deferred.resolve(null);
    }

    /**
     * Rejects the promise with the given error and closes the writer.
     *
     * @param {Error} error - The error to reject the promise with.
     */
    async closeWithError(error) {
        if (this.#written) return;
        this.#written = true;
        this.#deferred.reject(error);
    }

    /**
     * Converts the writer back into a promise.
     *
     * @returns {Promise} The original promise.
     */
    intoFuture() {
        this.close();
        return this.#deferred.promise;
    }
}

/**
 * Creates a future with a reader and writer.
 *
 * @returns {Object} An object containing:
 *   - `tx` {FutureWriter}: The writer for the future.
 *   - `rx` {FutureReader}: The reader for the future.
 */
export function future() {
    const def = deferred();
    const tx = new FutureWriter(def);
    const rx = new FutureReader(def.promise);
    return { tx, rx };
}
