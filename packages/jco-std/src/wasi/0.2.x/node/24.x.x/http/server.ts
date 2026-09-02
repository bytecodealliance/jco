/**
 * Server and ServerResponse for the portable node:http shim.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/_http_server.js and the
 * listen errors in lib/internal/errors.js (MIT license). Option defaults and
 * the writeHead contract are kept; net.Server, the connection parser, and
 * per-socket timers are replaced by a typed server implementation that
 * returns one buffered response per request.
 */

import { EventEmitter } from "../internal/event-emitter.js";
import { parseListenArguments } from "../internal/net-server.js";
import { STATUS_CODES } from "./constants.js";
import { codedError } from "../errors/core.js";
import { invalidArgType, invalidArgValue, unsupported } from "./errors.js";
import { IncomingMessage } from "./incoming-message.js";
import { OutgoingMessage } from "./outgoing-message.js";
import type {
  HttpBodyChunk,
  HttpCallback,
  HttpErrorCallback,
  HttpHeaderValue,
  HttpHeaders,
  HttpImplementation,
  HttpIncomingRequestData,
  HttpOutgoingResponseData,
  HttpServerAddress,
  HttpServerImplementation,
} from "./types.js";

export type RequestListener = (request: IncomingMessage, response: ServerResponse) => void;
export type GetConnectionsCallback = (error: Error | null, count: number) => void;

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
  IncomingMessage?: unknown;
  ServerResponse?: unknown;
  shouldUpgradeCallback?: unknown;
  highWaterMark?: number;
  insecureHTTPParser?: boolean;
  uniqueHeaders?: Array<string | string[]>;
  [name: string]: unknown;
}

export class ServerResponse extends OutgoingMessage {
  readonly req: IncomingMessage;
  statusCode = 200;
  statusMessage = "";
  sendDate = true;
  strictContentLength = false;
  readonly #completed: Promise<HttpOutgoingResponseData>;
  #resolveCompleted!: (response: HttpOutgoingResponseData) => void;
  #rejectCompleted!: (error: unknown) => void;

  constructor(request: IncomingMessage) {
    super();
    this.req = request;
    this.#completed = new Promise((resolve, reject) => {
      this.#resolveCompleted = resolve;
      this.#rejectCompleted = reject;
    });
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
    void callback;
    unsupported(
      "http.ServerResponse.writeContinue",
      "the buffered HTTP boundary returns one final response",
    );
  }

  writeProcessing(): void {
    unsupported(
      "http.ServerResponse.writeProcessing",
      "the buffered HTTP boundary returns one final response",
    );
  }

  writeEarlyHints(_hints: HttpHeaders, callback?: HttpCallback): void {
    void callback;
    unsupported(
      "http.ServerResponse.writeEarlyHints",
      "the buffered HTTP boundary returns one final response",
    );
  }

  writeInformation(_statusCode: number, _headers?: HttpHeaders, callback?: HttpCallback): void {
    void callback;
    unsupported(
      "http.ServerResponse.writeInformation",
      "the buffered HTTP boundary returns one final response",
    );
  }

  _finalize(body: Uint8Array): undefined {
    if (!this.statusMessage) {
      this.statusMessage = STATUS_CODES[this.statusCode] ?? "";
    }
    this.#resolveCompleted({
      statusCode: this.statusCode,
      statusMessage: this.statusMessage,
      headers: this._headers.fields(),
      body,
    });
    return undefined;
  }

  _completed(): Promise<HttpOutgoingResponseData> {
    return this.#completed;
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

  destroy(error?: Error): this {
    super.destroy(error);
    this.#rejectCompleted(error ?? new Error("HTTP response was destroyed before it completed"));
    return this;
  }
}

export class ServerBase extends EventEmitter {
  readonly options: ServerOptions;
  listening = false;
  maxHeadersCount: number | null = null;
  maxRequestsPerSocket: number | null = 0;
  timeout = 0;
  headersTimeout: number;
  keepAliveTimeout: number;
  keepAliveTimeoutBuffer: number;
  requestTimeout: number;
  #server: HttpServerImplementation;

  constructor(
    implementation: HttpImplementation,
    optionsOrListener: ServerOptions | RequestListener = {},
    listener?: RequestListener,
  ) {
    super();
    if (!implementation.createServer) {
      unsupported(
        "http.Server",
        implementation.serverUnsupportedReason ??
          "the selected HTTP implementation cannot accept inbound connections",
      );
    }
    const options = typeof optionsOrListener === "function" ? {} : optionsOrListener;
    const requestListener = typeof optionsOrListener === "function" ? optionsOrListener : listener;
    for (const name of [
      "IncomingMessage",
      "ServerResponse",
      "shouldUpgradeCallback",
      "highWaterMark",
      "insecureHTTPParser",
      "uniqueHeaders",
    ] as const) {
      if (options[name] !== undefined) {
        unsupported(
          `http.Server option ${name}`,
          "this option cannot be represented by the current typed WIT boundary",
        );
      }
    }
    this.options = { ...options };
    this.headersTimeout = options.headersTimeout ?? 60_000;
    this.keepAliveTimeout = options.keepAliveTimeout ?? 5_000;
    this.keepAliveTimeoutBuffer = options.keepAliveTimeoutBuffer ?? 1_000;
    this.requestTimeout = options.requestTimeout ?? 300_000;
    if (requestListener) {
      this.on("request", requestListener);
    }
    this.#server = implementation.createServer(
      options,
      (request) => this.#handle(request),
      (error) => queueMicrotask(() => this.emit("error", error)),
    );
  }

  listen(...args: unknown[]): this {
    const { options, callback } = parseListenArguments(args);
    if (options.signal !== undefined) {
      unsupported(
        "http.Server.listen signal",
        "an AbortSignal cannot be retained across the current WIT server resource boundary",
      );
    }
    if (this.listening) {
      throw codedError(
        new Error("Listen method has been called more than once without closing."),
        "ERR_SERVER_ALREADY_LISTEN",
      );
    }
    const address = this.#server.listen(options);
    this.listening = true;
    queueMicrotask(() => {
      this.emit("listening");
      callback?.();
    });
    void address;
    return this;
  }

  close(callback?: HttpErrorCallback): this {
    try {
      const wasListening = this.#server.close();
      this.listening = false;
      queueMicrotask(() => {
        if (wasListening) {
          this.emit("close");
        }
        callback?.();
      });
    } catch (error) {
      queueMicrotask(() => callback?.(error instanceof Error ? error : new Error(String(error))));
    }
    return this;
  }

  closeAllConnections(): void {
    this.#server.closeAllConnections();
  }

  closeIdleConnections(): void {
    this.#server.closeIdleConnections();
  }

  getConnections(callback: GetConnectionsCallback): void {
    if (typeof callback !== "function") {
      throw invalidArgType("callback", "function", callback);
    }
    try {
      const count = this.#server.getConnections();
      queueMicrotask(() => callback(null, count));
    } catch (error) {
      queueMicrotask(() => callback(error instanceof Error ? error : new Error(String(error)), 0));
    }
  }

  setTimeout(milliseconds = 0, callback?: (...args: never[]) => unknown): this {
    if (milliseconds !== 0 || callback !== undefined) {
      unsupported(
        "http.Server.setTimeout",
        "timeout events require an additional server callback across the WIT boundary",
      );
    }
    this.timeout = milliseconds;
    return this;
  }

  address(): HttpServerAddress | null {
    return this.#server.address();
  }

  ref(): this {
    this.#server.ref();
    return this;
  }

  unref(): this {
    this.#server.unref();
    return this;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.close((error) => (error ? reject(error) : resolve()));
    });
  }

  async #handle(data: HttpIncomingRequestData): Promise<HttpOutgoingResponseData> {
    const request = new IncomingMessage(data);
    const response = new ServerResponse(request);
    if (!this.emit("request", request, response)) {
      unsupported("http.Server request", "the server has no request listener");
    }
    request._start();
    return response._completed();
  }
}

export interface ServerConstructor {
  new (optionsOrListener?: ServerOptions | RequestListener, listener?: RequestListener): ServerBase;
}

export function createServerConstructor(implementation: HttpImplementation): ServerConstructor {
  return class Server extends ServerBase {
    constructor(
      optionsOrListener: ServerOptions | RequestListener = {},
      listener?: RequestListener,
    ) {
      super(implementation, optionsOrListener, listener);
    }
  };
}

export function connectionListener(..._args: unknown[]): never {
  return unsupported(
    "http._connectionListener",
    "raw inbound sockets cannot call into guest JavaScript",
  );
}
