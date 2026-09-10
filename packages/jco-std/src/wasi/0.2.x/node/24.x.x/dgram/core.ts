/*
Copyright Joyent, Inc. and other Node contributors.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
/**
 * Socket lifecycle adapted from nodejs/node lib/dgram.js and lib/internal/dgram.js,
 * v24.20.0, 71b8b174857e25106d39b61a9e6f30d927da8b01 (MIT; see LICENSE).
 * Local adaptations: typed WIT handles replace udp_wrap, callback resources replace
 * native callbacks, microtasks replace nextTick, and deprecated internals fail fast.
 * Native descriptors/cluster handle adoption are explicitly unsupported.
 */
import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { channel } from "../diagnostics-channel.js";
import { BlockList } from "../net/block-list.js";
import { isIP } from "../net/ip.js";
import { callHost } from "../internal/host-error.js";
import { normalizeSend } from "./send.js";
import {
  alreadyBound,
  connected,
  deprecated,
  fromHost,
  invalidArgType,
  invalidArgValue,
  notConnected,
  notRunning,
  outOfRange,
  socketError,
  unsupported,
  validateNumber,
  validatePort,
  validateString,
} from "./errors.js";
import type {
  AddressInfo,
  BindOptions,
  ConnectCallback,
  DgramHost,
  HostSocket,
  LookupCallback,
  Membership,
  Message,
  SendCallback,
  SocketEvent,
  SocketListener,
  SocketOption,
  SocketOptions,
  SocketQuery,
  SocketType,
} from "./types.js";

export function createDgram(host: DgramHost): import("./types.js").DgramImplementation {
  const listeners = new Map<number, Listener>();
  let nextListener = 1;
  class Listener implements SocketListener {
    constructor(readonly deliver: (event: SocketEvent) => void) {}
    event(event: SocketEvent): void {
      this.deliver(event);
    }
    [Symbol.dispose](): void {}
  }
  const dgramCallbacks = {
    SocketListener: Listener,
    takeSocketListener(id: number): Listener | undefined {
      const listener = listeners.get(id);
      listeners.delete(id);
      return listener;
    },
  };
  // Node types expose listeners() as Function[]. The runtime is the same emitter;
  // give its inherited API the portable, callable listener declarations.
  const Emitter = EventEmitter as unknown as new () => import("./types.js").SocketEvents;
  class Socket extends Emitter {
    declare _handle: never;
    declare _receiving: never;
    declare _bindState: never;
    declare _queue: never;
    declare _reuseAddr: never;
    readonly type: SocketType;
    #options: SocketOptions;
    #handle?: HostSocket;
    #listener?: number;
    #closed = false;
    #bindState: "unbound" | "binding" | "bound" = "unbound";
    #connectState: "disconnected" | "connecting" | "connected" = "disconnected";
    #queue?: (() => void)[];
    #ref = true;
    #nextCallback = 1;
    #lookups = new Map<number, LookupCallback>();
    #sends = new Map<number, SendCallback>();
    #removeAbort?: () => void;

    constructor(type: SocketType | SocketOptions, listener?: import("./types.js").MessageListener) {
      super();
      const options = typeof type === "object" && type !== null ? type : { type };
      for (const name of ["recvBufferSize", "sendBufferSize"] as const) {
        const value = options[name];
        if (value) {
          validateNumber(value, `options.${name}`);
          if (!Number.isInteger(value)) {
            throw outOfRange(`options.${name}`, "an integer", value);
          }
          if (value !== value >>> 0) {
            throw outOfRange(`options.${name}`, ">= 0 && <= 4294967295", value);
          }
        }
      }
      for (const name of ["receiveBlockList", "sendBlockList"] as const) {
        if (options[name] && !BlockList.isBlockList(options[name])) {
          throw invalidArgType(`options.${name}`, "net.BlockList", options[name]);
        }
      }
      if (options.lookup !== undefined && typeof options.lookup !== "function") {
        throw invalidArgType("lookup", "Function", options.lookup);
      }
      if (options.type !== "udp4" && options.type !== "udp6") {
        throw socketError(
          "ERR_SOCKET_BAD_TYPE",
          "Bad socket type specified. Valid types are: udp4, udp6",
        );
      }
      this.type = options.type;
      this.#options = {
        type: options.type,
        lookup: options.lookup,
        recvBufferSize: options.recvBufferSize,
        sendBufferSize: options.sendBufferSize,
        receiveBlockList: options.receiveBlockList,
        sendBlockList: options.sendBlockList,
        reuseAddr: options.reuseAddr,
        reusePort: options.reusePort,
        ipv6Only: options.ipv6Only,
      };
      if (typeof listener === "function") {
        this.on("message", listener);
      }
      if (options.signal !== undefined) {
        const signal = options.signal;
        if (
          !signal ||
          typeof signal.aborted !== "boolean" ||
          typeof signal.addEventListener !== "function"
        ) {
          throw invalidArgType("options.signal", "AbortSignal", signal);
        }
        const abort = (): void => {
          if (!this.#closed) {
            this.close();
          }
        };
        if (signal.aborted) {
          abort();
        } else {
          signal.addEventListener("abort", abort, { once: true });
          this.#removeAbort = () => signal.removeEventListener("abort", abort);
        }
      }
      const diagnostic = channel("udp.socket");
      if (diagnostic.hasSubscribers) {
        diagnostic.publish({ socket: this });
      }
    }
    #health(): void {
      if (this.#closed) {
        throw notRunning();
      }
    }
    #ensure(): HostSocket {
      this.#health();
      if (!this.#handle) {
        if (nextListener > 0xffff_ffff) {
          throw socketError("ERR_JCO_DGRAM_CALLBACK_LIMIT", "UDP callback registrations exhausted");
        }
        const id = nextListener++;
        listeners.set(id, new Listener((event) => this.#event(event)));
        try {
          this.#handle = callHost(
            () =>
              host.createSocket(
                {
                  type: this.type,
                  reuseAddr: !!this.#options.reuseAddr,
                  reusePort: !!this.#options.reusePort,
                  ipv6Only: !!this.#options.ipv6Only,
                },
                id,
              ),
            fromHost,
          );
          this.#listener = id;
          if (!this.#ref) {
            this.#handle.setRef(false);
          }
        } catch (error) {
          listeners.delete(id);
          throw error;
        }
      }
      return this.#handle;
    }
    #event(event: SocketEvent): void {
      if (this.#closed && event.tag !== "sent") {
        return;
      }
      switch (event.tag) {
        case "message": {
          const remote = event.val.remote;
          if (
            this.#options.receiveBlockList?.check(
              remote.address,
              remote.family === "IPv6" ? "ipv6" : "ipv4",
            )
          ) {
            return;
          }
          const message = Buffer.from(event.val.data);
          this.emit("message", message, { ...remote, size: message.length });
          break;
        }
        case "error":
          this.emit("error", fromHost(event.val));
          break;
        case "resolved": {
          const callback = this.#lookups.get(event.val.id);
          this.#lookups.delete(event.val.id);
          const result = event.val.result;
          callback?.(
            result.tag === "err" ? fromHost(result.val) : null,
            result.tag === "ok" ? result.val : "",
            this.type === "udp4" ? 4 : 6,
          );
          break;
        }
        case "sent": {
          const callback = this.#sends.get(event.val.id);
          if (!callback) {
            return;
          }
          this.#sends.delete(event.val.id);
          const result = event.val.result;
          try {
            callback?.(
              result.tag === "err" ? fromHost(result.val) : null,
              result.tag === "ok" ? result.val : 0,
            );
          } finally {
            if (this.#closed && this.#sends.size === 0) {
              this.#finishClose();
            }
          }
        }
      }
    }
    #lookup(address: string | undefined, callback: LookupCallback): void {
      const name = address || (this.type === "udp4" ? "127.0.0.1" : "::1");
      const family = this.type === "udp4" ? 4 : 6;
      if (this.#options.lookup) {
        this.#options.lookup(name, family, callback);
        return;
      }
      if (isIP(name) === family) {
        queueMicrotask(() => callback(null, name, family));
        return;
      }
      const id = this.#allocate();
      this.#lookups.set(id, callback);
      try {
        this.#ensure().resolve(name, id);
      } catch (error) {
        this.#lookups.delete(id);
        throw error;
      }
    }
    #allocate(): number {
      if (this.#nextCallback > 0xffff_ffff) {
        throw socketError("ERR_JCO_DGRAM_CALLBACK_LIMIT", "UDP callbacks exhausted");
      }
      return this.#nextCallback++;
    }
    #enqueue(operation: () => void): void {
      if (!this.#queue) {
        this.#queue = [];
        const failed = (): void => {
          this.#queue = undefined;
          this.removeListener("listening", ready);
        };
        const ready = (): void => {
          this.removeListener(EventEmitter.errorMonitor, failed);
          const pending = this.#queue;
          this.#queue = undefined;
          for (const operation of pending ?? []) {
            operation();
          }
        };
        this.once(EventEmitter.errorMonitor, failed);
        this.once("listening", ready);
      }
      this.#queue.push(operation);
    }
    #bound(): void {
      this.#bindState = "bound";
      if (this.#options.recvBufferSize) {
        this.setRecvBufferSize(this.#options.recvBufferSize);
      }
      if (this.#options.sendBufferSize) {
        this.setSendBufferSize(this.#options.sendBufferSize);
      }
    }
    bind(port?: number, address?: string, callback?: () => void): this;
    bind(port?: number, callback?: () => void): this;
    bind(callback?: () => void): this;
    bind(options: BindOptions, callback?: () => void): this;
    bind(
      port?: number | BindOptions | (() => void),
      address?: string | (() => void),
      callback?: () => void,
    ): this {
      this.#health();
      if (this.#bindState !== "unbound") {
        throw alreadyBound();
      }
      if (port !== null && typeof port === "object" && ("fd" in port || "recvStart" in port)) {
        unsupported("dgram.Socket.bind(handle/fd)");
      }
      const handle = this.#ensure();
      this.#bindState = "binding";
      const cb =
        typeof callback === "function"
          ? callback
          : typeof address === "function"
            ? address
            : typeof port === "function"
              ? port
              : undefined;
      if (cb) {
        const remove = (): void => {
          this.removeListener("error", remove);
          this.removeListener("listening", listening);
        };
        const listening = (): void => {
          remove();
          cb.call(this);
        };
        this.on("error", remove);
        this.on("listening", listening);
      }
      const options =
        typeof port === "object" && port !== null
          ? port
          : {
              port: typeof port === "function" ? undefined : port,
              address: typeof address === "string" ? address : undefined,
            };
      this.#lookup(options.address || (this.type === "udp4" ? "0.0.0.0" : "::"), (error, ip) => {
        if (this.#closed) {
          return;
        }
        if (!error) {
          try {
            callHost(
              () => handle.bind(ip, validatePort(options.port || 0, "Port", true)),
              fromHost,
            );
            this.#bound();
          } catch (failure) {
            error = failure as Error;
          }
        }
        if (error) {
          this.#bindState = "unbound";
          this.emit("error", error);
          return;
        }
        this.emit("listening");
      });
      return this;
    }
    bindSync(options: BindOptions = {}): AddressInfo {
      this.#health();
      if (options === null || typeof options !== "object" || Array.isArray(options)) {
        throw invalidArgType("options", "Object", options);
      }
      if (this.#bindState !== "unbound") {
        throw alreadyBound();
      }
      if ("fd" in options) {
        unsupported("dgram.Socket.bindSync(fd)");
      }
      const port = validatePort(options.port ?? 0, "options.port", true);
      const address = options.address || (this.type === "udp4" ? "0.0.0.0" : "::");
      validateString(address, "options.address");
      if (!isIP(address)) {
        throw invalidArgValue(
          "options.address",
          address,
          "must be a numeric IP address; bindSync does not perform DNS resolution",
        );
      }
      const result = callHost(() => this.#ensure().bind(address, port), fromHost);
      this.#bound();
      queueMicrotask(() => {
        if (!this.#closed) {
          this.emit("listening");
        }
      });
      return result;
    }
    connect(port: number, address?: string, callback?: ConnectCallback): void;
    connect(port: number, callback?: ConnectCallback): void;
    connect(port: number, address?: string | ConnectCallback, callback?: ConnectCallback): void {
      port = validatePort(port);
      if (typeof address === "function") {
        callback = address;
        address = "";
      }
      if (address === undefined) {
        address = "";
      }
      validateString(address, "address");
      if (this.#connectState !== "disconnected") {
        throw connected();
      }
      this.#ensure();
      this.#connectState = "connecting";
      if (this.#bindState === "unbound") {
        this.bind({ port: 0, exclusive: true });
      }
      const connect = (): void => {
        if (callback) {
          this.once("connect", callback);
        }
        this.#lookup(address as string, (error, ip) => {
          if (this.#closed) {
            return;
          }
          try {
            if (error) {
              throw error;
            }
            this.#checkBlocked(ip);
            callHost(() => this.#ensure().connect(ip, port), fromHost);
            this.#connectState = "connected";
          } catch (failure) {
            this.#connectState = "disconnected";
            queueMicrotask(() => {
              if (callback) {
                this.removeListener("connect", callback);
                callback(failure as Error);
              } else {
                this.emit("error", failure);
              }
            });
            return;
          }
          queueMicrotask(() => {
            if (!this.#closed) {
              this.emit("connect");
            }
          });
        });
      };
      if (this.#bindState !== "bound") {
        this.#enqueue(connect);
      } else {
        connect();
      }
    }
    connectSync(port: number, address?: string): void {
      this.#health();
      port = validatePort(port);
      if (this.#connectState !== "disconnected") {
        throw connected();
      }
      address = address || (this.type === "udp4" ? "127.0.0.1" : "::1");
      validateString(address, "address");
      if (!isIP(address)) {
        throw invalidArgValue(
          "address",
          address,
          "must be a numeric IP address; connectSync does not perform DNS resolution",
        );
      }
      if (this.#bindState === "unbound") {
        this.bindSync();
      } else if (this.#bindState !== "bound") {
        throw alreadyBound();
      }
      this.#checkBlocked(address);
      callHost(() => this.#ensure().connect(address, port), fromHost);
      this.#connectState = "connected";
      queueMicrotask(() => {
        if (!this.#closed) {
          this.emit("connect");
        }
      });
    }
    #checkBlocked(address: string): void {
      if (this.#options.sendBlockList?.check(address, isIP(address) === 6 ? "ipv6" : "ipv4")) {
        throw socketError("ERR_IP_BLOCKED", `IP ${address} is blocked`);
      }
    }
    disconnect(): void {
      if (this.#connectState !== "connected") {
        throw notConnected();
      }
      callHost(() => this.#ensure().disconnect(), fromHost);
      this.#connectState = "disconnected";
    }
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
    send(
      buffer: unknown,
      offset?: unknown,
      length?: unknown,
      port?: unknown,
      address?: unknown,
      callback?: unknown,
    ): void {
      const connected = this.#connectState === "connected";
      const packet = normalizeSend(connected, buffer, offset, length, port, address, callback);
      this.#health();
      this.#ensure();
      if (this.#bindState === "unbound") {
        this.bind({ port: 0, exclusive: true });
      }
      const send = (): void => {
        const afterLookup: LookupCallback = (error, ip) => {
          if (this.#closed) {
            return;
          }
          if (error) {
            queueMicrotask(() => {
              if (packet.callback) {
                packet.callback(error, 0);
              } else {
                this.emit("error", error);
              }
            });
            return;
          }
          let id: number | undefined;
          try {
            if (!connected) {
              this.#checkBlocked(ip);
            }
            if (packet.callback) {
              id = this.#allocate();
              this.#sends.set(id, packet.callback);
            }
            callHost(
              () =>
                this.#ensure().send(
                  packet.data,
                  connected ? undefined : packet.port,
                  connected ? undefined : ip,
                  id,
                ),
              fromHost,
            );
          } catch (failure) {
            if (id !== undefined) {
              this.#sends.delete(id);
            }
            if (packet.callback) {
              queueMicrotask(() => packet.callback!(failure as Error, 0));
            }
          }
        };
        if (connected) {
          afterLookup(null, "");
        } else {
          this.#lookup(packet.address, afterLookup);
        }
      };
      if (this.#bindState !== "bound") {
        this.#enqueue(send);
      } else {
        send();
      }
    }
    sendto(
      buffer: string | ArrayBufferView,
      offset: number,
      length: number,
      port: number,
      address: string,
      callback?: SendCallback,
    ): void {
      validateNumber(offset, "offset");
      validateNumber(length, "length");
      validateNumber(port, "port");
      validateString(address, "address");
      this.send(buffer, offset, length, port, address, callback);
    }
    close(callback?: () => void): this {
      if (typeof callback === "function") {
        this.on("close", callback);
      }
      if (this.#queue) {
        this.#queue.push(() => this.close());
        return this;
      }
      this.#health();
      this.#handle?.close();
      this.#handle?.[Symbol.dispose]();
      this.#handle = undefined;
      this.#closed = true;
      this.#lookups.clear();
      this.#removeAbort?.();
      if (this.#sends.size === 0) {
        this.#finishClose();
      }
      return this;
    }
    #finishClose(): void {
      if (this.#listener !== undefined) {
        listeners.delete(this.#listener);
      }
      queueMicrotask(() => this.emit("close"));
    }
    async [Symbol.asyncDispose](): Promise<void> {
      if (this.#closed) {
        return;
      }
      await new Promise<void>((resolve) => this.close(resolve));
    }
    address(): AddressInfo {
      this.#health();
      return callHost(() => this.#ensure().address(false), fromHost);
    }
    remoteAddress(): AddressInfo {
      this.#health();
      if (this.#connectState !== "connected") {
        throw notConnected();
      }
      return callHost(() => this.#ensure().address(true), fromHost);
    }
    #option(option: SocketOption): void {
      callHost(() => this.#ensure().setOption(option), fromHost);
    }
    #query(query: SocketQuery): number {
      return callHost(() => this.#ensure().query(query), fromHost);
    }
    setBroadcast(flag: boolean): void {
      this.#option({ tag: "broadcast", val: !!flag });
    }
    setTTL(ttl: number): number {
      validateNumber(ttl, "ttl");
      this.#option({ tag: "ttl", val: ttl });
      return ttl;
    }
    setMulticastTTL(ttl: number): number {
      validateNumber(ttl, "ttl");
      this.#option({ tag: "multicast-ttl", val: ttl });
      return ttl;
    }
    setMulticastLoopback(flag: boolean): boolean {
      this.#option({ tag: "multicast-loopback", val: !!flag });
      return flag;
    }
    setMulticastInterface(address: string): void {
      this.#health();
      validateString(address, "interfaceAddress");
      this.#option({ tag: "multicast-interface", val: address });
    }
    #membership(action: Membership, group: string, source?: string, iface?: string): void {
      this.#health();
      if (source !== undefined) {
        validateString(source, "sourceAddress");
        validateString(group, "groupAddress");
      } else if (!group) {
        throw socketError("ERR_MISSING_ARGS", 'The "multicastAddress" argument must be specified');
      }
      validateString(group, "multicastAddress");
      if (iface !== undefined) {
        validateString(iface, "interfaceAddress");
      }
      callHost(() => this.#ensure().membership(action, group, source, iface), fromHost);
    }
    addMembership(group: string, iface?: string): void {
      this.#membership("add", group, undefined, iface);
    }
    dropMembership(group: string, iface?: string): void {
      this.#membership("drop", group, undefined, iface);
    }
    addSourceSpecificMembership(source: string, group: string, iface?: string): void {
      validateString(source, "sourceAddress");
      this.#membership("add-source", group, source, iface);
    }
    dropSourceSpecificMembership(source: string, group: string, iface?: string): void {
      validateString(source, "sourceAddress");
      this.#membership("drop-source", group, source, iface);
    }
    #buffer(size: number, tag: "recv-buffer" | "send-buffer"): void {
      if (size !== size >>> 0) {
        throw socketError("ERR_SOCKET_BAD_BUFFER_SIZE", "Buffer size must be a positive integer");
      }
      this.#option({ tag, val: size });
    }
    setRecvBufferSize(size: number): void {
      this.#buffer(size, "recv-buffer");
    }
    setSendBufferSize(size: number): void {
      this.#buffer(size, "send-buffer");
    }
    getRecvBufferSize(): number {
      return this.#query("recv-buffer");
    }
    getSendBufferSize(): number {
      return this.#query("send-buffer");
    }
    getSendQueueSize(): number {
      return this.#query("send-queue-size");
    }
    getSendQueueCount(): number {
      return this.#query("send-queue-count");
    }
    ref(): this {
      this.#ref = true;
      this.#handle?.setRef(true);
      return this;
    }
    unref(): this {
      this.#ref = false;
      this.#handle?.setRef(false);
      return this;
    }
    _healthCheck(): never {
      return deprecated("dgram.Socket._healthCheck()");
    }
    _stopReceiving(): never {
      return deprecated("dgram.Socket._stopReceiving()");
    }
  }
  // Node's prototype assignments are enumerable; class syntax defaults otherwise.
  for (const name of Reflect.ownKeys(Socket.prototype)) {
    if (name !== "constructor") {
      Object.defineProperty(Socket.prototype, name, { enumerable: true });
    }
  }
  for (const name of ["_handle", "_receiving", "_bindState", "_queue", "_reuseAddr"]) {
    Object.defineProperty(Socket.prototype, name, {
      get: () => deprecated(`dgram.Socket.${name}`),
      set: () => deprecated(`dgram.Socket.${name}`),
    });
  }
  function createSocket(
    type: SocketType | SocketOptions,
    listener?: import("./types.js").MessageListener,
  ): Socket {
    return new Socket(type, listener);
  }
  function _createSocketHandle(): never {
    return deprecated("dgram._createSocketHandle()");
  }
  const dgram = { _createSocketHandle, createSocket, Socket };
  return { dgram, dgramCallbacks };
}
