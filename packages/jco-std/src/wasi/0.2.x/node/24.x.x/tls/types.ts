import type { Duplex, Callback } from "../stream/types.js";
import type { EventEmitter } from "../internal/event-emitter.js";
/** Public data contracts reconciled with Node 24.20.0 and @types/node 24. */
export type TLSVersion = "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3";
export type Pem = string | Uint8Array;
export interface SecureContextOptions {
  ca?: Pem | Pem[];
  cert?: Pem | Pem[];
  key?: Pem | Array<Pem | { pem: Pem; passphrase?: string }>;
  pfx?: Pem | Array<Pem | { buf: Pem; passphrase?: string }>;
  passphrase?: string;
  ciphers?: string;
  ciphersuites?: string;
  sigalgs?: string;
  ecdhCurve?: string;
  dhparam?: Pem;
  crl?: Pem | Pem[];
  honorCipherOrder?: boolean;
  minVersion?: TLSVersion;
  maxVersion?: TLSVersion;
  secureProtocol?: string;
  secureOptions?: number;
  sessionIdContext?: string;
  sessionTimeout?: number;
  ticketKeys?: Uint8Array;
  allowPartialTrustChain?: boolean;
}

export interface PeerCertificate {
  subject: Record<string, string | string[]>;
  issuer: Record<string, string | string[]>;
  subjectaltname?: string;
  infoAccess?: Record<string, string[]>;
  valid_from: string;
  valid_to: string;
  fingerprint: string;
  fingerprint256: string;
  fingerprint512: string;
  serialNumber: string;
  raw: Uint8Array;
  pubkey?: Uint8Array;
  bits?: number;
  issuerCertificate?: PeerCertificate;
  ext_key_usage?: string[];
}

export interface ConnectionOptions extends SecureContextOptions {
  port?: number;
  host?: string;
  path?: string;
  servername?: string;
  rejectUnauthorized?: boolean;
  requestOCSP?: boolean;
  ALPNProtocols?: string[] | Uint8Array;
  session?: Uint8Array;
  minDHSize?: number;
  secureContext?: SecureContextLike;
  checkServerIdentity?: (hostname: string, cert: PeerCertificate) => Error | undefined | null;
  enableTrace?: boolean;
  timeout?: number;
  localAddress?: string;
  localPort?: number;
  family?: number;
  allowHalfOpen?: boolean;
  highWaterMark?: number;
  signal?: AbortSignal;
  socket?: unknown;
  pskCallback?: unknown;
  lookup?: unknown;
}

export interface ServerOptions extends SecureContextOptions {
  requestCert?: boolean;
  rejectUnauthorized?: boolean;
  ALPNProtocols?: string[] | Uint8Array;
  handshakeTimeout?: number;
  enableTrace?: boolean;
  allowHalfOpen?: boolean;
  highWaterMark?: number;
  SNICallback?: unknown;
  ALPNCallback?: unknown;
  pskCallback?: unknown;
}

export interface SecureContextLike {
  readonly context: unknown;
}
export interface AddressInfo {
  address: string;
  family: string;
  port: number;
}
export interface CipherNameAndProtocol {
  name: string;
  standardName: string;
  version: string;
}
export interface EphemeralKeyInfo {
  type: string;
  name?: string;
  size: number;
}
export interface ListenOptions {
  port?: number;
  host?: string;
  backlog?: number;
  path?: string;
  exclusive?: boolean;
  ipv6Only?: boolean;
  reusePort?: boolean;
}
export interface SocketState {
  authorized?: boolean;
  authorizationError?: Error | string;
  alpnProtocol?: string | false;
  servername?: string | false;
  localAddress?: string;
  localPort?: number;
  localFamily?: string;
  remoteAddress?: string;
  remotePort?: number;
  remoteFamily?: string;
  bytesRead?: number;
  bytesWritten?: number;
  connecting?: boolean;
  pending?: boolean;
}

export interface TlsConnect {
  (options: ConnectionOptions, callback?: () => void): TlsSocket;
  (port: number, options?: ConnectionOptions, callback?: () => void): TlsSocket;
  (port: number, host?: string, options?: ConnectionOptions, callback?: () => void): TlsSocket;
  (path: string, options?: ConnectionOptions, callback?: () => void): TlsSocket;
}

export interface NodeTlsModule {
  CLIENT_RENEG_LIMIT: number;
  CLIENT_RENEG_WINDOW: number;
  DEFAULT_CIPHERS: string;
  DEFAULT_ECDH_CURVE: string;
  DEFAULT_MIN_VERSION: TLSVersion;
  DEFAULT_MAX_VERSION: TLSVersion;
  SecureContext: new (options?: SecureContextOptions) => SecureContextLike;
  TLSSocket: new (socket?: unknown, options?: ConnectionOptions) => TlsSocket;
  Server: new (
    options?: ServerOptions | ((socket: TlsSocket) => void),
    listener?: (socket: TlsSocket) => void,
  ) => TlsServer;
  connect: TlsConnect;
  createSecureContext(options?: SecureContextOptions): SecureContextLike;
  createServer(
    options?: ServerOptions | ((socket: TlsSocket) => void),
    listener?: (socket: TlsSocket) => void,
  ): TlsServer;
  convertALPNProtocols(protocols: unknown, out: { ALPNProtocols?: Uint8Array }): void;
  getCiphers(): string[];
  getCertificateCompressionAlgorithms(): string[];
  getCACertificates(type?: "default" | "bundled" | "system" | "extra"): readonly string[];
  setDefaultCACertificates(certs: Array<string | ArrayBufferView>): void;
  checkServerIdentity(hostname: string, cert: PeerCertificate): Error | undefined;
  rootCertificates: readonly string[];
}

export interface TlsSocket extends Duplex {
  encrypted: boolean;
  authorized: boolean;
  authorizationError: Error | string | undefined;
  alpnProtocol: string | false;
  servername: string | false;
  connecting: boolean;
  pending: boolean;
  _read(): void;
  _write(chunk: unknown, _encoding: string, callback: Callback): void;
  _final(callback: Callback): void;
  _destroy(error: Error | null, callback: Callback): void;
  readonly localAddress: string | undefined;
  readonly localPort: number | undefined;
  readonly localFamily: string | undefined;
  readonly remoteAddress: string | undefined;
  readonly remotePort: number | undefined;
  readonly remoteFamily: string | undefined;
  readonly bytesRead: number;
  readonly bytesWritten: number;
  address(): AddressInfo | object;
  getCertificate(): PeerCertificate | object;
  getPeerCertificate(detailed?: boolean): PeerCertificate;
  getCipher(): CipherNameAndProtocol;
  getEphemeralKeyInfo(): EphemeralKeyInfo | object | null;
  getFinished(): Uint8Array | undefined;
  getPeerFinished(): Uint8Array | undefined;
  getProtocol(): string | null;
  setSession(session: Uint8Array | string): void;
  setServername(name: string): void;
  getSession(): Uint8Array | undefined;
  getSharedSigalgs(): string[];
  getTLSTicket(): Uint8Array | undefined;
  isSessionReused(): boolean;
  exportKeyingMaterial(length: number, label: string, context?: Uint8Array): Uint8Array;
  disableRenegotiation(): void;
  enableTrace(): void;
  setMaxSendFragment(size: number): boolean;
  setKeyCert(value: SecureContextLike | SecureContextOptions): void;
  getPeerX509Certificate(): never;
  getX509Certificate(): never;
  setTimeout(timeout: number, callback?: () => void): this;
  setNoDelay(noDelay?: boolean): this;
  setKeepAlive(enable?: boolean, initialDelay?: number): this;
  ref(): this;
  unref(): this;
  renegotiate(
    options: { rejectUnauthorized?: boolean; requestCert?: boolean },
    callback: Callback,
  ): boolean;
}
export interface TlsServer extends EventEmitter {
  maxConnections: number | undefined;
  dropMaxConnection: boolean | undefined;
  listening: boolean;
  listen(options: ListenOptions, callback?: () => void): this;
  listen(port: number, host?: string | (() => void), callback?: () => void): this;
  listen(path: string, callback?: () => void): this;
  address(): AddressInfo | string | null;
  close(callback?: (error?: Error) => void): this;
  getConnections(callback: (error: Error | null, count: number) => void): this;
  getTicketKeys(): Uint8Array;
  setTicketKeys(keys: Uint8Array): void;
  setSecureContext(options: SecureContextOptions): void;
  addContext(hostname: string, value: SecureContextLike | SecureContextOptions): void;
  ref(): this;
  unref(): this;
  [Symbol.asyncDispose](): Promise<void>;
}
