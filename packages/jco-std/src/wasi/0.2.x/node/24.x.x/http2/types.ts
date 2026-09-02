import type {
  HttpBodyChunk,
  HttpHeaderField,
  HttpListenOptions,
  HttpServerAddress,
} from "../http/types.js";

export type { HttpBodyChunk, HttpHeaderField, HttpListenOptions, HttpServerAddress };
export type Http2ServerAddress = HttpServerAddress;
export type DirectHttp2ServerAddress = import("../http/types.js").DirectHttpServerAddress;

export type Http2HeaderValue = string | number | readonly string[];
export type Http2Headers = Record<string, Http2HeaderValue | undefined>;

export interface Http2CustomSetting {
  id: number;
  value: number;
}

export interface Http2Settings {
  headerTableSize?: number;
  enablePush?: boolean;
  initialWindowSize?: number;
  maxFrameSize?: number;
  maxConcurrentStreams?: number;
  maxHeaderListSize?: number;
  maxHeaderSize?: number;
  enableConnectProtocol?: boolean;
  customSettings?: Record<number, number>;
}

export interface DirectHttp2Settings {
  headerTableSize?: number;
  enablePush?: boolean;
  initialWindowSize?: number;
  maxFrameSize?: number;
  maxConcurrentStreams?: number;
  maxHeaderListSize?: number;
  enableConnectProtocol?: boolean;
  customSettings: Http2CustomSetting[];
}

export type Http2TlsMaterial = string | ArrayBuffer | ArrayBufferView;

export interface Http2ClientOptions {
  settings?: Http2Settings;
  rejectUnauthorized?: boolean;
  servername?: string;
  ca?: Http2TlsMaterial;
  protocol?: "http:" | "https:";
  createConnection?: unknown;
  remoteCustomSettings?: number[];
  strictSingleValueFields?: boolean;
  maxReservedRemoteStreams?: number;
  maxOriginSetSize?: number;
  [name: string]: unknown;
}

export interface DirectHttp2ClientOptions {
  settings: DirectHttp2Settings;
  rejectUnauthorized?: boolean;
  serverName?: string;
  ca?: Uint8Array;
}

export interface Http2RequestOptions {
  endStream?: boolean;
  waitForTrailers?: boolean;
  signal?: AbortSignal;
  exclusive?: boolean;
  parent?: number;
}

export interface DirectHttp2RequestOptions {
  endStream?: boolean;
  waitForTrailers?: boolean;
}

export interface Http2StreamState {
  state?: number;
  localWindowSize?: number;
  localClose?: number;
  remoteClose?: number;
}

export interface Http2SessionState {
  effectiveLocalWindowSize?: number;
  effectiveRecvDataLength?: number;
  nextStreamID?: number;
  localWindowSize?: number;
  lastProcStreamID?: number;
  remoteWindowSize?: number;
  outboundQueueSize?: number;
  deflateDynamicTableSize?: number;
  inflateDynamicTableSize?: number;
}

export interface Http2ResponseData {
  headers: HttpHeaderField[];
  trailers: HttpHeaderField[];
  body: Uint8Array;
}

export interface Http2SessionInfo {
  alpnProtocol?: string;
  encrypted: boolean;
  localSettings: Http2Settings;
  remoteSettings: Http2Settings;
}

export interface DirectHttp2SessionInfo {
  alpnProtocol?: string;
  encrypted: boolean;
  localSettings: DirectHttp2Settings;
  remoteSettings: DirectHttp2Settings;
}

export interface Http2PingResponse {
  durationMs: number;
  payload: Uint8Array;
}

export interface Http2IncomingStreamData {
  sessionId: number;
  id: number;
  headers: HttpHeaderField[];
  body: Uint8Array;
  remoteAddress?: string;
  remotePort?: number;
}

export interface Http2OutgoingResponseData {
  headers: HttpHeaderField[];
  body: Uint8Array;
}

export interface Http2ServerOptions {
  settings?: Http2Settings;
  key?: Http2TlsMaterial;
  cert?: Http2TlsMaterial;
  allowHTTP1?: boolean;
  strictFieldWhitespaceValidation?: boolean;
  Http1IncomingMessage?: unknown;
  Http1ServerResponse?: unknown;
  Http2ServerRequest?: unknown;
  Http2ServerResponse?: unknown;
  http1Options?: unknown;
  createConnection?: unknown;
  selectPadding?: unknown;
  createSecureContext?: unknown;
  SNICallback?: unknown;
  [name: string]: unknown;
}

export interface DirectHttp2ServerOptions {
  secure: boolean;
  key?: Uint8Array;
  cert?: Uint8Array;
  settings: DirectHttp2Settings;
  allowHttp1?: boolean;
  strictFieldWhitespaceValidation?: boolean;
}

export interface Http2ClientStreamImplementation {
  write(chunk: Uint8Array): boolean;
  finish(): Http2ResponseData;
  close(code: number): void;
  id(): number | undefined;
  state(): Http2StreamState;
}

export interface Http2ClientSessionImplementation {
  ready(): Http2SessionInfo;
  request(
    headers: HttpHeaderField[],
    options: DirectHttp2RequestOptions,
  ): Http2ClientStreamImplementation;
  close(): void;
  destroy(code: number): void;
  settings(settings: Http2Settings): Http2Settings;
  ping(payload: Uint8Array): Http2PingResponse;
  goaway(code: number, lastStreamId: number | undefined, opaqueData: Uint8Array): void;
  ref(): void;
  unref(): void;
}

export interface Http2ServerImplementation {
  listen(options: HttpListenOptions): HttpServerAddress;
  close(): boolean;
  address(): HttpServerAddress | null;
  updateSettings(settings: Http2Settings): void;
  ref(): void;
  unref(): void;
}

export type Http2StreamHandler = (
  stream: Http2IncomingStreamData,
) => Http2OutgoingResponseData | Promise<Http2OutgoingResponseData>;

export interface Http2Implementation {
  connect(authority: string, options: Http2ClientOptions): Http2ClientSessionImplementation;
  createServer(
    secure: boolean,
    options: Http2ServerOptions,
    handler: Http2StreamHandler,
    onError: (error: Error) => void,
  ): Http2ServerImplementation;
  unsupportedReason?: string;
}

export interface DirectHttp2Error {
  name: string;
  message: string;
  code?: string;
  errno?: { tag: "number"; val: bigint } | { tag: "symbolic"; val: string };
  syscall?: string;
  hostname?: string;
  address?: string;
  port?: number;
}

export type DirectHttp2Result<T> = { tag: "ok"; val: T } | { tag: "err"; val: DirectHttp2Error };

export interface DirectHttp2ClientStream extends Disposable {
  write(chunk: Uint8Array): DirectHttp2Result<boolean>;
  finish(): DirectHttp2Result<Http2ResponseData>;
  close(code: number): DirectHttp2Result<undefined>;
  id(): number | undefined;
  state(): Http2StreamState;
}

export interface DirectHttp2ClientSession extends Disposable {
  ready(): DirectHttp2Result<DirectHttp2SessionInfo>;
  request(
    headers: HttpHeaderField[],
    options: DirectHttp2RequestOptions,
  ): DirectHttp2Result<DirectHttp2ClientStream>;
  close(): DirectHttp2Result<undefined>;
  destroy(code: number): DirectHttp2Result<undefined>;
  settings(settings: DirectHttp2Settings): DirectHttp2Result<DirectHttp2Settings>;
  ping(payload: Uint8Array): DirectHttp2Result<Http2PingResponse>;
  goaway(
    code: number,
    lastStreamId: number | undefined,
    opaqueData: Uint8Array,
  ): DirectHttp2Result<undefined>;
  ref(): void;
  unref(): void;
}

export interface DirectHttp2ClientSessionConstructor {
  new (authority: string, options: DirectHttp2ClientOptions): DirectHttp2ClientSession;
}

export interface DirectHttp2StreamListener extends Disposable {
  handle(
    stream: Http2IncomingStreamData,
  ):
    | DirectHttp2Result<Http2OutgoingResponseData>
    | Promise<DirectHttp2Result<Http2OutgoingResponseData>>;
}

export interface DirectHttp2ServerErrorListener extends Disposable {
  handle(reason: DirectHttp2Error): void;
}

export interface DirectHttp2Server extends Disposable {
  listen(
    options: HttpListenOptions,
  ): DirectHttp2Result<import("../http/types.js").DirectHttpServerAddress>;
  close(): DirectHttp2Result<boolean>;
  address(): import("../http/types.js").DirectHttpServerAddress | undefined;
  updateSettings(settings: DirectHttp2Settings): DirectHttp2Result<undefined>;
  ref(): void;
  unref(): void;
}

export interface DirectHttp2ServerConstructor {
  new (
    options: DirectHttp2ServerOptions,
    listener: DirectHttp2StreamListener,
    errorListener: DirectHttp2ServerErrorListener,
  ): DirectHttp2Server;
}

export interface DirectHttp2Host {
  ClientSession: DirectHttp2ClientSessionConstructor;
  Server: DirectHttp2ServerConstructor;
}
