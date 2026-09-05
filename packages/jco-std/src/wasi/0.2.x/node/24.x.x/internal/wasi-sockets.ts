/**
 * Shared Preview 2 TCP transport for the Node-compatible net, HTTP/1, and HTTP/2 shims.
 *
 * The state transitions follow the WASI Preview 2 sockets specification. Node-facing address
 * and error shapes follow nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/net.js (MIT license). Local changes replace
 * libuv handles with typed WASI resources and complete would-block operations through pollables.
 */

import { codedError, invalidArgValue, unsupportedNodeApi } from "../errors/core.js";
import { canonicalIpv6, isIP, parseIpv4, parseIpv6 } from "../net/ip.js";

export type WasiIpAddress =
  | { tag: "ipv4"; val: [number, number, number, number] }
  | { tag: "ipv6"; val: [number, number, number, number, number, number, number, number] };

export type WasiIpSocketAddress =
  | { tag: "ipv4"; val: { port: number; address: [number, number, number, number] } }
  | {
      tag: "ipv6";
      val: {
        port: number;
        flowInfo: number;
        address: [number, number, number, number, number, number, number, number];
        scopeId: number;
      };
    };

export interface NodeTcpAddress {
  address: string;
  family: "IPv4" | "IPv6";
  port: number;
}

export interface WasiPollable {
  block(): void;
  [Symbol.dispose]?(): void;
}

export interface WasiInputStream {
  blockingRead(length: bigint): Uint8Array;
  [Symbol.dispose]?(): void;
}

export interface WasiOutputStream {
  blockingWriteAndFlush(contents: Uint8Array): void;
  [Symbol.dispose]?(): void;
}

export interface WasiResolveAddressStream {
  resolveNextAddress(): WasiIpAddress | undefined;
  subscribe(): WasiPollable;
  [Symbol.dispose]?(): void;
}

export interface WasiTcpSocket {
  startBind?(network: WasiNetwork, localAddress: WasiIpSocketAddress): void;
  finishBind?(): void;
  startConnect(network: WasiNetwork, remoteAddress: WasiIpSocketAddress): void;
  finishConnect(): [WasiInputStream, WasiOutputStream];
  startListen?(): void;
  finishListen?(): void;
  accept?(): [WasiTcpSocket, WasiInputStream, WasiOutputStream];
  localAddress?(): WasiIpSocketAddress;
  remoteAddress?(): WasiIpSocketAddress;
  setListenBacklogSize?(value: bigint): void;
  setKeepAliveEnabled?(value: boolean): void;
  setKeepAliveIdleTime?(value: bigint): void;
  setKeepAliveInterval?(value: bigint): void;
  setKeepAliveCount?(value: number): void;
  subscribe(): WasiPollable;
  shutdown(direction: "receive" | "send" | "both"): void;
  [Symbol.dispose]?(): void;
}

export interface WasiNetwork {
  [Symbol.dispose]?(): void;
}

export interface WasiSocketsProvider {
  instanceNetwork: {
    instanceNetwork(): WasiNetwork;
  };
  ipNameLookup: {
    resolveAddresses(network: WasiNetwork, name: string): WasiResolveAddressStream;
  };
  tcpCreateSocket: {
    createTcpSocket(family: "ipv4" | "ipv6"): WasiTcpSocket;
  };
  /** Convert a safe integer to the component engine's WIT u64 representation. */
  u64?: (value: number) => bigint;
  schedule?: (task: () => void | Promise<void>) => void;
}

export interface ConnectedTcpSocket {
  socket: WasiTcpSocket;
  input: WasiInputStream;
  output: WasiOutputStream;
  localAddress?: NodeTcpAddress;
  remoteAddress?: NodeTcpAddress;
  attemptedAddresses: string[];
}

export interface TcpConnectOptions {
  family?: 0 | 4 | 6;
  localAddress?: string;
  localPort?: number;
  allowAddress?: (address: string, family: 4 | 6) => boolean;
  onLookup?: (address: string, family: 4 | 6, hostname: string) => void;
  onAttempt?: (address: string, port: number, family: 4 | 6) => void;
  socket?: WasiTcpSocket;
  network?: WasiNetwork;
}

export function wasiU64(provider: WasiSocketsProvider, value: number): bigint {
  return provider.u64?.(value) ?? BigInt(value);
}

export function dispose(resource: { [Symbol.dispose]?(): void } | undefined): void {
  resource?.[Symbol.dispose]?.();
}

export function schedule(provider: WasiSocketsProvider, task: () => void | Promise<void>): void {
  if (provider.schedule) {
    provider.schedule(task);
  } else {
    queueMicrotask(() => void task());
  }
}

export function errorCode(error: unknown): string | undefined {
  // ComponentizeJS wraps WIT result errors in an Error with a payload; direct
  // providers and QuickJS expose the result's error value itself.
  if (typeof error === "object" && error !== null && "payload" in error) {
    error = error.payload;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null && "tag" in error) {
    const tag = (error as { tag?: unknown }).tag;
    return typeof tag === "string" ? tag : undefined;
  }
  return undefined;
}

export function socketError(
  error: unknown,
  syscall: string,
  hostname?: string,
  address?: string,
  port?: number,
): Error & {
  code: string;
  syscall: string;
  hostname?: string;
  address?: string;
  port?: number;
} {
  const wasiCode = errorCode(error) ?? "unknown";
  const nodeCodes: Readonly<Record<string, string>> = {
    "access-denied": "EACCES",
    "address-in-use": "EADDRINUSE",
    "connection-aborted": "ECONNABORTED",
    "connection-refused": "ECONNREFUSED",
    "connection-reset": "ECONNRESET",
    "name-unresolvable": "ENOTFOUND",
    "remote-unreachable": "EHOSTUNREACH",
    timeout: "ETIMEDOUT",
  };
  const code = nodeCodes[wasiCode] ?? "ERR_JCO_WASI_SOCKET";
  const target = address ?? hostname;
  const message = `${syscall} ${code}${target ? ` ${target}` : ""}${port === undefined ? "" : `:${port}`}`;
  return Object.assign(codedError(new Error(message), code), {
    syscall,
    hostname,
    address,
    port,
  });
}

export function ipSocketAddress(address: string, port: number): WasiIpSocketAddress {
  const family = isIP(address);
  if (family === 4) {
    return {
      tag: "ipv4",
      val: {
        address: Array.from(parseIpv4(address)!) as [number, number, number, number],
        port,
      },
    };
  }
  if (family === 6) {
    const bytes = parseIpv6(address)!;
    const parts = Array.from(
      { length: 8 },
      (_, index) => (bytes[index * 2] << 8) | bytes[index * 2 + 1],
    ) as [number, number, number, number, number, number, number, number];
    return {
      tag: "ipv6",
      val: { address: parts, port, flowInfo: 0, scopeId: 0 },
    };
  }
  throw invalidArgValue("address", address, "must be a valid IP address");
}

export function localAddress(
  host: string,
  port: number,
  api = "Server.listen host",
): WasiIpSocketAddress {
  const normalized = host === "localhost" ? "127.0.0.1" : host;
  try {
    return ipSocketAddress(normalized, port);
  } catch {
    throw unsupportedNodeApi(
      api,
      "wasi:sockets Preview 2 accepts localhost or numeric IPv4 and IPv6 listen addresses",
    );
  }
}

export function nodeAddress(address: WasiIpSocketAddress): NodeTcpAddress {
  if (address.tag === "ipv4") {
    return {
      address: address.val.address.join("."),
      family: "IPv4",
      port: address.val.port,
    };
  }
  const bytes = new Uint8Array(16);
  address.val.address.forEach((part, index) => {
    bytes[index * 2] = part >>> 8;
    bytes[index * 2 + 1] = part & 0xff;
  });
  return {
    address: canonicalIpv6(bytes),
    family: "IPv6",
    port: address.val.port,
  };
}

export function finishPending(operation: () => void, socket: WasiTcpSocket): void {
  for (;;) {
    try {
      operation();
      return;
    } catch (error) {
      if (errorCode(error) !== "would-block") {
        throw error;
      }
      const pollable = socket.subscribe();
      try {
        pollable.block();
      } finally {
        dispose(pollable);
      }
    }
  }
}

function nextAddress(stream: WasiResolveAddressStream): WasiIpAddress | undefined {
  for (;;) {
    try {
      return stream.resolveNextAddress();
    } catch (error) {
      if (errorCode(error) !== "would-block") {
        throw error;
      }
      const pollable = stream.subscribe();
      try {
        pollable.block();
      } finally {
        dispose(pollable);
      }
    }
  }
}

function addressText(address: WasiIpAddress): string {
  if (address.tag === "ipv4") {
    return address.val.join(".");
  }
  const bytes = new Uint8Array(16);
  address.val.forEach((part, index) => {
    bytes[index * 2] = part >>> 8;
    bytes[index * 2 + 1] = part & 0xff;
  });
  return canonicalIpv6(bytes);
}

function remoteAddress(address: WasiIpAddress, port: number): WasiIpSocketAddress {
  return address.tag === "ipv4"
    ? { tag: "ipv4", val: { address: address.val, port } }
    : {
        tag: "ipv6",
        val: { address: address.val, port, flowInfo: 0, scopeId: 0 },
      };
}

function literalAddress(hostname: string): WasiIpAddress | undefined {
  const value = isIP(hostname);
  const socketAddress = value === 0 ? undefined : ipSocketAddress(hostname, 0);
  return socketAddress?.tag === "ipv4"
    ? { tag: "ipv4", val: socketAddress.val.address }
    : socketAddress?.tag === "ipv6"
      ? { tag: "ipv6", val: socketAddress.val.address }
      : undefined;
}

/** Resolve and connect a TCP socket, trying WASI-provided addresses in order. */
export function connect(
  provider: WasiSocketsProvider,
  hostname: string,
  port: number,
  options: TcpConnectOptions = {},
): ConnectedTcpSocket {
  const network = options.network ?? provider.instanceNetwork.instanceNetwork();
  const ownsNetwork = options.network === undefined;
  const literal = literalAddress(hostname);
  let addresses: WasiResolveAddressStream | undefined;
  if (!literal) {
    try {
      addresses = provider.ipNameLookup.resolveAddresses(network, hostname);
    } catch (error) {
      if (ownsNetwork) {
        dispose(network);
      }
      if (options.socket) {
        dispose(options.socket);
      }
      throw socketError(error, "getaddrinfo", hostname);
    }
  }
  const attemptedAddresses: string[] = [];
  let literalConsumed = false;
  let connected = false;
  try {
    let lastError: unknown;
    for (;;) {
      let address: WasiIpAddress | undefined;
      try {
        address = literal && !literalConsumed ? literal : addresses && nextAddress(addresses);
        literalConsumed = true;
      } catch (error) {
        throw socketError(error, "getaddrinfo", hostname);
      }
      if (!address) {
        throw socketError(lastError ?? "name-unresolvable", "connect", hostname, undefined, port);
      }
      const family = address.tag === "ipv4" ? 4 : 6;
      if (
        (options.family && options.family !== family) ||
        options.allowAddress?.(addressText(address), family) === false
      ) {
        continue;
      }
      const text = addressText(address);
      if (!literal) {
        options.onLookup?.(text, family, hostname);
      }
      options.onAttempt?.(text, port, family);
      attemptedAddresses.push(family === 6 ? `[${text}]:${port}` : `${text}:${port}`);
      let socket: WasiTcpSocket | undefined;
      try {
        socket = options.socket ?? provider.tcpCreateSocket.createTcpSocket(address.tag);
        if (options.localAddress !== undefined || options.localPort !== undefined) {
          if (!socket.startBind || !socket.finishBind) {
            throw unsupportedNodeApi(
              "net.Socket local bind",
              "the supplied wasi:sockets provider does not expose TCP bind operations",
            );
          }
          const local = localAddress(
            options.localAddress ?? (address.tag === "ipv4" ? "0.0.0.0" : "::"),
            options.localPort ?? 0,
            "net.Socket localAddress",
          );
          socket.startBind(network, local);
          finishPending(() => socket.finishBind!(), socket);
        }
        socket.startConnect(network, remoteAddress(address, port));
        for (;;) {
          try {
            const [input, output] = socket.finishConnect();
            const result: ConnectedTcpSocket = {
              socket,
              input,
              output,
              localAddress: socket.localAddress && nodeAddress(socket.localAddress()),
              remoteAddress: socket.remoteAddress
                ? nodeAddress(socket.remoteAddress())
                : { address: text, family: family === 4 ? "IPv4" : "IPv6", port },
              attemptedAddresses,
            };
            connected = true;
            return result;
          } catch (error) {
            if (errorCode(error) !== "would-block") {
              throw error;
            }
            const pollable = socket.subscribe();
            try {
              pollable.block();
            } finally {
              dispose(pollable);
            }
          }
        }
      } catch (error) {
        lastError = error;
        if (options.socket) {
          throw error;
        }
        dispose(socket);
      }
    }
  } finally {
    dispose(addresses);
    if (ownsNetwork) {
      dispose(network);
    }
    if (options.socket && !connected) {
      dispose(options.socket);
    }
  }
}

export interface BoundTcpSocket {
  socket: WasiTcpSocket;
  network: WasiNetwork;
  address: NodeTcpAddress;
}

/** Bind a TCP resource without choosing whether it will listen or connect. */
export function bind(
  provider: WasiSocketsProvider,
  host: string,
  port: number,
  backlog?: number,
  api = "net.Server.listen",
): BoundTcpSocket {
  const local = localAddress(host, port, `${api} host`);
  const network = provider.instanceNetwork.instanceNetwork();
  const socket = provider.tcpCreateSocket.createTcpSocket(local.tag);
  if (!socket.startBind || !socket.finishBind || !socket.localAddress) {
    dispose(socket);
    dispose(network);
    throw unsupportedNodeApi(
      api,
      "the supplied wasi:sockets provider does not expose TCP bind operations",
    );
  }
  try {
    if (backlog !== undefined) {
      socket.setListenBacklogSize?.(wasiU64(provider, backlog));
    }
    socket.startBind(network, local);
    finishPending(() => socket.finishBind!(), socket);
    return { socket, network, address: nodeAddress(socket.localAddress()) };
  } catch (error) {
    dispose(socket);
    dispose(network);
    throw socketError(error, "listen", undefined, host, port);
  }
}

export function listen(socket: WasiTcpSocket): void {
  if (!socket.startListen || !socket.finishListen || !socket.accept) {
    throw unsupportedNodeApi(
      "net.Server.listen",
      "the supplied wasi:sockets provider does not expose TCP server operations",
    );
  }
  socket.startListen();
  finishPending(() => socket.finishListen!(), socket);
}

export function accept(socket: WasiTcpSocket): [WasiTcpSocket, WasiInputStream, WasiOutputStream] {
  if (!socket.accept) {
    throw unsupportedNodeApi(
      "net.Server",
      "the supplied wasi:sockets provider does not expose TCP accept operations",
    );
  }
  for (;;) {
    try {
      return socket.accept();
    } catch (error) {
      if (errorCode(error) !== "would-block") {
        throw error;
      }
      const pollable = socket.subscribe();
      try {
        pollable.block();
      } finally {
        dispose(pollable);
      }
    }
  }
}

export function closeTransport(
  socket: WasiTcpSocket,
  input?: WasiInputStream,
  output?: WasiOutputStream,
): void {
  try {
    socket.shutdown("both");
  } catch {
    // The peer may already have closed the connection.
  }
  dispose(output);
  dispose(input);
  dispose(socket);
}
