import { Io } from '../common/io.js';

// buffer until the next newline
export class NewlineBufferStream {
  constructor (handler) {
    this.bufferLen = 0;
    this.bufferCapacity = 1024;
    this.buffer = new Uint8Array(1024);
    this.handler = handler;
  }
  write (bytes) {
    const newlineIdx = bytes.lastIndexOf(10);
    if (newlineIdx === -1) {
      this.#addToBuffer(bytes);
    } else {
      this.#addToBuffer(bytes.slice(0, newlineIdx + 1));
      this.handler(new TextDecoder().decode(this.buffer.slice(0, this.bufferLen)));
      this.bufferLen = 0;
      this.#addToBuffer(bytes.slice(newlineIdx + 1));
    }
  }
  #addToBuffer (bytes) {
    if (bytes.byteLength + this.bufferLen > this.bufferCapacity) {
      this.bufferCapacity *= 2;
      const buffer = new Uint8Array(this.bufferCapacity);
      buffer.set(this.buffer);
      this.buffer = buffer;
    }
    this.buffer.set(bytes, this.bufferLen);
    this.bufferLen += bytes.byteLength;
  }
}

export const _io = new Io(
  new NewlineBufferStream(console.log.bind(console)),
  new NewlineBufferStream(console.error.bind(console))
);

export const streams = _io.streams;
