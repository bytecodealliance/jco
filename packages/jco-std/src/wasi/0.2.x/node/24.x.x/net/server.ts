/**
 * Preview 2-backed `net.Server`.
 *
 * Public lifecycle and connection-count behavior are adapted from nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/net.js (MIT license). libuv listen handles are
 * replaced by WASI TCP resources.
 */

import { EventEmitter } from "../internal/event-emitter.js";
import {
  accept,
  bind,
  closeTransport,
  dispose,
  listen,
  nodeAddress,
  schedule,
  socketError,
  type BoundTcpSocket,
  type NodeTcpAddress,
  type WasiSocketsProvider,
} from "../internal/wasi-sockets.js";
import { BlockList } from "./block-list.js";
import { BoundSocketBase, consumeBoundSocket } from "./bound-socket.js";
import {
  invalidArgType,
  outOfRange,
  serverAlreadyListening,
  serverNotRunning,
  unsupported,
} from "./errors.js";
import {
  attachAcceptedTransport,
  startSocketReading,
  type SocketBase,
  type SocketConstructor,
} from "./socket.js";
import { validatePort } from "./socket-address.js";
import type {
  AddressInfo,
  DropArgument,
  ListenOptions,
  NetCallback,
  ServerOptions,
} from "./types.js";

type Listener = (...args: never[]) => unknown;
type CloseCallback = (error?: Error) => void;
type ConnectionsCallback = (error: Error | null, count: number) => void;
export type ConnectionListener = (socket: SocketBase) => void;
export interface ServerEventMap {
  close: [];
  connection: [socket: SocketBase];
  listening: [];
  error: [error: Error];
  drop: [data: DropArgument];
}
const DEFAULT_HIGH_WATER_MARK = 65_536;

function callbackFrom(values: readonly unknown[]): NetCallback | undefined {
  const last = values.at(-1);
  return typeof last === "function" ? (last as NetCallback) : undefined;
}

function backlogFrom(values: readonly unknown[]): number | undefined {
  for (const value of values.slice(1)) {
    if (typeof value === "number") {
      return value;
    }
  }
  return undefined;
}

function listenOptions(values: readonly unknown[]): ListenOptions | BoundSocketBase {
  const first = values[0];
  if (first instanceof BoundSocketBase) {
    return first;
  }
  if (first === undefined || typeof first === "function") {
    return { port: 0 };
  }
  if (typeof first === "object" && first !== null) {
    return first as ListenOptions;
  }
  if (typeof first === "string" && !(Number(first) >= 0)) {
    return { path: first };
  }
  const options: ListenOptions = { port: validatePort(first, "options.port") };
  if (typeof values[1] === "string") {
    options.host = values[1];
  }
  options.backlog = backlogFrom(values);
  return options;
}

function validateBacklog(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw invalidArgType("options.backlog", "integer", value);
  }
  if (value < 0 || value > 0x7fff_ffff) {
    throw outOfRange("options.backlog", ">= 0 and <= 2147483647", value);
  }
  return value;
}

export class ServerBase extends EventEmitter {
  readonly #provider: WasiSocketsProvider;
  readonly #Socket: SocketConstructor;
  #bound: BoundTcpSocket | undefined;
  #listening = false;
  #closing = false;
  #connections = new Set<SocketBase>();
  #address: NodeTcpAddress | undefined;

  readonly allowHalfOpen: boolean;
  readonly pauseOnConnect: boolean;
  readonly noDelay: boolean;
  readonly keepAlive: boolean;
  readonly keepAliveInitialDelay: number;
  readonly highWaterMark: number;
  declare readonly blockList: BlockList | undefined;
  declare maxConnections: number | undefined;
  declare dropMaxConnection: boolean | undefined;

  constructor(
    provider: WasiSocketsProvider,
    Socket: SocketConstructor,
    options: ServerOptions | ConnectionListener | null = {},
    connectionListener?: ConnectionListener,
  ) {
    super();
    if (typeof options === "function") {
      connectionListener = options;
      options = {};
    }
    if (options === null) {
      options = {};
    } else if (typeof options !== "object") {
      throw invalidArgType("options", "Object", options);
    }
    if (options.blockList !== undefined && !BlockList.isBlockList(options.blockList)) {
      throw invalidArgType("options.blockList", "net.BlockList", options.blockList);
    }
    if (
      options.keepAliveInitialDelay !== undefined &&
      typeof options.keepAliveInitialDelay !== "number"
    ) {
      throw invalidArgType(
        "options.keepAliveInitialDelay",
        "number",
        options.keepAliveInitialDelay,
      );
    }
    if (options.highWaterMark !== undefined && typeof options.highWaterMark !== "number") {
      throw invalidArgType("options.highWaterMark", "number", options.highWaterMark);
    }
    this.#provider = provider;
    this.#Socket = Socket;
    this.allowHalfOpen = Boolean(options.allowHalfOpen);
    this.pauseOnConnect = Boolean(options.pauseOnConnect);
    this.noDelay = Boolean(options.noDelay);
    this.keepAlive = Boolean(options.keepAlive);
    this.keepAliveInitialDelay = ~~(Math.max(0, options.keepAliveInitialDelay ?? 0) / 1_000);
    this.highWaterMark =
      options.highWaterMark === undefined || options.highWaterMark < 0
        ? DEFAULT_HIGH_WATER_MARK
        : options.highWaterMark;
    if (options.blockList) {
      this.blockList = options.blockList;
    }
    if (connectionListener) {
      this.on("connection", connectionListener as Listener);
    }
  }

  get listening(): boolean {
    return this.#listening;
  }

  on<K extends keyof ServerEventMap>(
    event: K,
    listener: (...args: ServerEventMap[K]) => unknown,
  ): this;
  on(event: string, listener: Listener): this;
  on(event: string, listener: Listener): this {
    return super.on(event, listener);
  }

  addListener<K extends keyof ServerEventMap>(
    event: K,
    listener: (...args: ServerEventMap[K]) => unknown,
  ): this;
  addListener(event: string, listener: Listener): this;
  addListener(event: string, listener: Listener): this {
    return this.on(event, listener);
  }

  once<K extends keyof ServerEventMap>(
    event: K,
    listener: (...args: ServerEventMap[K]) => unknown,
  ): this;
  once(event: string, listener: Listener): this;
  once(event: string, listener: Listener): this {
    return super.once(event, listener);
  }

  listen(options?: ListenOptions | BoundSocketBase, listeningListener?: NetCallback): this;
  listen(port?: number, hostname?: string | NetCallback, listeningListener?: NetCallback): this;
  listen(path: string, listeningListener?: NetCallback): this;
  listen(...args: unknown[]): this {
    if (this.#listening || this.#bound) {
      throw serverAlreadyListening();
    }
    const callback = callbackFrom(args);
    if (callback) {
      this.once("listening", callback as Listener);
    }
    const rawOptions = listenOptions(args);
    let boundSocket: BoundSocketBase | undefined;
    let options: ListenOptions;
    if (rawOptions instanceof BoundSocketBase) {
      boundSocket = rawOptions;
      options = {};
    } else {
      options = rawOptions;
      if (options.handle instanceof BoundSocketBase) {
        boundSocket = options.handle;
      }
    }
    if (options.path !== undefined) {
      return unsupported(
        "net.Server.listen path",
        "wasi:sockets Preview 2 exposes IP sockets but not Unix-domain sockets or named pipes",
      );
    }
    if (options.handle !== undefined && !boundSocket) {
      return unsupported(
        "net.Server.listen handle",
        "components can adopt only a net.BoundSocket, not a libuv or file-descriptor handle",
      );
    }
    if (options.exclusive !== undefined && typeof options.exclusive !== "boolean") {
      throw invalidArgType("options.exclusive", "boolean", options.exclusive);
    }
    for (const name of ["ipv6Only", "reusePort"] as const) {
      if (options[name] !== undefined && typeof options[name] !== "boolean") {
        throw invalidArgType(`options.${name}`, "boolean", options[name]);
      }
      if (options[name]) {
        return unsupported(
          `net.Server.listen ${name}`,
          "wasi:sockets Preview 2 does not expose this listen flag",
        );
      }
    }
    const backlog = validateBacklog(options.backlog ?? backlogFrom(args));
    const port = validatePort(options.port ?? 0, "options.port");
    try {
      this.#bound =
        boundSocket?.[consumeBoundSocket]() ??
        bind(this.#provider, options.host ?? "::", port, backlog);
      if (backlog !== undefined) {
        this.#bound.socket.setListenBacklogSize?.(this.#provider.u64?.(backlog) ?? BigInt(backlog));
      }
      listen(this.#bound.socket);
      this.#address = this.#bound.address;
      this.#listening = true;
      this.#closing = false;
      const signal = options.signal;
      if (signal) {
        const abort = () => this.close();
        if (signal.aborted) {
          queueMicrotask(abort);
        } else {
          signal.addEventListener("abort", abort, { once: true });
        }
      }
      queueMicrotask(() => {
        if (!this.#listening) {
          return;
        }
        this.emit("listening");
        this.#scheduleAccept();
      });
    } catch (error) {
      this.#disposeListener();
      const failure = error instanceof Error ? error : socketError(error, "listen");
      queueMicrotask(() => this.emit("error", failure));
    }
    return this;
  }

  close(callback?: CloseCallback): this {
    if (callback) {
      if (this.#listening || this.#closing) {
        this.once("close", callback as Listener);
      } else {
        queueMicrotask(() => callback(serverNotRunning()));
      }
    }
    if (!this.#listening && !this.#closing) {
      return this;
    }
    this.#listening = false;
    this.#closing = true;
    this.#disposeListener();
    this.#finishClose();
    return this;
  }

  closeAllConnections(): void {
    for (const socket of this.#connections) {
      socket.destroy();
    }
  }

  closeIdleConnections(): void {
    // Raw TCP has no protocol-level notion of idle. Preserve established sockets.
  }

  address(): AddressInfo | null {
    return this.#address ? { ...this.#address } : null;
  }

  getConnections(callback: ConnectionsCallback): void {
    if (typeof callback !== "function") {
      throw invalidArgType("callback", "Function", callback);
    }
    queueMicrotask(() => callback(null, this.#connections.size));
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.#listening && !this.#closing) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.close((error) => (error ? reject(error) : resolve()));
    });
  }

  #scheduleAccept(): void {
    if (!this.#listening) {
      return;
    }
    schedule(this.#provider, () => this.#acceptOne());
  }

  #acceptOne(): void {
    const listener = this.#bound?.socket;
    if (!listener || !this.#listening) {
      return;
    }
    try {
      const [socketHandle, input, output] = accept(listener);
      const local = socketHandle.localAddress
        ? nodeAddress(socketHandle.localAddress())
        : this.#address;
      const remote = socketHandle.remoteAddress
        ? nodeAddress(socketHandle.remoteAddress())
        : undefined;
      const drop = this.#dropReason(remote);
      if (drop) {
        closeTransport(socketHandle, input, output);
        this.emit("drop", drop);
      } else {
        const socket = new this.#Socket({
          allowHalfOpen: this.allowHalfOpen,
          noDelay: this.noDelay,
          keepAlive: this.keepAlive,
          keepAliveInitialDelay: this.keepAliveInitialDelay * 1_000,
        });
        socket[attachAcceptedTransport]({
          socket: socketHandle,
          input,
          output,
          localAddress: local,
          remoteAddress: remote,
        });
        socket.server = this;
        socket._server = this;
        this.#connections.add(socket);
        socket.once("close", (() => {
          this.#connections.delete(socket);
          this.#finishClose();
        }) as Listener);
        if (this.pauseOnConnect) {
          socket.pause();
        }
        this.emit("connection", socket);
        if (!this.pauseOnConnect) {
          socket[startSocketReading]();
        }
      }
    } catch (error) {
      if (this.#listening) {
        const failure = error instanceof Error ? error : socketError(error, "accept");
        this.emit("error", failure);
      }
    } finally {
      if (this.#listening) {
        this.#scheduleAccept();
      }
    }
  }

  #dropReason(remote: NodeTcpAddress | undefined): DropArgument | undefined {
    if (
      remote &&
      this.blockList?.check(remote.address, remote.family === "IPv4" ? "ipv4" : "ipv6")
    ) {
      return {
        localAddress: this.#address?.address,
        localPort: this.#address?.port,
        localFamily: this.#address?.family,
        remoteAddress: remote.address,
        remotePort: remote.port,
        remoteFamily: remote.family,
      };
    }
    if (this.maxConnections !== undefined && this.#connections.size >= this.maxConnections) {
      return {
        localAddress: this.#address?.address,
        localPort: this.#address?.port,
        localFamily: this.#address?.family,
        remoteAddress: remote?.address,
        remotePort: remote?.port,
        remoteFamily: remote?.family,
      };
    }
    return undefined;
  }

  #disposeListener(): void {
    if (!this.#bound) {
      return;
    }
    dispose(this.#bound.socket);
    dispose(this.#bound.network);
    this.#bound = undefined;
    this.#address = undefined;
  }

  #finishClose(): void {
    if (!this.#closing || this.#connections.size !== 0) {
      return;
    }
    this.#closing = false;
    queueMicrotask(() => this.emit("close"));
  }
}

export interface ServerConstructor {
  (
    options?: ServerOptions | ConnectionListener | null,
    connectionListener?: ConnectionListener,
  ): ServerBase;
  new (
    options?: ServerOptions | ConnectionListener | null,
    connectionListener?: ConnectionListener,
  ): ServerBase;
  readonly prototype: ServerBase;
}

export function createServerConstructor(
  provider: WasiSocketsProvider,
  Socket: SocketConstructor,
): ServerConstructor {
  class Server extends ServerBase {
    constructor(
      options?: ServerOptions | ConnectionListener | null,
      connectionListener?: ConnectionListener,
    ) {
      super(provider, Socket, options, connectionListener);
    }
  }
  return new Proxy(Server, {
    apply(_target, _thisArgument, argumentsList) {
      return new Server(
        argumentsList[0] as ServerOptions | ConnectionListener | null | undefined,
        argumentsList[1] as ConnectionListener | undefined,
      );
    },
  }) as ServerConstructor;
}
