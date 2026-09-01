import { concatBytes } from "../body.js";
import { fromTransportError, invalidArgValue, unsupported } from "../errors.js";
import { parseHttp1Response, serializeHttp1Request } from "../http1.js";
import type { HttpTransport, HttpTransportRequest, HttpTransportResponse } from "../types.js";

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
  startConnect(network: unknown, remoteAddress: WasiIpSocketAddress): void;
  finishConnect(): [WasiInputStream, WasiOutputStream];
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
}

function dispose(resource: { [Symbol.dispose]?(): void } | undefined): void {
  resource?.[Symbol.dispose]?.();
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null && "tag" in error) {
    const tag = (error as { tag?: unknown }).tag;
    return typeof tag === "string" ? tag : undefined;
  }
  return undefined;
}

function socketError(error: unknown, syscall: string, hostname?: string): Error {
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
  return fromTransportError({
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

function authority(value: string): { hostname: string; port: number } {
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

function connect(
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
  input: WasiInputStream,
  request: HttpTransportRequest,
): HttpTransportResponse {
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
      chunks.push(input.blockingRead(65_536n));
    } catch (error) {
      if (errorCode(error) !== "closed") {
        throw socketError(error, "read");
      }
      closed = true;
    }
  }
}

export function createWasiSocketsHttpTransport(provider: WasiSocketsProvider): HttpTransport {
  return {
    request(request) {
      if (request.scheme !== "http") {
        throw invalidArgValue("protocol", `${request.scheme}:`);
      }
      if (
        request.connectTimeoutMs !== undefined ||
        request.firstByteTimeoutMs !== undefined ||
        request.betweenBytesTimeoutMs !== undefined
      ) {
        unsupported(
          "http.ClientRequest.setTimeout with the wasi-sockets transport",
          "deadline polling across Preview 2 socket and clock resources is not implemented",
        );
      }
      const { hostname, port } = authority(request.authority);
      const { socket, input, output } = connect(provider, hostname, port);
      try {
        output.blockingWriteAndFlush(serializeHttp1Request(request));
        return readResponse(input, request);
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
