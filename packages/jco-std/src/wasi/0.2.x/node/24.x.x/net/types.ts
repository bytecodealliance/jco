import type { BlockList } from "./block-list.js";

export interface AddressInfo {
  address: string;
  family: string;
  port: number;
}

export type SocketReadyState = "opening" | "open" | "readOnly" | "writeOnly" | "closed";
export type NetChunk = string | ArrayBuffer | ArrayBufferView;
export type NetEncoding =
  | "ascii"
  | "utf8"
  | "utf-8"
  | "utf16le"
  | "utf-16le"
  | "ucs2"
  | "ucs-2"
  | "base64"
  | "base64url"
  | "latin1"
  | "binary"
  | "hex";
export type NetCallback = () => void;
export type NetErrorCallback = (error?: Error | null) => void;

export interface SocketEventMap {
  close: [hadError: boolean];
  connect: [];
  ready: [];
  data: [chunk: Uint8Array | string];
  drain: [];
  end: [];
  finish: [];
  readable: [];
  error: [error: Error];
  timeout: [];
  lookup: [error: Error | null, address: string, family: number, host: string];
  connectionAttempt: [address: string, port: number, family: number];
  connectionAttemptFailed: [address: string, port: number, family: number, error: Error];
  connectionAttemptTimeout: [address: string, port: number, family: number];
}

export interface OnReadOptions {
  buffer: Uint8Array | (() => Uint8Array);
  callback(bytesWritten: number, buffer: Uint8Array): boolean;
}

export interface SocketConstructorOptions {
  allowHalfOpen?: boolean;
  onread?: OnReadOptions;
  readable?: boolean;
  writable?: boolean;
  signal?: AbortSignal;
  noDelay?: boolean;
  keepAlive?: boolean;
  keepAliveInitialDelay?: number;
  blockList?: BlockList;
  /** Internal adoption hook used by `BoundSocket`; arbitrary handles are unsupported. */
  handle?: unknown;
  /** Native file descriptors cannot cross the component boundary. */
  fd?: unknown;
  objectMode?: boolean;
  readableObjectMode?: boolean;
  writableObjectMode?: boolean;
}

export interface TcpSocketConnectOptions extends SocketConstructorOptions {
  port: number;
  host?: string;
  localAddress?: string;
  localPort?: number;
  family?: 0 | 4 | 6;
  lookup?: unknown;
  autoSelectFamily?: boolean;
  autoSelectFamilyAttemptTimeout?: number;
  timeout?: number;
}

export interface IpcSocketConnectOptions extends SocketConstructorOptions {
  path: string;
  timeout?: number;
}

export type SocketConnectOptions = TcpSocketConnectOptions | IpcSocketConnectOptions;

export interface ServerOptions {
  allowHalfOpen?: boolean;
  pauseOnConnect?: boolean;
  noDelay?: boolean;
  keepAlive?: boolean;
  keepAliveInitialDelay?: number;
  highWaterMark?: number;
  blockList?: BlockList;
}

export interface ListenOptions {
  port?: number;
  host?: string;
  backlog?: number;
  path?: string;
  exclusive?: boolean;
  ipv6Only?: boolean;
  reusePort?: boolean;
  signal?: AbortSignal;
  /** Internal adoption hook used by `BoundSocket`; arbitrary handles are unsupported. */
  handle?: unknown;
}

export interface DropArgument {
  localAddress?: string;
  localPort?: number;
  localFamily?: string;
  remoteAddress?: string;
  remotePort?: number;
  remoteFamily?: string;
}

export interface WritableDestination {
  write(chunk: Uint8Array | string): unknown;
  end?(): unknown;
}
