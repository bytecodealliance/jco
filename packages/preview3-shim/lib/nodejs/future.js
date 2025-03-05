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

  constructor(promise) {
    if (!(promise instanceof Promise)) {
      throw new Error("Provided future must be a Promise");
    }
    this.#promise = promise;
  }

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

  async cancel(reason) {
    throw new Error("Cancel not supported for FutureReader");
  }

  close() {
    // Nothing to release.
  }

  intoFuture() {
    this.close();
    return this.#promise;
  }
}

export class FutureWriter {
  #deferred;
  #written = false;

  constructor(deferred) {
    if (!deferred || typeof deferred.resolve !== "function") {
      throw new Error("Provided deferred object must have a resolve method");
    }
    this.#deferred = deferred;
  }

  async write(value) {
    if (this.#written) throw new Error("FutureWriter is closed");
    this.#written = true;
    this.#deferred.resolve(value);
  }

  async abort(reason) {
    if (this.#written) throw new Error("FutureWriter is closed");
    this.#written = true;
    this.#deferred.reject(reason);
  }

  async close() {
    if (this.#written) return;
    this.#written = true;
    this.#deferred.resolve(null);
  }

  async closeWithError(error) {
    if (this.#written) return;
    this.#written = true;
    this.#deferred.reject(error);
  }

  intoFuture() {
    this.close();
    return this.#deferred.promise;
  }
}

export function future() {
  const def = deferred();
  const writer = new FutureWriter(def);
  const reader = new FutureReader(def.promise);
  return [writer, reader];
}
