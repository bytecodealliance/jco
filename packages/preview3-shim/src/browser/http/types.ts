import { types as preview2Types } from "@bytecodealliance/preview2-shim/http";
import type {
  Fields as FieldsT,
  Request as RequestT,
  RequestOptions as RequestOptionsT,
  Response as ResponseT,
  FieldName,
  FieldValue,
  Headers,
  Method,
  Scheme,
  Duration,
  StatusCode,
  Trailers,
  HeaderError,
  ErrorCode,
  Result,
} from "../../../types/interfaces/wasi-http-types.d.ts";

type Preview2Fields = InstanceType<typeof preview2Types.Fields>;

export class HttpError extends Error {
  readonly payload: HeaderError;

  constructor(payload: HeaderError, message?: string) {
    super(message ?? payload.tag);
    this.name = "HttpError";
    this.payload = payload;
  }
}

export const _forbiddenHeaders = {
  value: new Set([
    "connection",
    "http2-settings",
    "host",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "transfer-encoding",
    "upgrade",
  ]),
};

function rejectForbidden(name: FieldName): void {
  if (_forbiddenHeaders.value.has(name.toLowerCase())) {
    throw new HttpError({ tag: "forbidden" }, `Header ${name} is forbidden`);
  }
}

export class Fields implements FieldsT {
  readonly _preview2: Preview2Fields;
  #immutable = false;

  constructor(fields = new preview2Types.Fields()) {
    this._preview2 = fields;
  }

  static fromList(entries: Array<[FieldName, FieldValue]>): Fields {
    for (const [name] of entries) {
      rejectForbidden(name);
    }
    return new Fields(preview2Types.Fields.fromList(entries));
  }

  get(name: FieldName): Array<FieldValue> {
    return this._preview2.get(name);
  }

  has(name: FieldName): boolean {
    return this._preview2.has(name);
  }

  set(name: FieldName, value: Array<FieldValue>): void {
    this.#ensureMutable();
    rejectForbidden(name);
    this._preview2.set(name, value);
  }

  delete(name: FieldName): void {
    this.#ensureMutable();
    rejectForbidden(name);
    this._preview2.delete(name);
  }

  getAndDelete(name: FieldName): Array<FieldValue> {
    const values = this.get(name);
    this.delete(name);
    return values;
  }

  append(name: FieldName, value: FieldValue): void {
    this.#ensureMutable();
    rejectForbidden(name);
    this._preview2.append(name, value);
  }

  copyAll(): Array<[FieldName, FieldValue]> {
    return this._preview2.entries().map(([name, value]) => [name, value.slice()]);
  }

  clone(): Fields {
    return new Fields(this._preview2.clone());
  }

  static _lock(fields: Fields): Fields {
    fields.#immutable = true;
    return fields;
  }

  #ensureMutable(): void {
    if (this.#immutable) {
      throw new HttpError({ tag: "immutable" }, "Cannot modify immutable fields");
    }
  }
}

export class RequestOptions implements RequestOptionsT {
  #connectTimeout: Duration | undefined;
  #firstByteTimeout: Duration | undefined;
  #betweenBytesTimeout: Duration | undefined;
  #immutable = false;

  getConnectTimeout(): Duration | undefined {
    return this.#connectTimeout;
  }

  setConnectTimeout(duration: Duration | undefined): void {
    this.#ensureMutable();
    this.#connectTimeout = duration;
  }

  getFirstByteTimeout(): Duration | undefined {
    return this.#firstByteTimeout;
  }

  setFirstByteTimeout(duration: Duration | undefined): void {
    this.#ensureMutable();
    this.#firstByteTimeout = duration;
  }

  getBetweenBytesTimeout(): Duration | undefined {
    return this.#betweenBytesTimeout;
  }

  setBetweenBytesTimeout(duration: Duration | undefined): void {
    this.#ensureMutable();
    this.#betweenBytesTimeout = duration;
  }

  clone(): RequestOptions {
    const options = new RequestOptions();
    options.#connectTimeout = this.#connectTimeout;
    options.#firstByteTimeout = this.#firstByteTimeout;
    options.#betweenBytesTimeout = this.#betweenBytesTimeout;
    return options;
  }

  static _lock(options: RequestOptions | undefined): RequestOptions | undefined {
    if (options) {
      options.#immutable = true;
    }
    return options;
  }

  #ensureMutable(): void {
    if (this.#immutable) {
      throw new HttpError({ tag: "immutable" }, "Cannot modify immutable request options");
    }
  }
}

type TransmissionResult = Result<void, ErrorCode>;
type TrailersResult = Result<Trailers | undefined, ErrorCode>;

function emptyByteStream(): ReadableStream<number> {
  return new ReadableStream<number>({
    start(controller) {
      controller.close();
    },
  });
}

export class Request implements RequestT {
  #method: Method = { tag: "get" };
  #pathWithQuery: string | undefined;
  #scheme: Scheme | undefined;
  #authority: string | undefined;
  #headers!: Fields;
  #contents: ReadableStream<number> | undefined;
  #trailers!: Promise<TrailersResult>;
  #options: RequestOptions | undefined;
  #resolveTransmission!: (result: TransmissionResult) => void;
  #consumed = false;
  #transmissionResolved = false;

  static new(
    headers: Headers,
    contents: ReadableStream<number> | undefined,
    trailers: Promise<TrailersResult>,
    options: RequestOptions | undefined,
  ): [Request, Promise<TransmissionResult>] {
    if (!(headers instanceof Fields)) {
      throw new TypeError("headers must be a Fields resource");
    }
    if (options !== undefined && !(options instanceof RequestOptions)) {
      throw new TypeError("options must be a RequestOptions resource");
    }
    const request = new Request();
    request.#headers = headers;
    request.#contents = contents;
    request.#trailers = Promise.resolve(trailers);
    request.#options = RequestOptions._lock(options);
    Fields._lock(headers);
    const transmission = new Promise<TransmissionResult>(
      (resolve) => (request.#resolveTransmission = resolve),
    );
    return [request, transmission];
  }

  getMethod(): Method {
    return this.#method;
  }

  setMethod(method: Method): void {
    this.#method = method;
  }

  getPathWithQuery(): string | undefined {
    return this.#pathWithQuery;
  }

  setPathWithQuery(pathWithQuery: string | undefined): void {
    this.#pathWithQuery = pathWithQuery;
  }

  getScheme(): Scheme | undefined {
    return this.#scheme;
  }

  setScheme(scheme: Scheme | undefined): void {
    this.#scheme = scheme;
  }

  getAuthority(): string | undefined {
    return this.#authority;
  }

  setAuthority(authority: string | undefined): void {
    this.#authority = authority;
  }

  getOptions(): RequestOptions | undefined {
    return this.#options;
  }

  getHeaders(): Fields {
    return this.#headers;
  }

  static consumeBody(
    this_: Request,
    res: Promise<TransmissionResult>,
  ): [ReadableStream<number>, Promise<TrailersResult>] {
    if (this_.#consumed) {
      throw new Error("request body has already been consumed");
    }
    this_.#consumed = true;
    void Promise.resolve(res).catch(() => {});
    return [this_.#contents ?? emptyByteStream(), this_.#trailers];
  }

  _body(): ReadableStream<number> | undefined {
    return this.#contents;
  }

  _trailers(): Promise<TrailersResult> {
    return this.#trailers;
  }

  _resolve(result: TransmissionResult): void {
    if (!this.#transmissionResolved) {
      this.#transmissionResolved = true;
      this.#resolveTransmission(result);
    }
  }
}

export class Response implements ResponseT {
  #statusCode: StatusCode = 200;
  #headers!: Fields;
  #contents: ReadableStream<number> | undefined;
  #trailers!: Promise<TrailersResult>;
  #consumed = false;

  static new(
    headers: Headers,
    contents: ReadableStream<number> | undefined,
    trailers: Promise<TrailersResult>,
  ): [Response, Promise<TransmissionResult>] {
    if (!(headers instanceof Fields)) {
      throw new TypeError("headers must be a Fields resource");
    }
    const response = new Response();
    response.#headers = headers;
    Fields._lock(headers);
    response.#contents = contents;
    response.#trailers = Promise.resolve(trailers);
    return [response, Promise.resolve({ tag: "ok", val: undefined })];
  }

  getStatusCode(): StatusCode {
    return this.#statusCode;
  }

  setStatusCode(statusCode: StatusCode): void {
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
      throw new RangeError(`invalid HTTP status code: ${statusCode}`);
    }
    this.#statusCode = statusCode;
  }

  getHeaders(): Fields {
    return this.#headers;
  }

  static consumeBody(
    this_: Response,
    res: Promise<TransmissionResult>,
  ): [ReadableStream<number>, Promise<TrailersResult>] {
    if (this_.#consumed) {
      throw new Error("response body has already been consumed");
    }
    this_.#consumed = true;
    void Promise.resolve(res).catch(() => {});
    return [this_.#contents ?? emptyByteStream(), this_.#trailers];
  }
}

export default {
  Fields,
  Request,
  RequestOptions,
  Response,
} satisfies typeof import("../../../types/interfaces/wasi-http-types.d.ts");
export type * from "../../../types/interfaces/wasi-http-types.d.ts";
