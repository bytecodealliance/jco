/**
 * Preview 2-backed `net.Socket`.
 *
 * The public state transitions and event ordering are adapted from nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/net.js (MIT license). libuv stream handles are
 * replaced by WASI TCP/input/output resources. Since jco-std has no classic Node Duplex core yet,
 * this class supplies the commonly used Duplex-shaped methods directly over its EventEmitter.
 */

import { Buffer } from "node:buffer";

import { bodyBytes } from "../internal/bytes.js";
import { StringDecoder } from "../string-decoder.js";
import { EventEmitter } from "../internal/event-emitter.js";
import {
  closeTransport,
  connect as connectTcp,
  dispose,
  errorCode,
  schedule,
  socketError,
  wasiU64,
  type BoundTcpSocket,
  type ConnectedTcpSocket,
  type NodeTcpAddress,
  type WasiInputStream,
  type WasiOutputStream,
  type WasiSocketsProvider,
  type WasiTcpSocket,
} from "../internal/wasi-sockets.js";
import { BlockList } from "./block-list.js";
import { BoundSocketBase, consumeBoundSocket } from "./bound-socket.js";
import {
  AbortError,
  deprecated,
  invalidArgType,
  invalidArgValue,
  ipBlocked,
  outOfRange,
  socketClosed,
  socketClosedBeforeConnection,
  unsupported,
} from "./errors.js";
import {
  getDefaultAutoSelectFamily,
  getDefaultAutoSelectFamilyAttemptTimeout,
} from "./defaults.js";
import { normalizeArgs, normalizedArgsSymbol, type NormalizedArgs } from "./normalize.js";
import { validatePort } from "./socket-address.js";
import type {
  AddressInfo,
  NetCallback,
  NetChunk,
  NetEncoding,
  NetErrorCallback,
  SocketConnectOptions,
  SocketConstructorOptions,
  SocketEventMap,
  SocketReadyState,
  TcpSocketConnectOptions,
  WritableDestination,
} from "./types.js";

type Timer = ReturnType<typeof setTimeout>;
type Listener = (...args: never[]) => unknown;

interface PendingRead {
  resolve: (result: IteratorResult<Uint8Array | string>) => void;
  reject: (error: Error) => void;
}

interface AcceptedTransport {
  socket: WasiTcpSocket;
  input: WasiInputStream;
  output: WasiOutputStream;
  localAddress?: NodeTcpAddress;
  remoteAddress?: NodeTcpAddress;
}

export const attachAcceptedTransport = Symbol("attachAcceptedTransport");
export const startSocketReading = Symbol("startSocketReading");

function callbackFrom(values: readonly unknown[]): NetCallback | undefined {
  const last = values.at(-1);
  return typeof last === "function" ? (last as NetCallback) : undefined;
}

function normalizedConnectArgs(args: readonly unknown[]): NormalizedArgs {
  const first = args[0];
  return Array.isArray(first) &&
    (first as unknown as { [normalizedArgsSymbol]?: unknown })[normalizedArgsSymbol]
    ? (first as NormalizedArgs)
    : normalizeArgs(args);
}

function family(value: unknown): 0 | 4 | 6 | undefined {
  if (value === undefined || value === null || value === 0 || value === 4 || value === 6) {
    return value ?? undefined;
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "ipv4") {
      return 4;
    }
    if (normalized === "ipv6") {
      return 6;
    }
  }
  throw invalidArgValue("options.family", value);
}

export class SocketBase extends EventEmitter implements AsyncIterable<Uint8Array | string> {
  readonly #provider: WasiSocketsProvider;
  readonly #allowHalfOpen: boolean;
  readonly #onread: SocketConstructorOptions["onread"];
  #bound: BoundTcpSocket | undefined;
  #socket: WasiTcpSocket | undefined;
  #input: WasiInputStream | undefined;
  #output: WasiOutputStream | undefined;
  #local: NodeTcpAddress | undefined;
  #remote: NodeTcpAddress | undefined;
  #decoder: StringDecoder | undefined;
  #paused = false;
  #reading = false;
  #readQueue: Array<Uint8Array | string> = [];
  #pendingReads: PendingRead[] = [];
  #timeoutTimer: Timer | undefined;
  #timeout: number | undefined;
  #closed = false;
  #hadError = false;
  #error: Error | undefined;
  #signal: AbortSignal | undefined;
  #abort: (() => void) | undefined;
  #noDelay = false;
  #keepAlive = false;
  #keepAliveInitialDelay = 0;
  #keepAliveInterval: number | undefined;
  #keepAliveCount: number | undefined;
  #bytesRead = 0;
  #bytesWritten = 0;
  #connecting = false;
  #readable: boolean;
  #writable: boolean;

  declare autoSelectFamilyAttemptedAddresses: string[] | undefined;
  readonly allowHalfOpen: boolean;
  server: unknown = null;
  _server: unknown = null;

  constructor(provider: WasiSocketsProvider, options: SocketConstructorOptions = {}) {
    super();
    if (typeof options !== "object" || options === null) {
      throw invalidArgType("options", "Object", options);
    }
    for (const name of ["objectMode", "readableObjectMode", "writableObjectMode"] as const) {
      if (options[name]) {
        throw invalidArgValue(`options.${name}`, options[name], "is not supported");
      }
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
    if (options.fd !== undefined) {
      unsupported(
        "net.Socket options.fd",
        "operating-system file descriptors cannot cross the component boundary",
      );
    }
    this.#provider = provider;
    this.#allowHalfOpen = Boolean(options.allowHalfOpen);
    this.allowHalfOpen = this.#allowHalfOpen;
    const onread = options.onread;
    this.#onread =
      onread !== null &&
      typeof onread === "object" &&
      (onread.buffer instanceof Uint8Array || typeof onread.buffer === "function") &&
      typeof onread.callback === "function"
        ? onread
        : undefined;
    this.#readable = options.readable !== false;
    this.#writable = options.writable !== false;
    this.#noDelay = Boolean(options.noDelay);
    this.#keepAlive = Boolean(options.keepAlive);
    this.#keepAliveInitialDelay =
      ~~(Math.max(0, options.keepAliveInitialDelay ?? 0) / 1_000) * 1_000;
    if (options.handle !== undefined) {
      if (!(options.handle instanceof BoundSocketBase)) {
        unsupported(
          "net.Socket options.handle",
          "components can adopt only a net.BoundSocket, not a libuv or file-descriptor handle",
        );
      }
      this.#bound = options.handle[consumeBoundSocket]();
      this.#local = this.#bound.address;
    }
    this.#setSignal(options.signal);
  }

  get connecting(): boolean {
    return this.#connecting;
  }

  on<K extends keyof SocketEventMap>(
    event: K,
    listener: (...args: SocketEventMap[K]) => unknown,
  ): this;
  on(event: string, listener: Listener): this;
  on(event: string, listener: Listener): this {
    super.on(event, listener);
    if (event === "data" && !this.#paused) {
      queueMicrotask(() => {
        if (!this.#paused) {
          this.resume();
        }
      });
    }
    return this;
  }

  addListener<K extends keyof SocketEventMap>(
    event: K,
    listener: (...args: SocketEventMap[K]) => unknown,
  ): this;
  addListener(event: string, listener: Listener): this;
  addListener(event: string, listener: Listener): this {
    return this.on(event, listener);
  }

  once<K extends keyof SocketEventMap>(
    event: K,
    listener: (...args: SocketEventMap[K]) => unknown,
  ): this;
  once(event: string, listener: Listener): this;
  once(event: string, listener: Listener): this {
    super.once(event, listener);
    if (event === "data" && !this.#paused) {
      queueMicrotask(() => {
        if (!this.#paused) {
          this.resume();
        }
      });
    }
    return this;
  }

  get pending(): boolean {
    return this.#socket === undefined || this.#connecting;
  }

  get destroyed(): boolean {
    return this.#closed;
  }

  get readable(): boolean {
    return this.#readable;
  }

  get writable(): boolean {
    return this.#writable;
  }

  get readableEnded(): boolean {
    return !this.#readable;
  }

  get writableEnded(): boolean {
    return !this.#writable;
  }

  get writableLength(): number {
    return 0;
  }

  get readyState(): SocketReadyState {
    if (this.#connecting) {
      return "opening";
    }
    if (this.#readable && this.#writable) {
      return "open";
    }
    if (this.#readable) {
      return "readOnly";
    }
    if (this.#writable) {
      return "writeOnly";
    }
    return "closed";
  }

  get bufferSize(): never {
    return deprecated("net.Socket.bufferSize", "socket.writableLength");
  }

  get bytesRead(): number {
    return this.#bytesRead;
  }

  get bytesWritten(): number {
    return this.#bytesWritten;
  }

  get remoteAddress(): string | undefined {
    return this.#remote?.address;
  }

  get remoteFamily(): string | undefined {
    return this.#remote?.family;
  }

  get remotePort(): number | undefined {
    return this.#remote?.port;
  }

  get localAddress(): string | undefined {
    return this.#local?.address;
  }

  get localFamily(): string | undefined {
    return this.#local?.family;
  }

  get localPort(): number | undefined {
    return this.#local?.port;
  }

  get timeout(): number | undefined {
    return this.#timeout;
  }

  connect(options: SocketConnectOptions, connectionListener?: NetCallback): this;
  connect(port: number, host?: string | NetCallback, connectionListener?: NetCallback): this;
  connect(path: string, connectionListener?: NetCallback): this;
  connect(...args: unknown[]): this {
    if (this.#closed) {
      throw socketClosed();
    }
    const [rawOptions, listener] = normalizedConnectArgs(args);
    const options = rawOptions as Partial<TcpSocketConnectOptions> & { path?: unknown };
    this.#setSignal(options.signal);
    const connectionListener = (listener as NetCallback | null) ?? callbackFrom(args);
    if (connectionListener) {
      this.once("connect", connectionListener as Listener);
    }
    if (options.path !== undefined) {
      return unsupported(
        "net.Socket.connect path",
        "wasi:sockets Preview 2 exposes IP sockets but not Unix-domain sockets or named pipes",
      );
    }
    const port = validatePort(options.port, "options.port");
    const host = options.host ?? "localhost";
    if (typeof host !== "string") {
      throw invalidArgType("options.host", "string", host);
    }
    if (options.lookup !== undefined) {
      return unsupported(
        "net.Socket.connect custom lookup",
        "asynchronous JavaScript DNS callbacks cannot be retained across the Preview 2 boundary",
      );
    }
    const selectedFamily = family(options.family);
    if (options.timeout !== undefined) {
      this.setTimeout(options.timeout);
    }
    const autoSelect = options.autoSelectFamily ?? getDefaultAutoSelectFamily();
    if (typeof autoSelect !== "boolean") {
      throw invalidArgType("options.autoSelectFamily", "boolean", autoSelect);
    }
    const attemptTimeout =
      options.autoSelectFamilyAttemptTimeout ?? getDefaultAutoSelectFamilyAttemptTimeout();
    if (
      typeof attemptTimeout !== "number" ||
      !Number.isInteger(attemptTimeout) ||
      attemptTimeout < 1 ||
      attemptTimeout > 0x7fff_ffff
    ) {
      throw outOfRange("options.autoSelectFamilyAttemptTimeout", "an integer >= 1", attemptTimeout);
    }
    const lookupEvents: Array<[string, 4 | 6, string]> = [];
    if (this.#signal?.aborted) {
      return this;
    }
    this.#connecting = true;
    try {
      const bound = this.#bound;
      this.#bound = undefined;
      let transport: ConnectedTcpSocket;
      try {
        transport = connectTcp(this.#provider, host, port, {
          family: selectedFamily,
          localAddress: options.localAddress,
          localPort: options.localPort,
          socket: bound?.socket,
          network: bound?.network,
          allowAddress: (address, addressFamily) => {
            if (options.blockList?.check(address, addressFamily === 4 ? "ipv4" : "ipv6")) {
              throw ipBlocked(address);
            }
            return true;
          },
          onLookup: (address, addressFamily, hostname) =>
            lookupEvents.push([address, addressFamily, hostname]),
          onAttempt: (address, attemptPort, addressFamily) =>
            queueMicrotask(() =>
              this.emit("connectionAttempt", address, attemptPort, addressFamily),
            ),
        });
      } finally {
        if (bound) {
          dispose(bound.network);
        }
      }
      this.#attach(transport);
      if (autoSelect && transport.attemptedAddresses.length > 1) {
        this.autoSelectFamilyAttemptedAddresses = transport.attemptedAddresses;
      }
      queueMicrotask(() => {
        if (this.#closed) {
          return;
        }
        for (const [address, addressFamily, hostname] of lookupEvents) {
          this.emit("lookup", null, address, addressFamily, hostname);
        }
        this.#connecting = false;
        this.emit("connect");
        this.emit("ready");
        this[startSocketReading]();
      });
    } catch (error) {
      this.#connecting = false;
      const failure =
        error instanceof Error ? error : socketError(error, "connect", host, undefined, port);
      queueMicrotask(() => this.destroy(failure));
    }
    return this;
  }

  write(chunk: NetChunk, callback?: NetErrorCallback): boolean;
  write(chunk: NetChunk, encoding?: string, callback?: NetErrorCallback): boolean;
  write(
    chunk: NetChunk,
    encodingOrCallback?: string | NetErrorCallback,
    callback?: NetErrorCallback,
  ): boolean {
    const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
    const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (!this.#writable || this.#closed || !this.#output) {
      const error = socketClosed();
      queueMicrotask(() => {
        done?.(error);
        this.emit("error", error);
      });
      return false;
    }
    try {
      if (encoding !== undefined && !Buffer.isEncoding(encoding)) {
        throw invalidArgValue("encoding", encoding);
      }
      const bytes = typeof chunk === "string" ? Buffer.from(chunk, encoding) : bodyBytes(chunk);
      this.#output.blockingWriteAndFlush(bytes);
      this.#bytesWritten += bytes.byteLength;
      this.#refreshTimeout();
      queueMicrotask(() => done?.(null));
      return true;
    } catch (error) {
      const failure = error instanceof Error ? error : socketError(error, "write");
      queueMicrotask(() => {
        done?.(failure);
        this.destroy(failure);
      });
      return false;
    }
  }

  end(callback?: NetCallback): this;
  end(chunk: NetChunk, callback?: NetCallback): this;
  end(chunk: NetChunk, encoding?: string, callback?: NetCallback): this;
  end(
    chunkOrCallback?: NetChunk | NetCallback,
    encodingOrCallback?: string | NetCallback,
    callback?: NetCallback,
  ): this {
    const chunk = typeof chunkOrCallback === "function" ? undefined : chunkOrCallback;
    const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
    const done =
      typeof chunkOrCallback === "function"
        ? chunkOrCallback
        : typeof encodingOrCallback === "function"
          ? encodingOrCallback
          : callback;
    if (chunk !== undefined) {
      this.write(chunk, encoding);
    }
    if (this.#writable) {
      this.#writable = false;
      try {
        this.#socket?.shutdown("send");
      } catch (error) {
        if (errorCode(error) !== "not-connected") {
          this.#hadError = true;
        }
      }
      dispose(this.#output);
      this.#output = undefined;
      queueMicrotask(() => {
        this.emit("finish");
        done?.();
        if (!this.#readable) {
          this.destroy();
        }
      });
    } else {
      queueMicrotask(() => done?.());
    }
    return this;
  }

  destroy(error?: Error): this {
    if (this.#closed) {
      return this;
    }
    if (this.#connecting && !error) {
      error = socketClosedBeforeConnection();
    }
    this.#closed = true;
    this.#connecting = false;
    this.#readable = false;
    this.#writable = false;
    this.#hadError ||= error !== undefined;
    this.#error = error;
    if (this.#signal && this.#abort) {
      this.#signal.removeEventListener("abort", this.#abort);
      this.#signal = undefined;
      this.#abort = undefined;
    }
    if (this.#timeoutTimer !== undefined) {
      clearTimeout(this.#timeoutTimer);
      this.#timeoutTimer = undefined;
    }
    if (this.#socket) {
      closeTransport(this.#socket, this.#input, this.#output);
    }
    if (this.#bound) {
      closeTransport(this.#bound.socket);
      dispose(this.#bound.network);
      this.#bound = undefined;
    }
    this.#socket = undefined;
    this.#input = undefined;
    this.#output = undefined;
    while (this.#pendingReads.length > 0) {
      const pending = this.#pendingReads.shift()!;
      if (error) {
        pending.reject(error);
      } else {
        pending.resolve({ done: true, value: undefined });
      }
    }
    queueMicrotask(() => {
      if (error) {
        this.emit("error", error);
      }
      this.emit("close", this.#hadError);
    });
    return this;
  }

  destroySoon(): void {
    if (this.#writable) {
      this.end(() => this.destroy());
    } else {
      this.destroy();
    }
  }

  resetAndDestroy(): never {
    return unsupported(
      "net.Socket.resetAndDestroy",
      "wasi:sockets Preview 2 does not expose TCP reset-on-close",
    );
  }

  pause(): this {
    this.#paused = true;
    return this;
  }

  resume(): this {
    this.#paused = false;
    while (!this.#paused && this.#readQueue.length > 0) {
      this.emit("data", this.#readQueue.shift());
    }
    this[startSocketReading]();
    return this;
  }

  read(): Uint8Array | string | null {
    return this.#readQueue.shift() ?? null;
  }

  pipe(destination: WritableDestination): WritableDestination {
    this.on("data", ((chunk: Uint8Array | string) => destination.write(chunk)) as Listener);
    this.once("end", (() => destination.end?.()) as Listener);
    this.resume();
    return destination;
  }

  setEncoding(encoding: NetEncoding = "utf8"): this {
    this.#decoder = new StringDecoder(encoding);
    return this;
  }

  setTimeout(timeout: number, callback?: NetCallback): this {
    if (typeof timeout !== "number") {
      throw invalidArgType("msecs", "number", timeout);
    }
    if (!Number.isFinite(timeout) || timeout < 0 || timeout > 0xffff_ffff) {
      throw outOfRange("msecs", ">= 0 and <= 4294967295", timeout);
    }
    if (timeout > 0 && typeof setTimeout !== "function") {
      return unsupported("net.Socket.setTimeout", "the component engine does not provide timers");
    }
    this.#timeout = Math.trunc(timeout);
    if (callback) {
      this.once("timeout", callback as Listener);
    }
    this.#refreshTimeout();
    return this;
  }

  setNoDelay(noDelay = true): this {
    this.#noDelay = Boolean(noDelay);
    return this;
  }

  setKeepAlive(enable = false, initialDelay = 0, interval?: number, count?: number): this {
    this.#keepAlive = Boolean(enable);
    this.#keepAliveInitialDelay = ~~(initialDelay / 1_000) * 1_000;
    this.#keepAliveInterval = interval === undefined ? undefined : ~~(interval / 1_000) * 1_000;
    this.#keepAliveCount = count;
    this.#applySocketOptions();
    return this;
  }

  setTypeOfService(tos: number): never {
    if (typeof tos !== "number" || Number.isNaN(tos)) {
      throw invalidArgType("tos", "number", tos);
    }
    if (!Number.isInteger(tos) || tos < 0 || tos > 255) {
      throw outOfRange("tos", ">= 0 and <= 255", tos);
    }
    return unsupported(
      "net.Socket.setTypeOfService",
      "wasi:sockets Preview 2 does not expose the IP type-of-service socket option",
    );
  }

  getTypeOfService(): never {
    return unsupported(
      "net.Socket.getTypeOfService",
      "wasi:sockets Preview 2 does not expose the IP type-of-service socket option",
    );
  }

  address(): AddressInfo | Record<string, never> {
    return this.#local ? { ...this.#local } : {};
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  [attachAcceptedTransport](transport: AcceptedTransport): void {
    this.#attach({ ...transport, attemptedAddresses: [] });
    this.#connecting = false;
  }

  [startSocketReading](): void {
    if (this.#reading || this.#paused || !this.#readable || this.#closed || !this.#input) {
      return;
    }
    this.#reading = true;
    schedule(this.#provider, () => this.#readOnce());
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array | string> {
    // An iterator consumes stream errors through its rejected next() promise.
    const onError = (): void => {};
    this.on("error", onError);
    try {
      for (;;) {
        if (this.#error) {
          throw this.#error;
        }
        const queued = this.#readQueue.shift();
        if (queued !== undefined) {
          yield queued;
          continue;
        }
        if (!this.#readable || this.#closed) {
          return;
        }
        const result = await new Promise<IteratorResult<Uint8Array | string>>((resolve, reject) => {
          this.#pendingReads.push({ resolve, reject });
          this[startSocketReading]();
        });
        if (result.done) {
          return;
        }
        yield result.value;
      }
    } finally {
      if (!this.#closed) {
        this.destroy();
      }
      queueMicrotask(() => this.off("error", onError));
    }
  }

  #attach(transport: ConnectedTcpSocket): void {
    this.#socket = transport.socket;
    this.#input = transport.input;
    this.#output = transport.output;
    this.#local = transport.localAddress;
    this.#remote = transport.remoteAddress;
    this.#readable = true;
    this.#writable = true;
    this.#applySocketOptions();
    this.#refreshTimeout();
  }

  #applySocketOptions(): void {
    const socket = this.#socket;
    if (!socket) {
      return;
    }
    socket.setKeepAliveEnabled?.(this.#keepAlive);
    if (this.#keepAlive && this.#keepAliveInitialDelay > 0) {
      socket.setKeepAliveIdleTime?.(
        wasiU64(this.#provider, this.#keepAliveInitialDelay * 1_000_000),
      );
    }
    if (this.#keepAlive && this.#keepAliveInterval !== undefined && this.#keepAliveInterval > 0) {
      socket.setKeepAliveInterval?.(
        wasiU64(this.#provider, Math.trunc(this.#keepAliveInterval) * 1_000_000),
      );
    }
    if (this.#keepAlive && this.#keepAliveCount !== undefined && this.#keepAliveCount > 0) {
      socket.setKeepAliveCount?.(Math.trunc(this.#keepAliveCount));
    }
    void this.#noDelay;
  }

  #refreshTimeout(): void {
    if (this.#timeoutTimer !== undefined) {
      clearTimeout(this.#timeoutTimer);
      this.#timeoutTimer = undefined;
    }
    if (!this.#timeout) {
      return;
    }
    this.#timeoutTimer = setTimeout(() => this.emit("timeout"), this.#timeout);
  }

  #setSignal(signal: AbortSignal | undefined): void {
    if (!signal || signal === this.#signal) {
      return;
    }
    if (this.#signal && this.#abort) {
      this.#signal.removeEventListener("abort", this.#abort);
    }
    this.#signal = signal;
    this.#abort = () => {
      this.destroy(new AbortError());
    };
    if (signal.aborted) {
      queueMicrotask(this.#abort);
    } else {
      signal.addEventListener("abort", this.#abort, { once: true });
    }
  }

  #readOnce(): void {
    this.#reading = false;
    if (this.#paused || !this.#readable || this.#closed || !this.#input) {
      return;
    }
    try {
      const target = this.#onread
        ? typeof this.#onread.buffer === "function"
          ? this.#onread.buffer()
          : this.#onread.buffer
        : undefined;
      if (target && target.byteLength === 0) {
        throw invalidArgValue("options.onread.buffer", target, "must not be empty");
      }
      const bytes = this.#input.blockingRead(wasiU64(this.#provider, target?.byteLength ?? 65_536));
      if (bytes.byteLength > 0) {
        this.#bytesRead += bytes.byteLength;
        this.#refreshTimeout();
        if (this.#onread && target) {
          target.set(bytes);
          if (this.#onread.callback(bytes.byteLength, target) === false) {
            this.#paused = true;
          }
        } else {
          this.#deliver(this.#decoder ? this.#decoder.write(bytes) : Buffer.from(bytes));
        }
      }
      this[startSocketReading]();
    } catch (error) {
      if (errorCode(error) === "closed") {
        if (this.#decoder) {
          this.#deliver(this.#decoder.end());
        }
        this.#readable = false;
        dispose(this.#input);
        this.#input = undefined;
        while (this.#pendingReads.length > 0) {
          this.#pendingReads.shift()!.resolve({ done: true, value: undefined });
        }
        this.emit("end");
        if (!this.#allowHalfOpen && this.#writable) {
          this.end();
        }
        if (!this.#writable) {
          this.destroy();
        }
      } else {
        this.destroy(error instanceof Error ? error : socketError(error, "read"));
      }
    }
  }

  #deliver(value: Uint8Array | string): void {
    if (value.length === 0) {
      return;
    }
    const pending = this.#pendingReads.shift();
    if (pending) {
      pending.resolve({ done: false, value });
    } else if (this.#paused || this.listenerCount("data") === 0) {
      this.#readQueue.push(value);
      this.emit("readable");
    } else {
      this.emit("data", value);
    }
  }
}

export interface SocketConstructor {
  (options?: SocketConstructorOptions): SocketBase;
  new (options?: SocketConstructorOptions): SocketBase;
  readonly prototype: SocketBase;
}

export function createSocketConstructor(provider: WasiSocketsProvider): SocketConstructor {
  class Socket extends SocketBase {
    constructor(options?: SocketConstructorOptions) {
      super(provider, options);
    }
  }
  return new Proxy(Socket, {
    apply(_target, _thisArgument, argumentsList) {
      return new Socket(argumentsList[0] as SocketConstructorOptions | undefined);
    },
  }) as SocketConstructor;
}
