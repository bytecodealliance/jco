import { EventEmitter } from "../internal/event-emitter.js";
import { STATUS_CODES } from "./constants.js";
import { invalidArgValue, unsupported } from "./errors.js";
import { IncomingMessage } from "./incoming-message.js";
import { OutgoingMessage } from "./outgoing-message.js";
import type { HttpBodyChunk, HttpCallback, HttpHeaderValue, HttpHeaders } from "./types.js";

export type RequestListener = (request: IncomingMessage, response: ServerResponse) => void;

export interface ServerOptions {
  requestTimeout?: number;
  headersTimeout?: number;
  keepAliveTimeout?: number;
  keepAliveTimeoutBuffer?: number;
  connectionsCheckingInterval?: number;
  maxHeaderSize?: number;
  joinDuplicateHeaders?: boolean;
  noDelay?: boolean;
  requireHostHeader?: boolean;
  keepAlive?: boolean;
  keepAliveInitialDelay?: number;
  rejectNonStandardBodyWrites?: boolean;
  optimizeEmptyRequests?: boolean;
  [name: string]: unknown;
}

export class ServerResponse extends OutgoingMessage {
  readonly req: IncomingMessage;
  statusCode = 200;
  statusMessage = "";
  sendDate = true;
  strictContentLength = false;

  constructor(request: IncomingMessage) {
    super();
    this.req = request;
  }

  writeHead(
    statusCode: number,
    statusMessageOrHeaders?: string | HttpHeaders,
    headers?: HttpHeaders,
  ): this {
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 999) {
      throw invalidArgValue("statusCode", statusCode);
    }
    this.statusCode = statusCode;
    if (typeof statusMessageOrHeaders === "string") {
      this.statusMessage = statusMessageOrHeaders;
    } else {
      headers = statusMessageOrHeaders;
    }
    for (const [name, value] of Object.entries(headers ?? {})) {
      if (value !== undefined) {
        this.setHeader(name, value);
      }
    }
    this.flushHeaders();
    return this;
  }

  writeContinue(callback?: HttpCallback): void {
    callback?.();
  }

  writeProcessing(): void {}

  writeEarlyHints(_hints: HttpHeaders, callback?: HttpCallback): void {
    callback?.();
  }

  writeInformation(_statusCode: number, _headers?: HttpHeaders, callback?: HttpCallback): void {
    callback?.();
  }

  _finalize(_body: Uint8Array): undefined {
    if (!this.statusMessage) {
      this.statusMessage = STATUS_CODES[this.statusCode] ?? "";
    }
    return undefined;
  }

  appendHeader(name: string, value: HttpHeaderValue): this {
    return super.appendHeader(name, value);
  }

  end(
    chunkOrCallback?: HttpBodyChunk | HttpCallback,
    encodingOrCallback?: string | HttpCallback,
    callback?: HttpCallback,
  ): this {
    return super.end(chunkOrCallback, encodingOrCallback, callback);
  }
}

export class Server extends EventEmitter {
  readonly options: ServerOptions;
  listening = false;
  maxHeadersCount: number | null = null;
  maxRequestsPerSocket: number | null = 0;
  timeout = 0;
  headersTimeout: number;
  keepAliveTimeout: number;
  keepAliveTimeoutBuffer: number;
  requestTimeout: number;

  constructor(optionsOrListener: ServerOptions | RequestListener = {}, listener?: RequestListener) {
    super();
    const options = typeof optionsOrListener === "function" ? {} : optionsOrListener;
    const requestListener = typeof optionsOrListener === "function" ? optionsOrListener : listener;
    this.options = { ...options };
    this.headersTimeout = options.headersTimeout ?? 60_000;
    this.keepAliveTimeout = options.keepAliveTimeout ?? 5_000;
    this.keepAliveTimeoutBuffer = options.keepAliveTimeoutBuffer ?? 1_000;
    this.requestTimeout = options.requestTimeout ?? 300_000;
    if (requestListener) {
      this.on("request", requestListener);
    }
  }

  listen(..._args: unknown[]): never {
    return unsupported(
      "http.Server.listen",
      "WIT imports cannot invoke an arbitrary guest request callback; use a wasi:http incoming-handler component export",
    );
  }

  close(_callback?: HttpCallback): never {
    return unsupported("http.Server.close", "HTTP servers cannot be started by this adapter");
  }

  closeAllConnections(): never {
    return unsupported(
      "http.Server.closeAllConnections",
      "HTTP servers cannot be started by this adapter",
    );
  }

  closeIdleConnections(): never {
    return unsupported(
      "http.Server.closeIdleConnections",
      "HTTP servers cannot be started by this adapter",
    );
  }

  setTimeout(milliseconds = 0, callback?: (...args: never[]) => unknown): this {
    this.timeout = milliseconds;
    if (callback) {
      this.on("timeout", callback);
    }
    return this;
  }

  address(): null {
    return null;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  [Symbol.asyncDispose](): Promise<void> {
    try {
      unsupported(
        "http.Server[Symbol.asyncDispose]",
        "HTTP servers cannot be started by this adapter",
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

export function createServer(
  optionsOrListener: ServerOptions | RequestListener = {},
  listener?: RequestListener,
): Server {
  return new Server(optionsOrListener, listener);
}

export function connectionListener(..._args: unknown[]): never {
  return unsupported(
    "http._connectionListener",
    "raw inbound sockets cannot call into guest JavaScript",
  );
}
