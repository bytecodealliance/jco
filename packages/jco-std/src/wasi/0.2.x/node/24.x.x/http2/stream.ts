import { EventEmitter } from "../internal/event-emitter.js";
import { bodyBytes } from "../http/body.js";
import { constants } from "./constants.js";
import { codedError, deprecated, unsupported } from "./errors.js";
import { fieldsToHeaders, headersToFields } from "./headers.js";
import type {
  HttpBodyChunk as Http2BodyChunk,
  Http2ClientStreamImplementation,
  Http2Headers,
  Http2IncomingStreamData,
  Http2OutgoingResponseData,
  Http2ResponseData,
  Http2StreamState,
} from "./types.js";

export type StreamCallback = (error?: Error | null) => void;

interface ResponseAccumulator {
  headers: Http2Headers | undefined;
  chunks: Uint8Array[];
  ended: boolean;
  complete(): Promise<Http2OutgoingResponseData>;
  finish(): void;
}

function createAccumulator(): ResponseAccumulator {
  let resolve!: (response: Http2OutgoingResponseData) => void;
  const completed = new Promise<Http2OutgoingResponseData>((done) => {
    resolve = done;
  });
  return {
    headers: undefined,
    chunks: [],
    ended: false,
    complete() {
      return completed;
    },
    finish() {
      const size = this.chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of this.chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve({
        headers: headersToFields(this.headers ?? { ":status": 200 }),
        body,
      });
    },
  };
}

export class Http2StreamBase extends EventEmitter {
  aborted = false;
  closed = false;
  destroyed = false;
  endAfterHeaders = false;
  pending = false;
  rstCode = constants.NGHTTP2_NO_ERROR;
  readonly id: number | undefined;
  readonly sentHeaders: Http2Headers;
  sentInfoHeaders: Http2Headers[] | undefined;
  sentTrailers: Http2Headers | undefined;
  readonly session: unknown;
  protected encoding: string | undefined;

  constructor(id: number | undefined, headers: Http2Headers, session: unknown) {
    super();
    this.id = id;
    this.sentHeaders = headers;
    this.session = session;
  }

  get bufferSize(): number {
    return 0;
  }

  get state(): Http2StreamState {
    return unsupported(
      "http2.Http2Stream.state",
      "server stream state is not exposed by the buffered callback boundary",
    );
  }

  setEncoding(encoding: string): this {
    this.encoding = encoding;
    return this;
  }

  priority(_options: unknown): never {
    return deprecated("http2.Http2Stream.priority", "RFC 9218 extensible priorities");
  }

  setTimeout(milliseconds: number, callback?: () => void): this {
    if (milliseconds !== 0 || callback !== undefined) {
      unsupported(
        "http2.Http2Stream.setTimeout",
        "timeout callbacks cannot be retained across the typed component boundary",
      );
    }
    return this;
  }

  sendTrailers(_headers: Http2Headers): never {
    return unsupported(
      "http2.Http2Stream.sendTrailers",
      "the buffered component boundary completes a stream in one response",
    );
  }
}

export class ClientHttp2Stream extends Http2StreamBase {
  readonly #implementation: Http2ClientStreamImplementation;
  #ended = false;
  #body: Uint8Array | undefined;
  readable = true;
  readableEnded = false;
  writable = true;
  writableEnded = false;
  writableFinished = false;

  constructor(
    implementation: Http2ClientStreamImplementation,
    headers: Http2Headers,
    session: unknown,
  ) {
    super(implementation.id(), headers, session);
    this.#implementation = implementation;
  }

  override get state(): Http2StreamState {
    return this.#implementation.state();
  }

  write(
    chunk: Http2BodyChunk,
    encodingOrCallback?: string | StreamCallback,
    callback?: StreamCallback,
  ): boolean {
    if (this.#ended) {
      throw codedError("Error", "ERR_STREAM_WRITE_AFTER_END", "write after end");
    }
    const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : "utf8";
    const written = this.#implementation.write(bodyBytes(chunk, encoding));
    const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (done) {
      queueMicrotask(() => done());
    }
    return written;
  }

  end(
    chunkOrCallback?: Http2BodyChunk | StreamCallback,
    encodingOrCallback?: string | StreamCallback,
    callback?: StreamCallback,
  ): this {
    if (this.#ended) {
      return this;
    }
    const chunk = typeof chunkOrCallback === "function" ? undefined : chunkOrCallback;
    const done =
      typeof chunkOrCallback === "function"
        ? chunkOrCallback
        : typeof encodingOrCallback === "function"
          ? encodingOrCallback
          : callback;
    if (chunk !== undefined) {
      this.write(chunk, typeof encodingOrCallback === "string" ? encodingOrCallback : undefined);
    }
    this.#ended = true;
    this.writable = false;
    this.writableEnded = true;
    try {
      const response = this.#implementation.finish();
      this.#acceptResponse(response, done);
    } catch (error) {
      const value = error instanceof Error ? error : new Error(String(error));
      queueMicrotask(() => {
        this.destroyed = true;
        this.emit("error", value);
        this.closed = true;
        this.emit("close");
        done?.(value);
      });
    }
    return this;
  }

  read(): Uint8Array | string | null {
    if (!this.#body) {
      return null;
    }
    const value = this.#decode(this.#body);
    this.#body = undefined;
    return value;
  }

  close(code = constants.NGHTTP2_NO_ERROR, callback?: () => void): void {
    this.#implementation.close(code);
    this.rstCode = code;
    this.closed = true;
    queueMicrotask(() => {
      this.emit("close");
      callback?.();
    });
  }

  destroy(error?: Error): this {
    if (this.destroyed) {
      return this;
    }
    this.destroyed = true;
    this.#implementation.close(
      error ? constants.NGHTTP2_INTERNAL_ERROR : constants.NGHTTP2_NO_ERROR,
    );
    queueMicrotask(() => {
      if (error) {
        this.emit("error", error);
      }
      this.closed = true;
      this.emit("close");
    });
    return this;
  }

  #acceptResponse(response: Http2ResponseData, callback: StreamCallback | undefined): void {
    const { headers, rawHeaders } = fieldsToHeaders(response.headers);
    const { headers: trailers } = fieldsToHeaders(response.trailers);
    this.#body = response.body.slice();
    queueMicrotask(() => {
      this.emit("response", headers, constants.NGHTTP2_FLAG_END_HEADERS, rawHeaders);
      if (response.body.byteLength > 0) {
        this.emit("data", this.#decode(response.body));
        this.#body = undefined;
      }
      if (response.trailers.length > 0) {
        this.emit("trailers", trailers, constants.NGHTTP2_FLAG_END_HEADERS);
      }
      this.readable = false;
      this.readableEnded = true;
      this.writableFinished = true;
      this.emit("finish");
      callback?.();
      this.emit("end");
      this.closed = true;
      this.emit("close");
    });
  }

  #decode(body: Uint8Array): Uint8Array | string {
    return this.encoding ? new TextDecoder(this.encoding).decode(body) : body.slice();
  }
}

export class ServerHttp2Stream extends Http2StreamBase {
  readonly incomingHeaders: Http2Headers;
  readableEnded = false;
  readonly #request: Http2IncomingStreamData;
  readonly #response: ResponseAccumulator;
  readonly headersSent: boolean = false;
  readonly pushAllowed = false;
  #read = false;
  #paused = false;
  #started = false;

  constructor(request: Http2IncomingStreamData, session: unknown, response = createAccumulator()) {
    const { headers } = fieldsToHeaders(request.headers);
    super(request.id, {}, session);
    this.#request = request;
    this.#response = response;
    this.incomingHeaders = headers;
  }

  respond(headers: Http2Headers = { ":status": 200 }, options: { endStream?: boolean } = {}): void {
    if (this.#response.headers) {
      throw codedError("Error", "ERR_HTTP2_HEADERS_SENT", "Response has already been initiated");
    }
    this.#response.headers = { ...headers };
    Object.assign(this, { headersSent: true });
    if (options.endStream) {
      this.end();
    }
  }

  additionalHeaders(_headers: Http2Headers): never {
    return unsupported(
      "http2.ServerHttp2Stream.additionalHeaders",
      "informational headers cannot cross the buffered response boundary",
    );
  }

  pushStream(
    _headers: Http2Headers,
    _options: unknown,
    _callback?: (...args: unknown[]) => void,
  ): never {
    return unsupported("http2.ServerHttp2Stream.pushStream", "server push is disabled by RFC 9113");
  }

  respondWithFD(_fd: number, _headers?: Http2Headers, _options?: unknown): never {
    return unsupported(
      "http2.ServerHttp2Stream.respondWithFD",
      "guest file descriptors cannot cross the component boundary",
    );
  }

  respondWithFile(_path: string, _headers?: Http2Headers, _options?: unknown): never {
    return unsupported(
      "http2.ServerHttp2Stream.respondWithFile",
      "host filesystem paths cannot be opened by the HTTP/2 provider",
    );
  }

  write(
    chunk: Http2BodyChunk,
    encodingOrCallback?: string | StreamCallback,
    callback?: StreamCallback,
  ): boolean {
    if (this.#response.ended) {
      throw codedError("Error", "ERR_STREAM_WRITE_AFTER_END", "write after end");
    }
    if (!this.#response.headers) {
      this.respond();
    }
    const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : "utf8";
    this.#response.chunks.push(bodyBytes(chunk, encoding));
    const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (done) {
      queueMicrotask(() => done());
    }
    return true;
  }

  end(
    chunkOrCallback?: Http2BodyChunk | StreamCallback,
    encodingOrCallback?: string | StreamCallback,
    callback?: StreamCallback,
  ): this {
    if (this.#response.ended) {
      return this;
    }
    const chunk = typeof chunkOrCallback === "function" ? undefined : chunkOrCallback;
    const done =
      typeof chunkOrCallback === "function"
        ? chunkOrCallback
        : typeof encodingOrCallback === "function"
          ? encodingOrCallback
          : callback;
    if (chunk !== undefined) {
      this.write(chunk, typeof encodingOrCallback === "string" ? encodingOrCallback : undefined);
    }
    if (!this.#response.headers) {
      this.respond();
    }
    this.#response.ended = true;
    this.#response.finish();
    queueMicrotask(() => {
      this.emit("finish");
      done?.();
      this.closed = true;
      this.emit("close");
    });
    return this;
  }

  read(): Uint8Array | string | null {
    if (this.#read) {
      return null;
    }
    this.#read = true;
    return this.#decode(this.#request.body);
  }

  resume(): this {
    this.#paused = false;
    this.startReading();
    this.#emitBody();
    return this;
  }

  pause(): this {
    this.#paused = true;
    return this;
  }

  startReading(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;
    queueMicrotask(() => this.#emitBody());
  }

  response(): Promise<Http2OutgoingResponseData> {
    return this.#response.complete();
  }

  accumulator(): ResponseAccumulator {
    return this.#response;
  }

  #decode(body: Uint8Array): Uint8Array | string {
    return this.encoding ? new TextDecoder(this.encoding).decode(body) : body.slice();
  }

  #emitBody(): void {
    if (!this.#started || this.#paused || this.readableEnded) {
      return;
    }
    if (!this.#read && this.#request.body.byteLength > 0) {
      this.#read = true;
      this.emit("data", this.#decode(this.#request.body));
    }
    this.readableEnded = true;
    this.emit("end");
  }
}
