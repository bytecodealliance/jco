import { EventEmitter } from "../internal/event-emitter.js";
import { incomingHeaders } from "./headers.js";
import type { HttpImplementationResponse, HttpIncomingRequestData } from "./types.js";

export type IncomingHeaderValue = string | string[] | undefined;

interface WritableDestination {
  write(chunk: Uint8Array | string): unknown;
  end?(): unknown;
}

export class IncomingMessage extends EventEmitter implements AsyncIterable<Uint8Array | string> {
  readonly aborted = false;
  readonly complete = true;
  readonly httpVersion: string;
  readonly httpVersionMajor: number;
  readonly httpVersionMinor: number;
  readonly headers: Record<string, string | string[]>;
  readonly headersDistinct: Record<string, string[]>;
  readonly rawHeaders: string[];
  readonly trailers: Record<string, string | string[]> = {};
  readonly trailersDistinct: Record<string, string[]> = {};
  readonly rawTrailers: string[] = [];
  readonly statusCode: number | undefined;
  readonly statusMessage: string | undefined;
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly socket:
    | { remoteAddress?: string; remotePort?: number; remoteFamily?: "IPv4" | "IPv6" }
    | undefined;
  readonly signal: AbortSignal | undefined = undefined;
  closed = false;
  destroyed = false;
  readable = true;
  readableEnded = false;
  errored: Error | null = null;
  #body: Uint8Array;
  #read = false;
  #encoding: string | undefined;
  #started = false;

  constructor(message: HttpImplementationResponse | HttpIncomingRequestData) {
    super();
    const [major = 1, minor = 1] = message.httpVersion.split(".").map(Number);
    const { headers, rawHeaders } = incomingHeaders(message.headers);
    this.httpVersion = message.httpVersion;
    this.httpVersionMajor = major;
    this.httpVersionMinor = minor;
    this.headers = headers;
    this.headersDistinct = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name,
        Array.isArray(value) ? [...value] : [value],
      ]),
    );
    this.rawHeaders = rawHeaders;
    if ("statusCode" in message) {
      this.statusCode = message.statusCode;
      this.statusMessage = message.statusMessage;
      this.method = undefined;
      this.url = undefined;
      this.socket = undefined;
    } else {
      this.statusCode = undefined;
      this.statusMessage = undefined;
      this.method = message.method;
      this.url = message.url;
      this.socket = {
        remoteAddress: message.remoteAddress,
        remotePort: message.remotePort,
        remoteFamily:
          message.remoteAddress === undefined
            ? undefined
            : message.remoteAddress.includes(":")
              ? "IPv6"
              : "IPv4",
      };
    }
    this.#body = message.body.slice();
  }

  get connection(): IncomingMessage["socket"] {
    return this.socket;
  }

  setEncoding(encoding: string): this {
    this.#encoding = encoding;
    return this;
  }

  read(): Uint8Array | string | null {
    if (this.#read) {
      return null;
    }
    this.#read = true;
    return this.#decodedBody();
  }

  resume(): this {
    this._start();
    return this;
  }

  pause(): this {
    return this;
  }

  pipe(destination: WritableDestination): WritableDestination {
    const body = this.#decodedBody();
    if (this.#body.byteLength > 0) {
      destination.write(body);
    }
    destination.end?.();
    this._start();
    return destination;
  }

  setTimeout(_milliseconds: number, callback?: () => void): this {
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
    this.readable = false;
    this.errored = error ?? null;
    queueMicrotask(() => {
      if (error) {
        this.emit("error", error);
      }
      this.closed = true;
      this.emit("close");
    });
    return this;
  }

  _start(): void {
    if (this.#started || this.destroyed) {
      return;
    }
    this.#started = true;
    queueMicrotask(() => {
      if (this.destroyed) {
        return;
      }
      if (this.#body.byteLength > 0) {
        this.#read = true;
        this.emit("data", this.#decodedBody());
      }
      this.readable = false;
      this.readableEnded = true;
      this.emit("end");
      this.closed = true;
      this.emit("close");
    });
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array | string> {
    if (!this.#read && this.#body.byteLength > 0) {
      this.#read = true;
      yield this.#decodedBody();
    }
    this.readable = false;
    this.readableEnded = true;
  }

  #decodedBody(): Uint8Array | string {
    if (!this.#encoding) {
      return this.#body.slice();
    }
    return new TextDecoder(this.#encoding).decode(this.#body);
  }
}
