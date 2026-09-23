/** @module Interface jco:node/http@0.1.0 **/
export function request(options: RequestOptions): Response;
export type Errno = ErrnoNumber | ErrnoSymbolic;
export interface ErrnoNumber {
  tag: 'number',
  val: bigint,
}
export interface ErrnoSymbolic {
  tag: 'symbolic',
  val: string,
}
export interface Error {
  name: string,
  message: string,
  code?: string,
  errno?: Errno,
  syscall?: string,
  hostname?: string,
  address?: string,
  port?: number,
}
export interface Header {
  name: string,
  value: Uint8Array,
}
export interface Response {
  statusCode: number,
  statusMessage: string,
  httpVersion: string,
  headers: Array<Header>,
  body: Uint8Array,
}
/**
 * Configuration issued by the same jco:node/tls provider bound to this HTTP host.
 */
export interface TlsOptions {
  contextId: number,
}
export interface RequestOptions {
  method: string,
  scheme: string,
  authority: string,
  pathWithQuery: string,
  headers: Array<Header>,
  body: Uint8Array,
  connectTimeoutMs?: number,
  firstByteTimeoutMs?: number,
  betweenBytesTimeoutMs?: number,
  /**
   * Set only for `https` requests that carry TLS options.
   */
  tls?: TlsOptions,
}
export interface ServerOptions {
  requestTimeout?: number,
  headersTimeout?: number,
  keepAliveTimeout?: number,
  keepAliveTimeoutBuffer?: number,
  connectionsCheckingInterval?: number,
  maxHeaderSize?: number,
  joinDuplicateHeaders?: boolean,
  noDelay?: boolean,
  requireHostHeader?: boolean,
  keepAlive?: boolean,
  keepAliveInitialDelay?: number,
  rejectNonStandardBodyWrites?: boolean,
  optimizeEmptyRequests?: boolean,
  /**
   * Present for every `node:https` server, even when empty: the host terminates TLS.
   */
  tls?: TlsOptions,
}
export interface ListenOptions {
  port?: number,
  host?: string,
  backlog?: number,
  path?: string,
  exclusive?: boolean,
  ipv6Only?: boolean,
  reusePort?: boolean,
}
export interface TcpAddress {
  address: string,
  family: string,
  port: number,
}
export type ServerAddress = ServerAddressTcp | ServerAddressPipe;
export interface ServerAddressTcp {
  tag: 'tcp',
  val: TcpAddress,
}
export interface ServerAddressPipe {
  tag: 'pipe',
  val: string,
}

export class Server {
  constructor(options: ServerOptions, listener: number)
  listen(options: ListenOptions): ServerAddress;
  close(): boolean;
  closeAllConnections(): void;
  closeIdleConnections(): void;
  getConnections(): bigint;
  address(): ServerAddress | undefined;
  ref(): void;
  unref(): void;
}
