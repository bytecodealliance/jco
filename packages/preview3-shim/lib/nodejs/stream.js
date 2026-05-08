export const DEFAULT_BYTE_STREAM_CHUNK_SIZE = 64 * 1024;

let BYTE_STREAM_ENCODER = null;
function encoder() {
  return (BYTE_STREAM_ENCODER ??= new TextEncoder());
}

/**
 * Creates a transferable ReadableStream from an async iterator.
 *
 * Use this when a StreamReader's contents need to be sent to a worker thread,
 * since async iterators are not transferable.
 *
 * @param {AsyncIterator} iterator - The async iterator to wrap.
 * @param {string} [name="iterator"] - Optional name for error messages.
 * @returns {ReadableStream} A transferable ReadableStream that pulls from the iterator.
 */
export function readableStreamFromIterator(iterator, name = "iterator") {
  if (
    iterator == null ||
    iterator == undefined ||
    typeof iterator[Symbol.asyncIterator] !== "function"
  ) {
    throw new TypeError(`${name} must implement [Symbol.asyncIterator]()`);
  }

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    cancel() {
      return iterator.return?.();
    },
  });
}

/**
 * Creates a transferable ReadableStream from a byte-stream reader.
 *
 * Generated p3 stream readers expose `read({ count })`, which performs one
 * bounded Canonical ABI stream read for up to `count` bytes. Prefer that path so
 * host byte sinks consume practical chunks instead of one byte at a time.
 *
 * @param {object} reader - Reader that provides `read()`, or `[Symbol.asyncIterator]()`.
 * @param {object} [opts={}] - Optional adapter settings.
 * @param {number} [opts.chunkSize=DEFAULT_BYTE_STREAM_CHUNK_SIZE] - Maximum bytes to request per generated `read()` call.
 * @param {string} [opts.name="stream reader"] - Reader name used in error messages.
 * @returns {ReadableStream<Uint8Array>} A transferable stream of byte chunks.
 */
export function readableByteStreamFromReader(reader, opts = {}) {
  const source = byteStreamSource(reader, opts);
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await source.read();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(byteChunk(value));
    },
    cancel(reason) {
      return source.cancel?.(reason);
    },
  });
}

function byteStreamSource(reader, opts) {
  const name = opts.name ?? "stream reader";
  const chunkSize = opts.chunkSize ?? DEFAULT_BYTE_STREAM_CHUNK_SIZE;
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new TypeError(`invalid byte stream chunk size [${chunkSize}]`);
  }

  if (typeof reader?.read === "function") {
    return {
      async read() {
        const result = await reader.read({ count: chunkSize });
        if (isIteratorResult(result)) {
          return result;
        }
        return { value: result, done: result === null };
      },
    };
  }

  if (typeof reader?.[Symbol.asyncIterator] === "function") {
    const iterator = reader[Symbol.asyncIterator]();
    return {
      read() {
        return iterator.next();
      },
      cancel(reason) {
        return iterator.return?.(reason);
      },
    };
  }

  throw new TypeError(`${name} must provide read() or [Symbol.asyncIterator]()`);
}

function isIteratorResult(value) {
  return value != null && typeof value === "object" && typeof value.done === "boolean";
}

function byteChunk(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    for (const byte of value) {
      assertByte(byte);
    }
    return Uint8Array.from(value);
  }
  if (typeof value === "number") {
    return Uint8Array.of(assertByte(value));
  }
  if (typeof value === "string") {
    return encoder().encode(value);
  }

  throw new TypeError(
    "byte stream chunk must be a byte, byte array, ArrayBuffer, Uint8Array, or string",
  );
}

function assertByte(value) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`Invalid byte stream value: ${value}`);
  }
  return value;
}

/**
 * Creates a bidirectional stream with separate reader and writer interfaces.
 *
 * Uses a TransformStream internally.
 *
 * @param {Object} [opts={}] - Configuration options for the stream.
 * @param {number} [opts.readableHWM=65536] - High water mark for the readable side (bytes).
 * @param {number} [opts.writableHWM=65536] - High water mark for the writable side (bytes).
 *
 * @returns {Object} An object containing:
 *   - `tx` {StreamWriter}: The writer for sending data to the stream.
 *   - `rx` {StreamReader}: The reader for receiving data from the stream.
 *
 * @example
 *
 * const { tx, rx } = stream();
 * const payload = Buffer.from('roundtrip');
 *
 * await tx.write(payload);
 * await tx.close();
 *
 * const chunk1 = await rx.read();
 * expect(chunk1).toEqual(payload);
 *
 * const done = await rx.read();
 * expect(done).toBeNull();
 *
 */
export function stream(opts = {}) {
  const { readableHWM = 64 * 1024, writableHWM = 64 * 1024 } = opts;

  const transform = new TransformStream(
    {},
    { highWaterMark: writableHWM },
    { highWaterMark: readableHWM },
  );

  const tx = new StreamWriter(transform.writable);
  const rx = new StreamReader(transform.readable);

  return { tx, rx };
}

export class StreamReader {
  /** Original source ReadableStream or AsyncIterable */
  #source = null;
  /** Active async iterator obtained from the source */
  #iterator = null;
  /** Whether the iterator completed on next() call */
  #done = false;

  /**
   * Constructs a StreamReader.
   *
   * @param {AsyncIterable|Iterable} source - An async or sync iterable to consume e.g. ReadableStream, async generator, array.
   * @throws {Error} If the provided source does not implement `[Symbol.asyncIterator]` or `[Symbol.iterator]`.
   */
  constructor(source) {
    if (
      !source ||
      (typeof source[Symbol.asyncIterator] !== "function" &&
        typeof source[Symbol.iterator] !== "function")
    ) {
      throw new Error(
        "Failed to create StreamReader: provided source must implement [Symbol.asyncIterator]() or [Symbol.iterator]()",
      );
    }
    this.#source = source;
    // For ReadableStream, use values() with preventCancel so the underlying
    // stream is not cancelled when the iterator is released.
    if (source instanceof ReadableStream) {
      this.#iterator = source.values({ preventCancel: true });
    } else if (typeof source[Symbol.asyncIterator] === "function") {
      this.#iterator = source[Symbol.asyncIterator]();
    } else {
      // Wrap a sync iterator as an async one
      const syncIterator = source[Symbol.iterator]();
      this.#iterator = {
        next() {
          return Promise.resolve(syncIterator.next());
        },
        return(val) {
          return Promise.resolve(
            syncIterator.return ? syncIterator.return(val) : { done: true, value: val },
          );
        },
      };
    }
  }

  /**
   * Reads the next chunk from the stream.
   *
   * @returns {Promise<any>} Resolves with the next chunk or null if the stream is done.
   */
  async read() {
    if (this.#done) {
      return null;
    }
    this.#ensureIterator();

    const { done, value } = await this.#iterator.next();
    if (done) {
      this.#done = true;
      this.#iterator = null;
      return value !== undefined ? value : null;
    }
    return value;
  }

  /**
   * Reads all chunks from the stream and concatenates them into a buffer.
   *
   * @returns {Promise<Buffer>} Resolves with the concatenated buffer.
   */
  async readAll() {
    this.#ensureIterator();

    const chunks = [];
    let c;
    try {
      while ((c = await this.read()) !== null) {
        chunks.push(c);
      }

      return Buffer.concat(chunks);
    } finally {
      this.close();
    }
  }

  /**
   * Cancels the stream, signalling a premature exit to the iterator.
   *
   * @returns {Promise<void>}
   */
  async cancel(_reason) {
    this.#ensureIterator();
    if (typeof this.#iterator.return === "function") {
      await this.#iterator.return();
    }
    this.#iterator = null;
  }

  /**
   * Closes the reader and releases the iterator.
   * Only calls return() if the iterator hasn't completed naturally,
   * since return() is meant for premature exits only.
   */
  close() {
    if (!this.#iterator) {
      return;
    }
    if (!this.#done && typeof this.#iterator.return === "function") {
      this.#iterator.return();
    }
    this.#iterator = null;
  }

  /**
   * Consumes the reader and returns the underlying async iterator.
   *
   * After calling this method the StreamReader is closed and must not be used.
   *
   * @returns {AsyncIterator} The remaining async iterator.
   */
  intoAsyncIterator() {
    const iterator = this.#iterator;
    this.#iterator = null;
    this.#source = null;

    if (!iterator) {
      throw new Error("StreamReader is closed");
    }

    return iterator;
  }

  /**
   * Implements the async-iterable protocol so a StreamReader can be used
   * directly with `for await…of` and any helper that consumes an
   * async iterator (e.g. `readableStreamFromIterator`). Like
   * `intoAsyncIterator()` above, this consumes the reader.
   *
   * @returns {AsyncIterator}
   */
  [Symbol.asyncIterator]() {
    return this.intoAsyncIterator();
  }

  #ensureIterator() {
    if (this.#iterator === null) {
      throw new Error("StreamReader is closed");
    }
  }
}

export class StreamWriter {
  /** Reference to the original stream object that implements getWriter */
  #stream = null;
  /** Active reader obtained from the stream */
  #writer = null;

  /**
   * Constructs a StreamWriter.
   *
   * @param {WritableStream} writable - The writable stream to write to.
   * @throws {Error} If the provided stream does not implement `getWriter`.
   */
  constructor(writable) {
    if (!writable || typeof writable.getWriter !== "function") {
      throw new Error("Provided writable must implement getWriter()");
    }
    this.#stream = writable;
    this.#writer = writable.getWriter();
  }

  /**
   * Writes a chunk to the stream.
   *
   * @param {*} chunk - The chunk to write.
   * @returns {Promise<void>}
   */
  async write(chunk) {
    this.#ensureWriter();
    return this.#writer.write(chunk);
  }

  /**
   * Aborts the stream with the given reason.
   *
   * @param {*} reason - The reason for aborting the stream.
   * @returns {Promise<void>}
   */
  async abort(reason) {
    this.#ensureWriter();
    return this.#writer.abort(reason);
  }

  /**
   * Closes the writer and the stream.
   *
   * @returns {Promise<void>}
   */
  async close() {
    this.#ensureWriter();
    const writer = this.#writer;
    this.#writer = null;
    await writer.close();
  }

  /**
   * Closes the writer with an error.
   *
   * @param {Error} error - The error to close the writer with.
   * @returns {Promise<void>}
   */
  async closeWithError(error) {
    this.#ensureWriter();
    const writer = this.#writer;
    this.#writer = null;
    await writer.abort(error);
  }

  /**
   * Converts the writer back into a writable stream.
   *
   * @returns {WritableStream} The original writable stream that implements `getWriter()`.
   */
  async intoWritableStream() {
    const stream = this.#stream;
    this.#writer = null;
    this.#stream = null;
    return stream;
  }

  #ensureWriter() {
    if (this.#writer === null) {
      throw new Error("StreamWriter is closed");
    }
  }
}
