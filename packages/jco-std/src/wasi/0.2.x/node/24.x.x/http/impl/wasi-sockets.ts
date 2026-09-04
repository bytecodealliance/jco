import { concatBytes } from "../body.js";
import { fromImplementationError, invalidArgValue, unsupported } from "../errors.js";
import {
  parseHttp1Request,
  parseHttp1Response,
  serializeHttp1Request,
  serializeHttp1Response,
} from "../http1.js";
import type {
  HttpImplementation,
  HttpImplementationRequest,
  HttpImplementationResponse,
  HttpIncomingRequestData,
  HttpListenOptions,
  HttpRequestHandler,
  HttpServerAddress,
  HttpServerImplementation,
  HttpServerOptions,
} from "../types.js";

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
  startBind?(network: unknown, localAddress: WasiIpSocketAddress): void;
  finishBind?(): void;
  startConnect(network: unknown, remoteAddress: WasiIpSocketAddress): void;
  finishConnect(): [WasiInputStream, WasiOutputStream];
  startListen?(): void;
  finishListen?(): void;
  accept?(): [WasiTcpSocket, WasiInputStream, WasiOutputStream];
  localAddress?(): WasiIpSocketAddress;
  remoteAddress?(): WasiIpSocketAddress;
  setListenBacklogSize?(value: bigint): void;
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

export function wasiU64(provider: WasiSocketsProvider, value: number): bigint {
  return provider.u64?.(value) ?? BigInt(value);
}

export function dispose(resource: { [Symbol.dispose]?(): void } | undefined): void {
  resource?.[Symbol.dispose]?.();
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null && "tag" in error) {
    const tag = (error as { tag?: unknown }).tag;
    return typeof tag === "string" ? tag : undefined;
  }
  return undefined;
}

export function socketError(error: unknown, syscall: string, hostname?: string): Error {
  const code = errorCode(error) ?? "unknown";
  const nodeCodes: Record<string, string> = {
    "access-denied": "EACCES",
    "address-in-use": "EADDRINUSE",
    "connection-aborted": "ECONNABORTED",
    "connection-refused": "ECONNREFUSED",
    "connection-reset": "ECONNRESET",
    "name-unresolvable": "ENOTFOUND",
    "remote-unreachable": "EHOSTUNREACH",
    timeout: "ETIMEDOUT",
  };
  return fromImplementationError({
    name: "Error",
    message: `${syscall} ${nodeCodes[code] ?? "ERR_JCO_WASI_SOCKET"}${hostname ? ` ${hostname}` : ""}`,
    code: nodeCodes[code] ?? "ERR_JCO_WASI_SOCKET",
    syscall,
    hostname,
  });
}

function remoteAddress(address: WasiIpAddress, port: number): WasiIpSocketAddress {
  return address.tag === "ipv4"
    ? { tag: "ipv4", val: { address: address.val, port } }
    : {
        tag: "ipv6",
        val: { address: address.val, port, flowInfo: 0, scopeId: 0 },
      };
}

function parseIpv4(value: string): [number, number, number, number] | undefined {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return undefined;
  }
  const numbers = parts.map(Number);
  return numbers.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? (numbers as [number, number, number, number])
    : undefined;
}

export function localAddress(host: string, port: number): WasiIpSocketAddress {
  const normalized = host === "localhost" ? "127.0.0.1" : host;
  const ipv4 = parseIpv4(normalized);
  if (ipv4) {
    return { tag: "ipv4", val: { address: ipv4, port } };
  }
  if (normalized === "::" || normalized === "::1") {
    return {
      tag: "ipv6",
      val: {
        address: normalized === "::" ? [0, 0, 0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0, 1],
        port,
        flowInfo: 0,
        scopeId: 0,
      },
    };
  }
  return unsupported(
    "http.Server.listen host",
    "the wasi-sockets implementation currently accepts localhost and IPv4, ::, or ::1 literals",
  );
}

export function nodeAddress(address: WasiIpSocketAddress): Exclude<HttpServerAddress, string> {
  if (address.tag === "ipv4") {
    return {
      address: address.val.address.join("."),
      family: "IPv4",
      port: address.val.port,
    };
  }
  const addressText = address.val.address.every((part) => part === 0)
    ? "::"
    : address.val.address.join(":");
  return { address: addressText, family: "IPv6", port: address.val.port };
}

export function authority(value: string): { hostname: string; port: number } {
  try {
    const url = new URL(`http://${value}`);
    return { hostname: url.hostname.replace(/^\[|\]$/g, ""), port: Number(url.port || 80) };
  } catch {
    throw invalidArgValue("authority", value);
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

export function connect(
  provider: WasiSocketsProvider,
  hostname: string,
  port: number,
): { socket: WasiTcpSocket; input: WasiInputStream; output: WasiOutputStream } {
  const network = provider.instanceNetwork.instanceNetwork();
  let addresses: WasiResolveAddressStream;
  try {
    addresses = provider.ipNameLookup.resolveAddresses(network, hostname);
  } catch (error) {
    throw socketError(error, "getaddrinfo", hostname);
  }
  try {
    let lastError: unknown;
    for (;;) {
      let address: WasiIpAddress | undefined;
      try {
        address = nextAddress(addresses);
      } catch (error) {
        throw socketError(error, "getaddrinfo", hostname);
      }
      if (!address) {
        throw socketError(lastError ?? "name-unresolvable", "connect", hostname);
      }
      const socket = provider.tcpCreateSocket.createTcpSocket(address.tag);
      try {
        socket.startConnect(network, remoteAddress(address, port));
        for (;;) {
          try {
            const [input, output] = socket.finishConnect();
            return { socket, input, output };
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
        dispose(socket);
      }
    }
  } finally {
    dispose(addresses);
    dispose(network);
  }
}

function readResponse(
  provider: WasiSocketsProvider,
  input: WasiInputStream,
  request: HttpImplementationRequest,
): HttpImplementationResponse {
  const chunks: Uint8Array[] = [];
  let closed = false;
  for (;;) {
    const bytes = concatBytes(chunks);
    const response = parseHttp1Response(bytes, request.method, closed);
    if (response) {
      return response;
    }
    if (closed) {
      throw socketError("connection-terminated", "read");
    }
    try {
      chunks.push(input.blockingRead(wasiU64(provider, 65_536)));
    } catch (error) {
      if (errorCode(error) !== "closed") {
        throw socketError(error, "read");
      }
      closed = true;
    }
  }
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

function readRequest(
  provider: WasiSocketsProvider,
  input: WasiInputStream,
): HttpIncomingRequestData {
  const chunks: Uint8Array[] = [];
  let closed = false;
  for (;;) {
    const parsed = parseHttp1Request(concatBytes(chunks), closed);
    if (parsed) {
      return parsed.request;
    }
    if (closed) {
      throw socketError("connection-terminated", "read");
    }
    try {
      chunks.push(input.blockingRead(wasiU64(provider, 65_536)));
    } catch (error) {
      if (errorCode(error) !== "closed") {
        throw error;
      }
      closed = true;
    }
  }
}

class WasiSocketsHttpServer implements HttpServerImplementation {
  readonly #provider: WasiSocketsProvider;
  readonly #handler: HttpRequestHandler;
  readonly #onError: (error: Error) => void;
  readonly #connections = new Set<WasiTcpSocket>();
  #network: WasiNetwork | undefined;
  #socket: WasiTcpSocket | undefined;
  #address: Exclude<HttpServerAddress, string> | null = null;
  #listening = false;

  constructor(
    provider: WasiSocketsProvider,
    options: HttpServerOptions,
    handler: HttpRequestHandler,
    onError: (error: Error) => void,
  ) {
    this.#provider = provider;
    this.#handler = handler;
    this.#onError = onError;
    for (const name of [
      "requestTimeout",
      "headersTimeout",
      "keepAliveTimeout",
      "keepAliveTimeoutBuffer",
      "connectionsCheckingInterval",
      "maxHeaderSize",
      "joinDuplicateHeaders",
      "noDelay",
      "requireHostHeader",
      "keepAlive",
      "keepAliveInitialDelay",
      "rejectNonStandardBodyWrites",
      "optimizeEmptyRequests",
    ] as const) {
      if (options[name] !== undefined) {
        unsupported(
          `http.Server option ${name} with the wasi-sockets implementation`,
          "the Preview 2 TCP and buffered HTTP/1.1 boundary cannot implement this option faithfully",
        );
      }
    }
  }

  listen(options: HttpListenOptions): HttpServerAddress {
    if (options.path !== undefined) {
      return unsupported(
        "http.Server.listen path",
        "wasi:sockets Preview 2 exposes IP sockets but not Unix domain sockets",
      );
    }
    if (options.exclusive !== undefined || options.ipv6Only || options.reusePort) {
      return unsupported(
        "http.Server.listen options",
        "exclusive, ipv6Only, and reusePort cannot be configured with wasi:sockets Preview 2",
      );
    }
    const address = localAddress(options.host ?? "::", options.port ?? 0);
    const network = this.#provider.instanceNetwork.instanceNetwork();
    const socket = this.#provider.tcpCreateSocket.createTcpSocket(address.tag);
    if (
      !socket.startBind ||
      !socket.finishBind ||
      !socket.startListen ||
      !socket.finishListen ||
      !socket.accept ||
      !socket.localAddress
    ) {
      dispose(socket);
      dispose(network);
      return unsupported(
        "http.Server",
        "the supplied wasi-sockets implementation does not expose TCP server operations",
      );
    }
    try {
      if (options.backlog !== undefined) {
        socket.setListenBacklogSize?.(wasiU64(this.#provider, options.backlog));
      }
      socket.startBind(network, address);
      finishPending(() => socket.finishBind!(), socket);
      socket.startListen();
      finishPending(() => socket.finishListen!(), socket);
      this.#network = network;
      this.#socket = socket;
      this.#address = nodeAddress(socket.localAddress());
      this.#listening = true;
      this.#scheduleAccept();
      return this.#address;
    } catch (error) {
      dispose(socket);
      dispose(network);
      throw socketError(error, "listen", options.host);
    }
  }

  close(): boolean {
    const wasListening = this.#listening;
    this.#listening = false;
    this.closeAllConnections();
    dispose(this.#socket);
    dispose(this.#network);
    this.#socket = undefined;
    this.#network = undefined;
    this.#address = null;
    return wasListening;
  }

  closeAllConnections(): void {
    for (const connection of this.#connections) {
      try {
        connection.shutdown("both");
      } catch {
        // The peer may already have closed the connection.
      }
      dispose(connection);
    }
    this.#connections.clear();
  }

  closeIdleConnections(): void {
    // This implementation closes every connection after one response, so no
    // persistent idle connections exist between request callbacks.
  }

  getConnections(): number {
    return this.#connections.size;
  }

  address(): HttpServerAddress | null {
    return this.#address;
  }

  ref(): void {}

  unref(): void {}

  async #accept(): Promise<void> {
    const listener = this.#socket;
    if (!this.#listening || !listener?.accept) {
      return;
    }
    let connection: WasiTcpSocket | undefined;
    let input: WasiInputStream | undefined;
    let output: WasiOutputStream | undefined;
    try {
      for (;;) {
        try {
          [connection, input, output] = listener.accept();
          break;
        } catch (error) {
          if (errorCode(error) !== "would-block") {
            throw error;
          }
          const pollable = listener.subscribe();
          try {
            pollable.block();
          } finally {
            dispose(pollable);
          }
        }
      }
      this.#connections.add(connection);
      const request = readRequest(this.#provider, input);
      if (
        request.httpVersion === "1.1" &&
        !request.headers.some(({ name }) => name.toLowerCase() === "host")
      ) {
        output.blockingWriteAndFlush(
          serializeHttp1Response({
            statusCode: 400,
            statusMessage: "Bad Request",
            headers: [],
            body: new Uint8Array(),
          }),
        );
        return;
      }
      const remote = connection.remoteAddress?.();
      if (remote) {
        const address = nodeAddress(remote);
        request.remoteAddress = address.address;
        request.remotePort = address.port;
      }
      const response = await this.#handler(request);
      output.blockingWriteAndFlush(serializeHttp1Response(response));
    } catch (error) {
      throw socketError(error, "accept");
    } finally {
      if (connection) {
        this.#connections.delete(connection);
        try {
          connection.shutdown("both");
        } catch {
          // The peer may already have closed the connection.
        }
      }
      dispose(output);
      dispose(input);
      dispose(connection);
      if (this.#listening) {
        this.#scheduleAccept();
      }
    }
  }

  #scheduleAccept(): void {
    const task = async () => {
      try {
        await this.#accept();
      } catch (error) {
        this.#onError(error instanceof Error ? error : new Error(String(error)));
      }
    };
    if (this.#provider.schedule) {
      this.#provider.schedule(task);
    } else {
      queueMicrotask(() => void task());
    }
  }
}

export function createWasiSocketsHttpImplementation(
  provider: WasiSocketsProvider,
): HttpImplementation {
  return {
    createServer(options, handler, onError) {
      if (options.tls !== undefined) {
        unsupported(
          "https.Server with the wasi-sockets implementation",
          "wasi:sockets carries no TLS stack, so a server can only speak plaintext HTTP/1.1",
        );
      }
      return new WasiSocketsHttpServer(provider, options, handler, onError);
    },

    request(request) {
      if (request.scheme !== "http") {
        unsupported(
          `${request.scheme}: requests with the wasi-sockets implementation`,
          "wasi:sockets carries no TLS stack, so a client can only speak plaintext HTTP/1.1",
        );
      }
      if (
        request.connectTimeoutMs !== undefined ||
        request.firstByteTimeoutMs !== undefined ||
        request.betweenBytesTimeoutMs !== undefined
      ) {
        unsupported(
          "http.ClientRequest.setTimeout with the wasi-sockets implementation",
          "deadline polling across Preview 2 socket and clock resources is not implemented",
        );
      }
      const { hostname, port } = authority(request.authority);
      const { socket, input, output } = connect(provider, hostname, port);
      try {
        output.blockingWriteAndFlush(serializeHttp1Request(request));
        return readResponse(provider, input, request);
      } catch (error) {
        if (error instanceof Error && "code" in error) {
          throw error;
        }
        throw socketError(error, "request", hostname);
      } finally {
        try {
          socket.shutdown("both");
        } catch {
          // The peer may already have closed the connection.
        }
        dispose(output);
        dispose(input);
        dispose(socket);
      }
    },
  };
}
