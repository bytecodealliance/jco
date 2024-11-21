// wasi:io/streams@0.2.0 interface

import { Pollable } from "./poll.js";
import { IoError } from "./error.js";

export class InputStream {
  #closed = false;
  #reader = null;
  #buffer = new Uint8Array();

  /**
   * @param {ReadableStream|undefined} stream
   */
  constructor(stream) {
    if (stream) {
      this.#reader = stream.getReader();
    } else {
      this.#closed = true;
    }
  }

  async #fillBuffer() {
    const { value, done } = await this.#reader.read();
    if (done) this.#closed = done;
    this.#buffer = value || new Uint8Array(0);
  }

  /**
   * @param {number|bigint} len
   * @returns {Uint8Array}
   */
  read(len) {
    if (this.#buffer.byteLength === 0 && this.#closed) throw { tag: 'closed' };
    const n = Number(len);
    if (n >= this.#buffer.byteLength) {
      // read all that is in the buffer and reset buffer
      const buf = this.#buffer;
      this.#buffer = new Uint8Array(0);
      return buf;
    } else {
      // read portion of the buffer and advance the buffer for next read
      const buf = this.#buffer.subarray(0, n);
      this.#buffer = this.#buffer.subarray(n);
      return buf;
    }
  }

  /**
   * @param {number|bigint} len
   * @returns {Promise<Uint8Array>}
   */
  async blockingRead(len) {
    // if buffer has data, read that first
    if (this.#buffer.byteLength > 0) return this.read(len);
    if (this.#buffer.byteLength === 0 && this.#closed) throw { tag: 'closed' };
    await this.#fillBuffer();
    return this.read(len);
  }

  /**
   * @param {number|bigint} len
   * @returns {bigint}
   */
  skip(len) {
    if (this.#buffer.byteLength === 0 && this.#closed) throw { tag: 'closed' };
    const n = Number(len);
    if (n >= this.#buffer.byteLength) {
      // skip all in buffer
      const skipped = BigInt(this.#buffer.byteLength);
      this.#buffer = new Uint8Array(0);
      return skipped;
    } else {
      // skip part of the buffer
      this.#buffer = this.#buffer.subarray(n);
      return len;
    }
  }

  /**
   * @param {number|bigint} len
   * @returns {Promise<bigint>}
   */
  async blockingSkip(len) {
    // if buffer has data, skip that first
    if (this.#buffer.byteLength > 0) return this.skip(len);
    await this.#fillBuffer();
    return this.skip(len);
  }

  /**
   * @returns {Pollable}
   */
  subscribe() {
    // return ready pollable if has bytes in buffer
    if (this.#buffer.byteLength > 0) return new Pollable();
    return new Pollable(this.#fillBuffer());
  }
}

export class OutputStream {
  #readable;
  #readableController;
  #writer;
  #prevWritePromise;
  #prevWriteError;
  #closed = false;

  /**
   * @param {WritableStream|undefined} stream
   */
  constructor(stream) {
    if (stream) {
      this.#writer = stream.getWriter();
    } else {
      // enqueue a ReadableStream internally
      this.readable = new ReadableStream({
        start: (controller) => {
          this.#readableController = controller;
        },
        cancel: () => {
          this.#closed = true;
        },
        type: 'bytes',
        autoAllocateChunkSize: 4096,
      });
    }
  }

  /**
   * @returns {ReadableStream|undefined}
   */
  getReadableStream() {
    return this.#readable;
  }

  close() {
    this.#closed = true;
    if (this.#readableController) {
      this.#readableController.close();
    } else {
      this.#writer.close();
    }
  }

  /**
   * @returns {bigint}
   */
  checkWrite() {
    if (this.#closed) throw { tag: 'closed' };
    if (this.#prevWriteError) {
      const err = this.#prevWriteError;
      this.#prevWriteError = null;
      throw err;
    }
    if (this.#prevWritePromise) return 0n; // not ready, waiting on previous write
    return 4096n; // TODO for WritableStream
  }

  /**
   * @param {Uint8Array} contents
   */
  write(contents) {
    if (this.#closed) throw { tag: 'closed' };
    if (this.#readableController) {
      this.#readableController?.enqueue(contents);
    } else if (this.#prevWritePromise) {
      throw new Error("waiting for previous write to finish");
    } else {
      this.#prevWritePromise = this.#writer.write(contents).then(
        () => {
          this.#prevWritePromise = null;
        },
        (err) => {
          this.#prevWriteError = { tag: 'last-operation-failed', val: new IoError(err.toString()) };
          this.#prevWritePromise = null;
        },
      );
    }
  }

  /**
   * @param {Uint8Array} contents
   * @returns {Promise<void>}
   */
  async blockingWriteAndFlush(contents) {
    if (this.#readableController) {
      this.#readableController?.enqueue(contents);
    } else if (this.#prevWritePromise) {
      throw new Error("waiting for previous write to finish");
    } else {
      try {
        await this.#writer.write(contents);
      } catch (err) {
        throw { tag: 'last-operation-failed', val: new IoError(err.toString()) };
      }
    }
  }

  flush() {
    if (this.#closed) throw { tag: 'closed' };
    if (this.#prevWriteError) {
      const err = this.#prevWriteError;
      this.#prevWriteError = null;
      throw err;
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async blockingFlush() {
    if (this.#closed) throw { tag: 'closed' };
    if (this.#prevWritePromise) {
      await this.#prevWritePromise;
      if (this.#prevWriteError) {
        const err = this.#prevWriteError;
        this.#prevWriteError = null;
        throw err;
      }
    }
  }

  /**
   * @returns {Pollable}
   */
  subscribe() {
    return new Pollable(this.#prevWritePromise);
  }

  /**
   * @param {number|bigint} len
   */
  writeZeroes(len) {
    this.write(new Uint8Array(Number(len)));
  }

  /**
   * @param {number|bigint} len
   * @returns {Promise<void>}
   */
  async blockingWriteZeroesAndFlush(len) {
    await this.blockingWriteAndFlush(new Uint8Array(Number(len)));
  }

  /**
   * @param {InputStream} src
   * @param {number|bigint} len
   * @returns {bigint}
   */
  splice(src, len) {
    const n = this.checkWrite();
    const contents = src.read(Number(len) < n ? len : n);
    this.write(contents);
    return BigInt(contents.byteLength);
  }

  /**
   * @param {InputStream} src
   * @param {number|bigint} len
   * @returns {Promise<bigint>}
   */
  async blockingSplice(src, len) {
    const n = this.checkWrite();
    const contents = await src.blockingRead(len < n ? len : n);
    await this.blockingWriteAndFlush(contents);
    return BigInt(contents.byteLength);
  }
}
