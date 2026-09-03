/**
 * Buffered OutgoingMessage base for the portable node:http shim.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/_http_outgoing.js (MIT
 * license). The header API and public state fields are kept; the
 * socket-backed output queue is replaced by an in-memory body that is handed
 * to the implementation once on end().
 */

import { EventEmitter } from "../internal/event-emitter.js";
import { bodyBytes, concatBytes } from "./body.js";
import { invalidArgType, outOfRange, unsupported, writeAfterEnd } from "./errors.js";
import { HeaderStore } from "./headers.js";
import type { HttpBodyChunk, HttpCallback, HttpHeaderValue, HttpHeaders } from "./types.js";

export class OutgoingMessage extends EventEmitter {
  readonly #body: Uint8Array[] = [];
  readonly _headers: HeaderStore;
  chunkedEncoding = false;
  shouldKeepAlive = true;
  useChunkedEncodingByDefault = true;
  sendDate = false;
  strictContentLength = false;
  destroyed = false;
  finished = false;
  writable = true;
  writableCorked = 0;
  writableEnded = false;
  writableFinished = false;
  readonly writableHighWaterMark = 16_384;
  readonly writableObjectMode = false;
  #timeout = 0;

  constructor(headers?: HttpHeaders | readonly string[]) {
    super();
    this._headers = new HeaderStore(headers);
  }

  get headersSent(): boolean {
    return this._headers.sent;
  }

  get writableLength(): number {
    return this.#body.reduce((total, chunk) => total + chunk.byteLength, 0);
  }

  get socket(): undefined {
    return undefined;
  }

  get connection(): undefined {
    return this.socket;
  }

  appendHeader(name: string, value: HttpHeaderValue): this {
    this._headers.append(name, value);
    return this;
  }

  setHeader(name: string, value: HttpHeaderValue): this {
    this._headers.set(name, value);
    return this;
  }

  setHeaders(headers: { entries(): Iterable<[string, HttpHeaderValue]> }): this {
    for (const [name, value] of headers.entries()) {
      this.setHeader(name, value);
    }
    return this;
  }

  getHeader(name: string): HttpHeaderValue | undefined {
    return this._headers.get(name);
  }

  getHeaders(): HttpHeaders {
    return this._headers.object();
  }

  getHeaderNames(): string[] {
    return this._headers.names();
  }

  getRawHeaderNames(): string[] {
    return this._headers.rawNames();
  }

  hasHeader(name: string): boolean {
    return this._headers.has(name);
  }

  removeHeader(name: string): void {
    this._headers.delete(name);
  }

  flushHeaders(): void {
    this._headers.markSent();
  }

  write(chunk: HttpBodyChunk, encoding?: string | HttpCallback, callback?: HttpCallback): boolean {
    if (this.writableEnded) {
      const error = writeAfterEnd();
      queueMicrotask(() => this.emit("error", error));
      return false;
    }
    const actualEncoding = typeof encoding === "string" ? encoding : undefined;
    const actualCallback = typeof encoding === "function" ? encoding : callback;
    this._headers.markSent();
    this.#body.push(bodyBytes(chunk, actualEncoding));
    if (actualCallback) {
      queueMicrotask(actualCallback);
    }
    return true;
  }

  end(
    chunkOrCallback?: HttpBodyChunk | HttpCallback,
    encodingOrCallback?: string | HttpCallback,
    callback?: HttpCallback,
  ): this {
    if (this.writableEnded) {
      const error = writeAfterEnd();
      queueMicrotask(() => this.emit("error", error));
      return this;
    }
    const chunk = typeof chunkOrCallback === "function" ? undefined : chunkOrCallback;
    const actualEncoding = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
    const actualCallback =
      typeof chunkOrCallback === "function"
        ? chunkOrCallback
        : typeof encodingOrCallback === "function"
          ? encodingOrCallback
          : callback;
    if (this.destroyed) {
      if (actualCallback) {
        queueMicrotask(actualCallback);
      }
      return this;
    }
    if (chunk !== undefined) {
      this.#body.push(bodyBytes(chunk, actualEncoding));
    }
    this.writableEnded = true;
    this.finished = true;
    this.writable = false;

    let deliver: (() => void) | undefined;
    let failure: unknown;
    try {
      deliver = this._finalize(concatBytes(this.#body));
    } catch (error) {
      failure = error;
    }
    this._headers.markSent();
    queueMicrotask(() => {
      if (failure !== undefined) {
        this.emit("error", failure);
        return;
      }
      this.writableFinished = true;
      this.emit("finish");
      actualCallback?.();
      deliver?.();
    });
    return this;
  }

  cork(): void {
    this.writableCorked += 1;
  }

  uncork(): void {
    this.writableCorked = Math.max(0, this.writableCorked - 1);
  }

  setTimeout(milliseconds: number, callback?: () => void): this {
    if (typeof milliseconds !== "number") {
      throw invalidArgType("msecs", "number", milliseconds);
    }
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 0xffff_ffff) {
      throw outOfRange("msecs", ">= 0 and <= 4294967295", milliseconds);
    }
    this.#timeout = Math.trunc(milliseconds);
    if (callback) {
      this.once("timeout", callback);
    }
    return this;
  }

  destroy(error?: Error): this {
    if (this.destroyed) {
      return this;
    }
    this.destroyed = true;
    this.writable = false;
    queueMicrotask(() => {
      if (error) {
        this.emit("error", error);
      }
      this.emit("close");
    });
    return this;
  }

  addTrailers(_headers: HttpHeaders): never {
    return unsupported("http.OutgoingMessage.addTrailers");
  }

  pipe(): never {
    return unsupported("http.OutgoingMessage.pipe", "outgoing HTTP messages are not readable");
  }

  _timeout(): number {
    return this.#timeout;
  }

  _finalize(_body: Uint8Array): (() => void) | undefined {
    return undefined;
  }
}
