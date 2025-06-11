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
        { highWaterMark: readableHWM }
    );

    const tx = new StreamWriter(transform.writable);
    const rx = new StreamReader(transform.readable);

    return { tx, rx };
}

export class StreamReader {
    /** Reference to the original stream object that implements getReader */
    #stream = null;
    /** Active reader obtained from the stream */
    #reader = null;

    /**
     * Constructs a StreamReader.
     *
     * @param {ReadableStream} readable - The readable stream to consume.
     * @throws {Error} If the provided stream does not implement `getReader`.
     */
    constructor(readable) {
        if (!readable || typeof readable.getReader !== 'function') {
            throw new Error(
                'Failed to create StreamReader: provided readable must implement getReader()'
            );
        }
        this.#stream = readable;
        this.#reader = readable.getReader();
    }

    /**
     * Reads the next chunk from the stream.
     *
     * @returns {Promise<any>} Resolves with the next chunk or null if the stream is done.
     */
    async read() {
        this.#ensureReader();

        const { done, value } = await this.#reader.read();
        if (done) {
            this.close();
            return null;
        }
        return value;
    }

    /**
     * Reads all chunks from the stream and concatenates them into a buffer.
     *
     * @returns {Promise<Buffer>} Resolves with the concatenated buffer.
     */
    async readAll() {
        this.#ensureReader();

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
     * Cancels the stream with the given reason.
     *
     * @param {*} reason - The reason for canceling the stream.
     * @returns {Promise<undefined>}
     */
    async cancel(reason) {
        this.#ensureReader();
        return this.#reader.cancel(reason);
    }

    /**
     * Closes the reader and releases the lock on the stream.
     */
    close() {
        if (!this.#reader) {
            return;
        }
        if (typeof this.#reader.releaseLock === 'function') {
            this.#reader.releaseLock();
        }
        this.#reader = null;
    }

    /**
     * Converts the reader back into a readable stream.
     *
     * @returns {ReadableStream} The original readable stream that implements `getReader()`.
     */
    intoReadableStream() {
        this.close();
        const stream = this.#stream;
        this.#stream = null;
        return stream;
    }

    #ensureReader() {
        if (this.#reader === null) {
            throw new Error('StreamReader is closed');
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
        if (!writable || typeof writable.getWriter !== 'function') {
            throw new Error('Provided writable must implement getWriter()');
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
        await this.#writer.close();
        this.#writer = null;
    }

    /**
     * Closes the writer with an error.
     *
     * @param {Error} error - The error to close the writer with.
     * @returns {Promise<void>}
     */
    async closeWithError(error) {
        this.#ensureWriter();
        await this.#writer.abort(error);
        this.#writer = null;
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
            throw new Error('StreamWriter is closed');
        }
    }
}
