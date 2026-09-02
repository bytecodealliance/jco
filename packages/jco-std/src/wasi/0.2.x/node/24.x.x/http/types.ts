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

export interface HttpHeaderField {
  name: string;
  value: Uint8Array;
}

export interface HttpImplementationRequest {
  method: string;
  scheme: string;
  authority: string;
  pathWithQuery: string;
  headers: HttpHeaderField[];
  body: Uint8Array;
  connectTimeoutMs?: number;
  firstByteTimeoutMs?: number;
  betweenBytesTimeoutMs?: number;
}

export interface HttpImplementationResponse {
  statusCode: number;
  statusMessage: string;
  httpVersion: string;
  headers: HttpHeaderField[];
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

export interface HttpServerOptions {
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

export interface HttpListenOptions {
  port?: number;
  host?: string;
  backlog?: number;
  path?: string;
  exclusive?: boolean;
  ipv6Only?: boolean;
  reusePort?: boolean;
  signal?: AbortSignal;
}

export type HttpServerAddress = { address: string; family: "IPv4" | "IPv6"; port: number } | string;

export interface HttpIncomingRequestData {
  method: string;
  url: string;
  httpVersion: string;
  headers: HttpHeaderField[];
  body: Uint8Array;
  remoteAddress?: string;
  remotePort?: number;
}

export interface HttpOutgoingResponseData {
  statusCode: number;
  statusMessage: string;
  headers: HttpHeaderField[];
  body: Uint8Array;
}

export interface HttpServerImplementation {
  listen(options: HttpListenOptions): HttpServerAddress;
  close(): boolean;
  closeAllConnections(): void;
  closeIdleConnections(): void;
  getConnections(): number;
  address(): HttpServerAddress | null;
  ref(): void;
  unref(): void;
}

export type HttpRequestHandler = (
  request: HttpIncomingRequestData,
) => HttpOutgoingResponseData | Promise<HttpOutgoingResponseData>;

export interface HttpImplementation {
  request(options: HttpImplementationRequest): HttpImplementationResponse;
  createServer?(
    options: HttpServerOptions,
    handler: HttpRequestHandler,
    onError: (error: Error) => void,
  ): HttpServerImplementation;
  serverUnsupportedReason?: string;
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
  headers: HttpHeaderField[];
  body: Uint8Array;
  connectTimeoutMs?: number;
  firstByteTimeoutMs?: number;
  betweenBytesTimeoutMs?: number;
}

export interface DirectHttpResponse {
  statusCode: number;
  statusMessage: string;
  httpVersion: string;
  headers: HttpHeaderField[];
  body: Uint8Array;
}

export type DirectHttpResult<T> = { tag: "ok"; val: T } | { tag: "err"; val: DirectHttpError };

export interface DirectHttpServerOptions {
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
}

export interface DirectHttpListenOptions {
  port?: number;
  host?: string;
  backlog?: number;
  path?: string;
  exclusive?: boolean;
  ipv6Only?: boolean;
  reusePort?: boolean;
}

export type DirectHttpServerAddress =
  | { tag: "tcp"; val: { address: string; family: string; port: number } }
  | { tag: "pipe"; val: string };

export type DirectHttpIncomingRequest = HttpIncomingRequestData;

export type DirectHttpOutgoingResponse = HttpOutgoingResponseData;

export interface DirectHttpRequestListener extends Disposable {
  handle(
    request: DirectHttpIncomingRequest,
  ):
    | DirectHttpResult<DirectHttpOutgoingResponse>
    | Promise<DirectHttpResult<DirectHttpOutgoingResponse>>;
}

export interface DirectHttpServer extends Disposable {
  listen(options: DirectHttpListenOptions): DirectHttpResult<DirectHttpServerAddress>;
  close(): DirectHttpResult<boolean>;
  closeAllConnections(): DirectHttpResult<undefined>;
  closeIdleConnections(): DirectHttpResult<undefined>;
  getConnections(): DirectHttpResult<bigint>;
  address(): DirectHttpServerAddress | undefined;
  ref(): void;
  unref(): void;
}

export interface DirectHttpServerConstructor {
  new (options: DirectHttpServerOptions, listener: DirectHttpRequestListener): DirectHttpServer;
}

export interface DirectHttpHost {
  request(options: DirectHttpRequest): DirectHttpResult<DirectHttpResponse>;
  Server: DirectHttpServerConstructor;
}
