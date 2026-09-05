import {
  handshake,
  validateTlsOptions,
  type WasiTlsProvider,
  type WasiTlsConnection,
} from "./tls.js";
import { concatBytes } from "../../body.js";
import { fromImplementationError, invalidArgValue, unsupported } from "../../errors.js";
import {
  accept as acceptTcp,
  bind,
  connect,
  dispose,
  errorCode,
  listen as listenTcp,
  nodeAddress,
  socketError,
  wasiU64,
  type WasiInputStream,
  type WasiNetwork,
  type WasiOutputStream,
  type WasiSocketsProvider as WasiTcpProvider,
  type WasiTcpSocket,
} from "../../../internal/wasi-sockets.js";
import {
  parseHttp1Request,
  parseHttp1Response,
  serializeHttp1Request,
  serializeHttp1Response,
} from "../../http1.js";
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
} from "../../types.js";

// Preserve the implementation module's existing transport exports while their ownership moves
// to the shared layer used by node:net and node:http2.
export {
  connect,
  dispose,
  errorCode,
  finishPending,
  localAddress,
  nodeAddress,
  socketError,
  wasiU64,
} from "../../../internal/wasi-sockets.js";
export type {
  WasiInputStream,
  WasiIpAddress,
  WasiIpSocketAddress,
  WasiNetwork,
  WasiOutputStream,
  WasiPollable,
  WasiResolveAddressStream,
  WasiTcpSocket,
} from "../../../internal/wasi-sockets.js";

export interface WasiSocketsProvider extends WasiTcpProvider {
  tls?: WasiTlsProvider;
}

export function authority(value: string, scheme = "http"): { hostname: string; port: number } {
  try {
    const url = new URL(`${scheme}://${value}`);
    return {
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      port: Number(url.port || (scheme === "https" ? 443 : 80)),
    };
  } catch {
    throw invalidArgValue("authority", value);
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
    const bound = bind(
      this.#provider,
      options.host ?? "::",
      options.port ?? 0,
      options.backlog,
      "http.Server.listen",
    );
    try {
      listenTcp(bound.socket);
      this.#network = bound.network;
      this.#socket = bound.socket;
      this.#address = bound.address;
      this.#listening = true;
      this.#scheduleAccept();
      return this.#address;
    } catch (error) {
      dispose(bound.socket);
      dispose(bound.network);
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
      [connection, input, output] = acceptTcp(listener);
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
          "wasi:tls@0.2.0-draft exposes only client TLS handshakes and has no server handshake or certificate configuration",
        );
      }
      return new WasiSocketsHttpServer(provider, options, handler, onError);
    },

    request(request) {
      if (request.scheme === "https") {
        validateTlsOptions(request.tls);
        if (!provider.tls?.isAvailable()) {
          throw fromImplementationError({
            name: "Error",
            code: "ERR_JCO_TLS_ADAPTER_REQUIRED",
            message:
              "https: requests with the wasi-sockets implementation require the additional wasi:tls/types@0.2.0-draft TLS capability",
          });
        }
      } else if (request.scheme !== "http") {
        unsupported(`${request.scheme}: requests`, "only HTTP and HTTPS are supported");
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
      const { hostname, port } = authority(request.authority, request.scheme);
      const tcp = connect(provider, hostname, port);
      const socket = tcp.socket;
      let input: WasiInputStream | undefined = tcp.input;
      let output: WasiOutputStream | undefined = tcp.output;
      let tlsConnection: WasiTlsConnection | undefined;
      try {
        if (request.scheme === "https") {
          input = undefined;
          output = undefined;
          [tlsConnection, input, output] = handshake(
            provider.tls!,
            request.tls?.servername ?? hostname,
            tcp.input,
            tcp.output,
          );
        }
        const bytes = serializeHttp1Request(request);
        // wasi:io blocking-write-and-flush accepts at most 4096 bytes per call.
        for (let offset = 0; offset < bytes.length; offset += 4096) {
          output!.blockingWriteAndFlush(bytes.subarray(offset, offset + 4096));
        }
        return readResponse(provider, input!, request);
      } catch (error) {
        if (error instanceof Error && "code" in error) {
          throw error;
        }
        throw socketError(error, "request", hostname);
      } finally {
        try {
          tlsConnection?.closeOutput();
        } catch {
          /* The peer may have closed. */
        }
        dispose(output);
        dispose(input);
        dispose(tlsConnection);
        try {
          socket.shutdown("both");
        } catch {
          // The peer may already have closed the connection.
        }
        dispose(socket);
      }
    },
  };
}
