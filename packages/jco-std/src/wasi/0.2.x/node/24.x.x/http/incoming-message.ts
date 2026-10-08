import { EventEmitter } from "../internal/event-emitter.js";
import { Readable } from "node:stream";
import { Buffer } from "node:buffer";
import { incomingHeaders } from "./headers.js";
import type { HttpImplementationResponse, HttpIncomingRequestData } from "./types.js";

export type IncomingHeaderValue = string | string[] | undefined;

export class IncomingMessage extends Readable {
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
    | {
        readable: boolean;
        writable: boolean;
        remoteAddress?: string;
        remotePort?: number;
        remoteFamily?: "IPv4" | "IPv6";
      }
    | undefined;
  readonly signal: AbortSignal | undefined = undefined;
  #body: Uint8Array;
  #offset = 0;

  constructor(message: HttpImplementationResponse | HttpIncomingRequestData) {
    super({ autoDestroy: false });
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
      this.socket = Object.assign(new EventEmitter(), {
        // The buffered request is complete at the transport, but its body has not
        // been consumed. Middleware uses the socket state to distinguish those cases.
        readable: true,
        writable: true,
        remoteAddress: message.remoteAddress,
        remotePort: message.remotePort,
        setTimeout: (ms: number) => {
          message.connection?.setTimeout(ms);
          return this.socket;
        },
        setNoDelay: (value = true) => {
          message.connection?.setNoDelay(value);
          return this.socket;
        },
        setKeepAlive: (value = false, delay = 0) => {
          message.connection?.setKeepAlive(value, delay);
          return this.socket;
        },
        remoteFamily:
          message.remoteAddress === undefined
            ? undefined
            : message.remoteAddress.includes(":")
              ? ("IPv6" as const)
              : ("IPv4" as const),
      });
    }
    this.#body = message.body.slice();
  }

  get connection(): IncomingMessage["socket"] {
    return this.socket;
  }

  _read(size: number): void {
    if (this.#offset === this.#body.length) {
      this.push(null);
      return;
    }
    const end = Math.min(this.#offset + size, this.#body.length);
    const chunk = Buffer.from(this.#body.subarray(this.#offset, end));
    this.#offset = end;
    this.push(chunk);
  }

  setTimeout(_milliseconds: number, callback?: () => void): this {
    if (callback) {
      this.once("timeout", callback);
    }
    return this;
  }

  _start(): void {
    if (this.listenerCount("data") || this.listenerCount("end")) {
      this.resume();
    }
  }
}
