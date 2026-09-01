export type HttpHeaderValue = string | number | readonly string[];
export type HttpHeaders = Record<string, HttpHeaderValue | undefined>;

export interface HttpRequestOptions {
  protocol?: string;
  host?: string | null;
  hostname?: string | null;
  port?: number | string | null;
  method?: string;
  path?: string | null;
  headers?: HttpHeaders | readonly string[];
  auth?: string | null;
  timeout?: number;
  signal?: AbortSignal;
  agent?: AgentLike | boolean;
  defaultPort?: number | string;
  family?: number;
  hints?: number;
  localAddress?: string;
  localPort?: number;
  setHost?: boolean;
  setDefaultHeaders?: boolean;
  joinDuplicateHeaders?: boolean;
  maxHeaderSize?: number;
  insecureHTTPParser?: boolean;
  socketPath?: string;
  uniqueHeaders?: Array<string | string[]>;
}

export interface AgentLike {
  readonly options: Readonly<Record<string, unknown>>;
}

export type HttpBodyChunk = string | ArrayBuffer | ArrayBufferView;

export interface HttpTransportHeader {
  name: string;
  value: Uint8Array;
}

export interface HttpTransportRequest {
  method: string;
  scheme: string;
  authority: string;
  pathWithQuery: string;
  headers: HttpTransportHeader[];
  body: Uint8Array;
  connectTimeoutMs?: number;
  firstByteTimeoutMs?: number;
  betweenBytesTimeoutMs?: number;
}

export interface HttpTransportResponse {
  statusCode: number;
  statusMessage: string;
  httpVersion: string;
  headers: HttpTransportHeader[];
  body: Uint8Array;
}

export interface HttpErrorData {
  name: string;
  message: string;
  code?: string;
  errno?: number | string;
  syscall?: string;
  hostname?: string;
  address?: string;
  port?: number;
}

export type HttpResult<T> = { tag: "ok"; val: T } | { tag: "err"; val: HttpErrorData };

export interface HttpTransport {
  request(options: HttpTransportRequest): HttpTransportResponse;
}

export type HttpCallback = () => void;
export type HttpErrorCallback = (error?: Error | null) => void;

export interface ClientRequestLike {
  end(callback?: HttpCallback): ClientRequestLike;
}

export interface HttpModule {
  Agent: unknown;
  ClientRequest: unknown;
  CloseEvent: unknown;
  IncomingMessage: unknown;
  METHODS: string[];
  MessageEvent: unknown;
  OutgoingMessage: unknown;
  STATUS_CODES: Record<number, string>;
  Server: unknown;
  ServerResponse: unknown;
  WebSocket: unknown;
  _connectionListener: (...args: unknown[]) => never;
  createServer: (...args: unknown[]) => unknown;
  get: (...args: unknown[]) => ClientRequestLike;
  globalAgent: AgentLike;
  maxHeaderSize: number;
  request: (...args: unknown[]) => ClientRequestLike;
  setGlobalProxyFromEnv: (...args: unknown[]) => never;
  setMaxIdleHTTPParsers: (max: number) => void;
  validateHeaderName: (name: string, label?: string) => void;
  validateHeaderValue: (name: string, value: string) => void;
}

export type DirectErrno = { tag: "number"; val: bigint } | { tag: "symbolic"; val: string };

export interface DirectHttpError {
  name: string;
  message: string;
  code?: string;
  errno?: DirectErrno;
  syscall?: string;
  hostname?: string;
  address?: string;
  port?: number;
}

export interface DirectHttpRequest {
  method: string;
  scheme: string;
  authority: string;
  pathWithQuery: string;
  headers: HttpTransportHeader[];
  body: Uint8Array;
  connectTimeoutMs?: number;
  firstByteTimeoutMs?: number;
  betweenBytesTimeoutMs?: number;
}

export interface DirectHttpResponse {
  statusCode: number;
  statusMessage: string;
  httpVersion: string;
  headers: HttpTransportHeader[];
  body: Uint8Array;
}

export type DirectHttpResult<T> = { tag: "ok"; val: T } | { tag: "err"; val: DirectHttpError };

export interface DirectHttpHost {
  request(options: DirectHttpRequest): DirectHttpResult<DirectHttpResponse>;
}
