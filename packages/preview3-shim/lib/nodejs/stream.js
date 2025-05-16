export class StreamReader {
    #stream = null;
    #reader = null;

    constructor(readable) {
        if (!readable || typeof readable.getReader !== 'function') {
            throw new Error('Provided readable must implement getReader()');
        }
        this.#stream = readable;
        this.#reader = readable.getReader();
    }

    async read() {
        this.#ensureReader();

        const { done, value } = await this.#reader.read();
        if (done) {
            this.close();
            return null;
        }
        return value;
    }

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

    async cancel(reason) {
        this.#ensureReader();
        return this.#reader.cancel(reason);
    }

    close() {
        if (this.#reader) {
            this.#reader.releaseLock();
            this.#reader = null;
        }
    }

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

    constructor(writable) {
        if (!writable || typeof writable.getWriter !== 'function') {
            throw new Error('Provided writable must implement getWriter()');
        }
        this.#stream = writable;
        this.#writer = writable.getWriter();
    }

    async write(chunk) {
        this.#ensureWriter();
        return this.#writer.write(chunk);
    }

    async abort(reason) {
        this.#ensureWriter();
        return this.#writer.abort(reason);
    }

    async close() {
        if (this.#writer) {
            await this.#writer.close();
        }

        this.#writer = null;
    }

    async closeWithError(error) {
        if (this.#writer) {
            await this.#writer.abort(error);
            this.#writer = null;
        }
    }

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

    return [tx, rx];
}
