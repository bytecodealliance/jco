import type { HostErrno, HostErrorBase } from "../internal/wit-types.js";

export type HttpHeaderValue = string | number | readonly string[];
export type HttpHeaders = Record<string, HttpHeaderValue | undefined>;

/**
 * `http.request` options plus the TLS options `https.request` accepts.
 *
 * The TLS members are read only by the `node:https` profile; `node:http` ignores them the way
 * Node's `net.connect` does.
 */
export interface HttpRequestOptions extends HttpTlsOptions {
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
  agent?: AgentLike | boolean | null;
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
  readonly defaultPort?: number;
}

/** PEM, DER, or PFX material as Node's TLS options accept it. */
export type TlsMaterial = string | ArrayBufferView | ArrayBuffer;

/**
 * The subset of Node's `tls.createServer` / `tls.connect` options the typed WIT boundary
 * carries.
 *
 * Follows nodejs/node v24.19.0, commit cdc1b38d40cb567b7ad0b39c86addf830a0af0ae,
 * lib/_tls_common.js `configSecureContext` and lib/_tls_wrap.js. Options with no serializable
 * representation (`secureContext`, `SNICallback`, `ALPNCallback`, `checkServerIdentity`,
 * engine identifiers, sessions, ticket keys) are refused by `tlsMaterial()` rather than
 * silently dropped.
 */
export interface HttpTlsOptions {
  key?: TlsMaterial | readonly TlsMaterial[];
  cert?: TlsMaterial | readonly TlsMaterial[];
  pfx?: TlsMaterial | readonly TlsMaterial[];
  passphrase?: string;
  ca?: TlsMaterial | readonly TlsMaterial[];
  crl?: TlsMaterial | readonly TlsMaterial[];
  dhparam?: TlsMaterial;
  ciphers?: string;
  ecdhCurve?: string;
  sigalgs?: string;
  minVersion?: string;
  maxVersion?: string;
  secureProtocol?: string;
  secureOptions?: number;
  sessionIdContext?: string;
  honorCipherOrder?: boolean;
  ALPNProtocols?: readonly string[] | TlsMaterial;
  servername?: string;
  rejectUnauthorized?: boolean;
  requestCert?: boolean;
}

/**
 * Normalized TLS material handed to an implementation; mirrors the `tls-options` record of
 * `jco:node/http@0.1.0` field for field.
 */
export interface HttpTlsMaterial {
  key?: Uint8Array[];
  cert?: Uint8Array[];
  pfx?: Uint8Array[];
  passphrase?: string;
  ca?: Uint8Array[];
  crl?: Uint8Array[];
  dhparam?: Uint8Array;
  ciphers?: string;
  ecdhCurve?: string;
  sigalgs?: string;
  minVersion?: string;
  maxVersion?: string;
  secureProtocol?: string;
  secureOptions?: number;
  sessionIdContext?: string;
  honorCipherOrder?: boolean;
  alpnProtocols?: string[];
  servername?: string;
  rejectUnauthorized?: boolean;
  requestCert?: boolean;
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
  /** Client TLS configuration; only ever set by `node:https`, and only when options carry some. */
  tls?: HttpTlsMaterial;
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
  /**
   * Present for every `node:https` server, even when no material was supplied, so that an
   * implementation without a TLS stack refuses instead of serving plaintext. Absent for
   * `node:http` servers.
   */
  tls?: HttpTlsMaterial;
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

export type DirectErrno = HostErrno;

export interface DirectHttpError extends HostErrorBase {
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
  tls?: DirectTlsOptions;
}

export interface DirectHttpResponse {
  statusCode: number;
  statusMessage: string;
  httpVersion: string;
  headers: HttpHeaderField[];
  body: Uint8Array;
}

export type DirectHttpResult<T> = { tag: "ok"; val: T } | { tag: "err"; val: DirectHttpError };

/** The `tls-options` record of `jco:node/http@0.1.0`. */
export type DirectTlsOptions = HttpTlsMaterial;

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
  tls?: DirectTlsOptions;
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
