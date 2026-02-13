/**
 * Creates a future with a reader and writer.
 *
 * @returns {Object} An object containing:
 *   - `tx` {FutureWriter}: The writer for the future.
 *   - `rx` {FutureReader}: The reader for the future.
 *
 * @example
 * // Basic usage - creating a communication channel
 * const { tx, rx } = future();
 *
 * const message = 'Hello world!';
 * await tx.write(message);
 *
 * // first read yields the message
 * const value = await rx.read();
 * expect(value).toBe(message);
 *
 * // subsequent reads yield null
 * const noValue = await rx.read();
 * expect(noValue).toBeNull();
 */
export function future() {
  const def = deferred();
  const tx = new FutureWriter(def);
  const rx = new FutureReader(def.promise);
  return { tx, rx };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export class FutureReader {
  /** The underlying Promise to read from */
  #promise;
  /** Tracks if read() has been called (prevents multiple reads) */
  #consumed = false;

  /**
   * Constructs a FutureReader.
   *
   * @param {Promise} promise - The promise to be read.
   * @throws {Error} If the provided argument is not a promise.
   */
  constructor(promise) {
    if (!promise || typeof promise.then !== "function") {
      throw new Error("Provided future must be a Promise");
    }
    this.#promise = promise;
  }

  /**
   * Reads the value from the promise. Can only be called once.
   *
   * @returns {Promise<any>} Resolves with the value of the promise or null if already consumed.
   * @throws {Error} If the promise is rejected.
   */
  async read() {
    if (this.#consumed) {
      return null;
    }
    try {
      return await this.#promise;
    } catch (err) {
      throw err;
    } finally {
      this.#consumed = true;
    }
  }

  /**
   * Cancels the future. Not supported for FutureReader.
   */
  async cancel() {
    throw new Error("FutureReader does not support cancel");
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
  intoPromise() {
    const promise = this.#promise;
    this.#promise = null;
    return promise;
  }
}

export class FutureWriter {
  /** Deferred object with resolve/reject methods for controlling promise state */
  #deferred;
  /** Tracks if writer has been used */
  #written = false;

  /**
   * Constructs a FutureWriter.
   *
   * @param {Object} deferred - A deferred object with `resolve` and `reject` methods.
   * @throws {Error} If the deferred object is invalid.
   */
  constructor(deferred) {
    if (!deferred || typeof deferred.resolve !== "function") {
      throw new Error("Provided deferred object must have a resolve method");
    }
    this.#deferred = deferred;
  }

  /**
   * Resolves the promise with the given value.
   *
   * @param {any} value - The value to resolve the promise with.
   * @throws {Error} If the writer is already closed.
   */
  async write(value) {
    this.#ensureState();
    this.#written = true;
    this.#deferred.resolve(value);
  }

  /**
   * Rejects the promise with the given reason.
   *
   * @param {any} reason - The reason for rejecting the promise.
   * @throws {Error} If the writer is already closed.
   */
  async abort(reason) {
    this.#ensureState();
    this.#written = true;
    this.#deferred.reject(reason);
  }

  /**
   * Resolves the promise with null and closes the writer.
   */
  async close() {
    this.#ensureState();
    this.#written = true;
    this.#deferred.resolve(null);
  }

  /**
   * Rejects the promise with the given error and closes the writer.
   *
   * @param {Error} error - The error to reject the promise with.
   */
  async closeWithError(error) {
    this.#ensureState();
    this.#written = true;
    this.#deferred.reject(error);
  }

  /**
   * Converts the writer back into a promise.
   *
   * @returns {Promise} The original promise.
   */
  intoPromise() {
    this.close();
    const promise = this.#deferred.promise;
    this.#deferred = null;
    return promise;
  }

  #ensureState() {
    if (this.#written) {
      throw new Error("FutureWriter is closed (already written)");
    }
  }
}
