import type { BlockList } from "../net/block-list.js";
import type { HostErrorBase, HostResult } from "../internal/wit-types.js";

export type SocketType = "udp4" | "udp6";
export interface AddressInfo {
  address: string;
  family: string;
  port: number;
}
export interface RemoteInfo extends AddressInfo {
  family: "IPv4" | "IPv6";
  size: number;
}
export interface SocketError extends Error {
  code?: string;
  errno?: number | string;
  syscall?: string;
  address?: string;
  port?: number;
  info?: BufferErrorInfo;
}
export type LookupCallback = (error: SocketError | null, address: string, family?: number) => void;
/** Node 24.20 internal/dgram.js passes a numeric family, despite older @types/node declarations. */
export type LookupFunction = (hostname: string, family: number, callback: LookupCallback) => void;
export interface SocketOptions {
  type: SocketType;
  reuseAddr?: boolean;
  reusePort?: boolean;
  ipv6Only?: boolean;
  recvBufferSize?: number;
  sendBufferSize?: number;
  lookup?: LookupFunction;
  signal?: AbortSignal;
  receiveBlockList?: BlockList;
  sendBlockList?: BlockList;
}
export interface BindOptions {
  port?: number;
  address?: string;
  exclusive?: boolean;
  fd?: number;
}
export type SendCallback = (error: SocketError | null, bytes: number) => void;
export type ConnectCallback = (error?: SocketError) => void;
export type Message = string | ArrayBufferView | readonly (string | ArrayBufferView)[];
export interface BufferErrorInfo {
  errno: number;
  code: string;
  message: string;
  syscall: string;
}
export interface DgramError extends HostErrorBase {
  address?: string;
  port?: number;
  info?: BufferErrorInfo;
}
export type Result<T> = HostResult<T, DgramError>;
export interface HostOptions {
  type: SocketType;
  reuseAddr: boolean;
  reusePort: boolean;
  ipv6Only: boolean;
}
export type SocketOption =
  | { tag: "broadcast" | "multicast-loopback"; val: boolean }
  | { tag: "ttl" | "multicast-ttl" | "recv-buffer" | "send-buffer"; val: number }
  | { tag: "multicast-interface"; val: string };
export type SocketQuery = "recv-buffer" | "send-buffer" | "send-queue-size" | "send-queue-count";
export type Membership = "add" | "drop" | "add-source" | "drop-source";
export type SocketEvent =
  | { tag: "message"; val: { data: Uint8Array; remote: AddressInfo } }
  | { tag: "error"; val: DgramError }
  | { tag: "resolved"; val: { id: number; result: Result<string> } }
  | { tag: "sent"; val: { id: number; result: Result<number> } };
export interface SocketListener extends Disposable {
  event(event: SocketEvent): void | Promise<void>;
}
export interface DgramCallbacks {
  takeSocketListener(id: number): SocketListener | undefined | Promise<SocketListener | undefined>;
}
export interface HostSocket extends Disposable {
  bind(address: string, port: number): AddressInfo | Result<AddressInfo>;
  connect(address: string, port: number): void | Result<void>;
  disconnect(): void | Result<void>;
  resolve(address: string, id: number): void;
  send(
    data: Uint8Array,
    port: number | undefined,
    address: string | undefined,
    callback: number | undefined,
  ): void | Result<void>;
  address(remote: boolean): AddressInfo | Result<AddressInfo>;
  setOption(option: SocketOption): void | Result<void>;
  query(query: SocketQuery): number | Result<number>;
  membership(
    action: Membership,
    group: string,
    source: string | undefined,
    iface: string | undefined,
  ): void | Result<void>;
  close(): void;
  setRef(ref: boolean): void;
}
export interface DgramHost {
  Socket: new (options: HostOptions, listener: number) => HostSocket;
  createSocket(options: HostOptions, listener: number): HostSocket | Result<HostSocket>;
}

/** Datagram bytes are runtime Buffers; this portable view exposes byte/text operations. */
export interface DatagramBuffer extends Uint8Array {
  toString(encoding?: string, start?: number, end?: number): string;
  equals(other: Uint8Array): boolean;
}
export type MessageListener = (message: DatagramBuffer, remote: RemoteInfo) => void;
/** EventEmitter's portable public contract, shared with the classic stream declarations. */
type Listener = (...args: unknown[]) => void;
export interface SocketEvents {
  on(event: "message", listener: MessageListener): this;
  on(event: "error", listener: (error: SocketError) => void): this;
  on(event: "close" | "connect" | "listening", listener: () => void): this;
  on<T extends unknown[]>(event: string | symbol, listener: (...args: T) => void): this;
  once(event: "message", listener: MessageListener): this;
  once(event: "error", listener: (error: SocketError) => void): this;
  once(event: "close" | "connect" | "listening", listener: () => void): this;
  once<T extends unknown[]>(event: string | symbol, listener: (...args: T) => void): this;
  off(event: "message", listener: MessageListener): this;
  off(event: "error", listener: (error: SocketError) => void): this;
  off(event: "close" | "connect" | "listening", listener: () => void): this;
  off<T extends unknown[]>(event: string | symbol, listener: (...args: T) => void): this;
  addListener(event: "message", listener: MessageListener): this;
  addListener(event: "error", listener: (error: SocketError) => void): this;
  addListener(event: "close" | "connect" | "listening", listener: () => void): this;
  addListener<T extends unknown[]>(event: string | symbol, listener: (...args: T) => void): this;
  removeListener(event: "message", listener: MessageListener): this;
  removeListener(event: "error", listener: (error: SocketError) => void): this;
  removeListener(event: "close" | "connect" | "listening", listener: () => void): this;
  removeListener<T extends unknown[]>(event: string | symbol, listener: (...args: T) => void): this;
  removeAllListeners(event?: string | symbol): this;
  prependListener(event: "message", listener: MessageListener): this;
  prependListener(event: "error", listener: (error: SocketError) => void): this;
  prependListener(event: "close" | "connect" | "listening", listener: () => void): this;
  prependListener<T extends unknown[]>(
    event: string | symbol,
    listener: (...args: T) => void,
  ): this;
  prependOnceListener(event: "message", listener: MessageListener): this;
  prependOnceListener(event: "error", listener: (error: SocketError) => void): this;
  prependOnceListener(event: "close" | "connect" | "listening", listener: () => void): this;
  prependOnceListener<T extends unknown[]>(
    event: string | symbol,
    listener: (...args: T) => void,
  ): this;
  emit(event: string | symbol, ...args: unknown[]): boolean;
  eventNames(): Array<string | symbol>;
  listeners(event: string | symbol): Listener[];
  rawListeners(event: string | symbol): Listener[];
  listenerCount(event: string | symbol, listener?: Listener): number;
  getMaxListeners(): number;
  setMaxListeners(count: number): this;
}
export interface Socket extends SocketEvents, AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
  readonly type: SocketType;
  bind(port?: number, address?: string, callback?: () => void): this;
  bind(port?: number, callback?: () => void): this;
  bind(callback?: () => void): this;
  bind(options: BindOptions, callback?: () => void): this;
  bindSync(options?: BindOptions): AddressInfo;
  connect(port: number, address?: string, callback?: ConnectCallback): void;
  connect(port: number, callback?: ConnectCallback): void;
  connectSync(port: number, address?: string): void;
  disconnect(): void;
  send(message: Message, callback?: SendCallback): void;
  send(message: Message, port: number, callback?: SendCallback): void;
  send(message: Message, port: number, address?: string, callback?: SendCallback): void;
  send(
    message: string | ArrayBufferView,
    offset: number,
    length: number,
    callback?: SendCallback,
  ): void;
  send(
    message: string | ArrayBufferView,
    offset: number,
    length: number,
    port: number,
    callback?: SendCallback,
  ): void;
  send(
    message: string | ArrayBufferView,
    offset: number,
    length: number,
    port: number,
    address?: string,
    callback?: SendCallback,
  ): void;
  sendto(
    message: string | ArrayBufferView,
    offset: number,
    length: number,
    port: number,
    address: string,
    callback?: SendCallback,
  ): void;
  close(callback?: () => void): this;
  address(): AddressInfo;
  remoteAddress(): AddressInfo;
  setBroadcast(flag: boolean): void;
  setTTL(ttl: number): number;
  setMulticastTTL(ttl: number): number;
  setMulticastLoopback(flag: boolean): boolean;
  setMulticastInterface(address: string): void;
  addMembership(group: string, iface?: string): void;
  dropMembership(group: string, iface?: string): void;
  addSourceSpecificMembership(source: string, group: string, iface?: string): void;
  dropSourceSpecificMembership(source: string, group: string, iface?: string): void;
  setRecvBufferSize(size: number): void;
  setSendBufferSize(size: number): void;
  getRecvBufferSize(): number;
  getSendBufferSize(): number;
  getSendQueueSize(): number;
  getSendQueueCount(): number;
  ref(): this;
  unref(): this;
  _healthCheck(): never;
  _stopReceiving(): never;
  _handle: never;
  _receiving: never;
  _bindState: never;
  _queue: never;
  _reuseAddr: never;
}
export interface SocketConstructor {
  new (type: SocketType | SocketOptions, listener?: MessageListener): Socket;
  prototype: Socket;
}
export interface DgramModule {
  Socket: SocketConstructor;
  createSocket(type: SocketType | SocketOptions, listener?: MessageListener): Socket;
  _createSocketHandle(...args: unknown[]): never;
}
export interface DgramImplementation {
  dgram: DgramModule;
  dgramCallbacks: DgramCallbacks & {
    SocketListener: new (deliver: (event: SocketEvent) => void) => SocketListener;
  };
}
