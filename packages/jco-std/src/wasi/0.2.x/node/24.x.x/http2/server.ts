import { EventEmitter } from "../internal/event-emitter.js";
import { parseListenArguments } from "../internal/net-server.js";
import { IncomingMessage } from "../http/incoming-message.js";
import { OutgoingMessage } from "../http/outgoing-message.js";
import type { HttpHeaderValue, HttpHeaders } from "../http/types.js";
import { constants } from "./constants.js";
import { codedError, deprecated, invalidArgType, unsupported } from "./errors.js";
import { fieldsToHeaders } from "./headers.js";
import { validateSettings } from "./settings.js";
import { ServerHttp2Stream } from "./stream.js";
import type {
  Http2Implementation,
  Http2IncomingStreamData,
  Http2ServerAddress,
  Http2ServerImplementation,
  Http2ServerOptions,
  Http2Settings,
} from "./types.js";

export type Http2RequestListener = (
  request: Http2ServerRequest,
  response: Http2ServerResponse,
) => void;

const SUPPORTED_SERVER_OPTIONS = new Set([
  "settings",
  "key",
  "cert",
  "allowHTTP1",
  "strictFieldWhitespaceValidation",
]);
const DEPRECATED_SERVER_OPTIONS = new Map([
  ["Http1IncomingMessage", "http1Options.IncomingMessage"],
  ["Http1ServerResponse", "http1Options.ServerResponse"],
]);

function validateServerOptions(secure: boolean, options: Http2ServerOptions): Http2ServerOptions {
  if (typeof options !== "object" || options === null) {
    throw invalidArgType("options", "object", options);
  }
  for (const name of Object.keys(options)) {
    const replacement = DEPRECATED_SERVER_OPTIONS.get(name);
    if (replacement) {
      deprecated(`http2 server option ${name}`, replacement);
    }
    if (!SUPPORTED_SERVER_OPTIONS.has(name)) {
      unsupported(
        `http2 server option ${name}`,
        "this option cannot be represented by the typed HTTP/2 provider boundary",
      );
    }
  }
  if (options.settings !== undefined) {
    validateSettings(options.settings);
  }
  if (options.allowHTTP1) {
    unsupported(
      "http2 secure server option allowHTTP1",
      "the callback boundary accepts HTTP/2 streams only",
    );
  }
  if (!secure && (options.key !== undefined || options.cert !== undefined)) {
    unsupported("http2.createServer TLS options", "cleartext h2c servers do not use TLS keys");
  }
  return { ...options };
}

export class ServerHttp2Session extends EventEmitter {
  readonly type = constants.NGHTTP2_SESSION_SERVER;
  readonly server: Http2ServerBase;
  readonly encrypted: boolean;
  readonly alpnProtocol: string;
  closed = false;
  destroyed = false;
  pendingSettingsAck = false;
  localSettings: Http2Settings;
  remoteSettings: Http2Settings;

  constructor(server: Http2ServerBase, secure: boolean, settings: Http2Settings) {
    super();
    this.server = server;
    this.encrypted = secure;
    this.alpnProtocol = secure ? "h2" : "h2c";
    this.localSettings = settings;
    this.remoteSettings = {};
  }

  get socket(): never {
    return unsupported(
      "http2.Http2Session.socket",
      "host net.Socket and TLSSocket objects cannot cross the component boundary",
    );
  }

  close(_callback?: () => void): never {
    return unsupported(
      "http2.ServerHttp2Session.close",
      "the buffered callback does not own the host connection session",
    );
  }

  destroy(_error?: Error, _code?: number): never {
    return unsupported(
      "http2.ServerHttp2Session.destroy",
      "the buffered callback does not own the host connection session",
    );
  }

  settings(_settings?: Http2Settings, _callback?: (...args: unknown[]) => void): never {
    return unsupported(
      "http2.ServerHttp2Session.settings",
      "per-connection settings are unavailable at the buffered server boundary",
    );
  }

  ping(_payloadOrCallback: ArrayBufferView | ((...args: unknown[]) => void)): never {
    return unsupported(
      "http2.ServerHttp2Session.ping",
      "per-connection ping is unavailable at the buffered server boundary",
    );
  }

  goaway(_code?: number, _lastStreamId?: number, _opaqueData?: ArrayBufferView): never {
    return unsupported(
      "http2.ServerHttp2Session.goaway",
      "per-connection GOAWAY is unavailable at the buffered server boundary",
    );
  }

  setLocalWindowSize(_windowSize: number): never {
    return unsupported(
      "http2.ServerHttp2Session.setLocalWindowSize",
      "flow-control windows are owned by the host HTTP/2 implementation",
    );
  }

  altsvc(_alt: string, _originOrStream: unknown): never {
    return unsupported("http2.ServerHttp2Session.altsvc", "ALTSVC frames are not exposed by WIT");
  }

  origin(..._origins: string[]): never {
    return unsupported("http2.ServerHttp2Session.origin", "ORIGIN frames are not exposed by WIT");
  }

  ref(): void {
    this.server.ref();
  }

  unref(): void {
    this.server.unref();
  }
}

export class Http2ServerRequest extends IncomingMessage {
  readonly stream: ServerHttp2Stream;
  readonly authority: string | undefined;
  readonly scheme: string | undefined;

  constructor(data: Http2IncomingStreamData, stream: ServerHttp2Stream) {
    const { headers } = fieldsToHeaders(data.headers);
    super({
      method: typeof headers[":method"] === "string" ? headers[":method"] : "GET",
      url: typeof headers[":path"] === "string" ? headers[":path"] : "/",
      httpVersion: "2.0",
      headers: data.headers,
      body: data.body,
      remoteAddress: data.remoteAddress,
      remotePort: data.remotePort,
    });
    this.stream = stream;
    this.authority = typeof headers[":authority"] === "string" ? headers[":authority"] : undefined;
    this.scheme = typeof headers[":scheme"] === "string" ? headers[":scheme"] : undefined;
  }

  override get connection(): never {
    return deprecated("http2.Http2ServerRequest.connection", "request.socket");
  }
}

export class Http2ServerResponse extends OutgoingMessage {
  readonly req: Http2ServerRequest;
  readonly stream: ServerHttp2Stream;
  statusCode = 200;
  statusMessage = "";

  constructor(request: Http2ServerRequest) {
    super();
    this.req = request;
    this.stream = request.stream;
  }

  override get connection(): never {
    return deprecated("http2.Http2ServerResponse.connection", "response.socket");
  }

  writeHead(
    statusCode: number,
    statusMessageOrHeaders?: string | HttpHeaders,
    headers?: HttpHeaders,
  ): this {
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 999) {
      throw codedError(
        "RangeError",
        "ERR_HTTP2_STATUS_INVALID",
        `Invalid status code: ${statusCode}`,
      );
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

  override appendHeader(name: string, value: HttpHeaderValue): this {
    return super.appendHeader(name, value);
  }

  writeContinue(): never {
    return unsupported(
      "http2.Http2ServerResponse.writeContinue",
      "informational headers cannot cross the buffered response boundary",
    );
  }

  writeEarlyHints(_hints: HttpHeaders): never {
    return unsupported(
      "http2.Http2ServerResponse.writeEarlyHints",
      "informational headers cannot cross the buffered response boundary",
    );
  }

  writeInformation(_statusCode: number, _headers?: HttpHeaders): never {
    return unsupported(
      "http2.Http2ServerResponse.writeInformation",
      "informational headers cannot cross the buffered response boundary",
    );
  }

  createPushResponse(_headers: HttpHeaders, _callback: (...args: unknown[]) => void): never {
    return unsupported(
      "http2.Http2ServerResponse.createPushResponse",
      "server push is disabled by RFC 9113",
    );
  }

  override addTrailers(_headers: HttpHeaders): never {
    return unsupported(
      "http2.Http2ServerResponse.addTrailers",
      "trailers cannot cross the buffered response boundary",
    );
  }

  override _finalize(body: Uint8Array): undefined {
    this.stream.respond({ ...this._headers.object(), ":status": this.statusCode });
    this.stream.end(body);
    return undefined;
  }
}

export class Http2ServerBase extends EventEmitter {
  readonly timeout = 0;
  readonly secure: boolean;
  readonly options: Http2ServerOptions;
  listening = false;
  readonly #implementation: Http2ServerImplementation;
  readonly #sessions = new Map<number, ServerHttp2Session>();

  constructor(
    implementation: Http2Implementation,
    secure: boolean,
    options: Http2ServerOptions,
    listener?: Http2RequestListener,
  ) {
    super();
    this.secure = secure;
    this.options = validateServerOptions(secure, options);
    if (listener) {
      this.on("request", listener);
    }
    this.#implementation = implementation.createServer(
      secure,
      this.options,
      (stream) => this.#handle(stream),
      (error) => queueMicrotask(() => this.emit("sessionError", error)),
    );
  }

  listen(...args: unknown[]): this {
    const { options, callback } = parseListenArguments(args);
    if (options.signal !== undefined) {
      unsupported(
        "http2 server listen signal",
        "AbortSignal cannot be retained across the host-owned server resource",
      );
    }
    if (this.listening) {
      throw codedError(
        "Error",
        "ERR_SERVER_ALREADY_LISTEN",
        "Listen method has been called more than once without closing.",
      );
    }
    this.#implementation.listen(options);
    this.listening = true;
    queueMicrotask(() => {
      this.emit("listening");
      callback?.();
    });
    return this;
  }

  close(callback?: (error?: Error) => void): this {
    try {
      const wasListening = this.#implementation.close();
      this.listening = false;
      queueMicrotask(() => {
        if (wasListening) {
          this.emit("close");
        }
        callback?.();
      });
    } catch (error) {
      const value = error instanceof Error ? error : new Error(String(error));
      queueMicrotask(() => callback?.(value));
    }
    return this;
  }

  address(): Http2ServerAddress | null {
    return this.#implementation.address();
  }

  setTimeout(milliseconds = 0, callback?: () => void): this {
    if (milliseconds !== 0 || callback !== undefined) {
      unsupported(
        "http2 server setTimeout",
        "timeout callbacks cannot be retained across the typed component boundary",
      );
    }
    return this;
  }

  updateSettings(settings: Http2Settings = {}): void {
    this.#implementation.updateSettings(validateSettings(settings));
  }

  ref(): this {
    this.#implementation.ref();
    return this;
  }

  unref(): this {
    this.#implementation.unref();
    return this;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.close((error) => (error ? reject(error) : resolve()));
    });
  }

  async #handle(
    data: Http2IncomingStreamData,
  ): Promise<import("./types.js").Http2OutgoingResponseData> {
    let session = this.#sessions.get(data.sessionId);
    if (!session) {
      session = new ServerHttp2Session(this, this.secure, this.options.settings ?? {});
      this.#sessions.set(data.sessionId, session);
      this.emit("session", session);
    }
    const stream = new ServerHttp2Stream(data, session);
    const { headers, rawHeaders } = fieldsToHeaders(data.headers);
    const emittedStream = this.emit(
      "stream",
      stream,
      headers,
      constants.NGHTTP2_FLAG_END_HEADERS,
      rawHeaders,
    );
    const request = new Http2ServerRequest(data, stream);
    const response = new Http2ServerResponse(request);
    const emittedRequest = this.emit("request", request, response);
    if (!emittedStream && !emittedRequest) {
      unsupported("http2 server stream", "the server has no stream or request listener");
    }
    stream.startReading();
    request._start();
    return stream.response();
  }
}

export interface Http2ServerConstructor {
  new (options?: Http2ServerOptions, listener?: Http2RequestListener): Http2ServerBase;
}

export function createServerConstructor(
  implementation: Http2Implementation,
  secure: boolean,
): Http2ServerConstructor {
  if (secure) {
    return class Http2SecureServer extends Http2ServerBase {
      constructor(options: Http2ServerOptions = {}, listener?: Http2RequestListener) {
        super(implementation, true, options, listener);
      }
    };
  }
  return class Http2Server extends Http2ServerBase {
    constructor(options: Http2ServerOptions = {}, listener?: Http2RequestListener) {
      super(implementation, false, options, listener);
    }
  };
}
