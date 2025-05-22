export class StreamReader {
    #stream = null;
    #reader = null;

    /**
     * Constructs a StreamReader.
     *
     * @param {ReadableStream} readable - The readable stream to consume.
     * @throws {Error} If the provided stream does not implement `getReader`.
     */
    constructor(readable) {
        if (!readable || typeof readable.getReader !== 'function') {
            throw new Error('Provided readable must implement getReader()');
        }
        this.#stream = readable;
        this.#reader = readable.getReader();
    }

    /**
     * Reads the next chunk from the stream.
     *
     * @returns {Promise<*>} Resolves with the next chunk or null if the stream is done.
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
     * @returns {Promise<void>}
     */
    async cancel(reason) {
        this.#ensureReader();
        return this.#reader.cancel(reason);
    }

    /**
     * Closes the reader and releases the lock on the stream.
     */
    close() {
        if (this.#reader) {
            this.#reader.releaseLock();
            this.#reader = null;
        }
    }

    /**
     * Converts the reader back into a readable stream.
     *
     * @returns {ReadableStream} The original readable stream.
     */
    intoStream() {
        this.close();
        return this.#stream;
    }

    #ensureReader() {
        if (this.#reader === null) {
            throw new Error('StreamReader is closed');
        }
    }
}

export class StreamWriter {
    #stream = null;
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
        if (this.#writer) {
            await this.#writer.close();
        }

        this.#writer = null;
    }

    /**
     * Closes the writer with an error.
     *
     * @param {Error} error - The error to close the writer with.
     * @returns {Promise<void>}
     */
    async closeWithError(error) {
        if (this.#writer) {
            await this.#writer.abort(error);
            this.#writer = null;
        }
    }

    /**
     * Converts the writer back into a writable stream.
     *
     * @returns {WritableStream} The original writable stream.
     */
    async intoStream() {
        await this.close();
        return this.#stream;
    }

    #ensureWriter() {
        if (this.#writer === null) {
            throw new Error('StreamWriter is closed');
        }
    }
}

export function stream() {
    const transform = new TransformStream(
        {},
        { highwatermark: 64 * 1024 },
        { highWaterMark: 64 * 1024 }
    );
    const tx = new StreamWriter(transform.writable);
    const rx = new StreamReader(transform.readable);

    return { tx, rx };
}
