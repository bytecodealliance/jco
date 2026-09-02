/**
 * Opt-in Node.js HTTP provider.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/http.js and
 * lib/_http_client.js (MIT license). The Node stream lifecycle is adapted to
 * one buffered, typed WIT request/response exchange.
 */
import * as nodeHttp from "node:http";

import type {
  DirectHttpError,
  DirectHttpListenOptions,
  DirectHttpRequest,
  DirectHttpRequestListener,
  DirectHttpResponse,
  DirectHttpResult,
  DirectHttpServerAddress,
  DirectHttpServerConstructor,
  DirectHttpServerOptions,
} from "./http/types.js";

type AsyncResult<T> = Promise<DirectHttpResult<T>>;
type Timer = ReturnType<typeof setTimeout>;

function serializeError(error: unknown): DirectHttpError {
  const value =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const errno =
    typeof value.errno === "number"
      ? { tag: "number" as const, val: BigInt(value.errno) }
      : typeof value.errno === "string"
        ? { tag: "symbolic" as const, val: value.errno }
        : undefined;
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    message: typeof value.message === "string" ? value.message : String(error),
    code: typeof value.code === "string" ? value.code : undefined,
    errno,
    syscall: typeof value.syscall === "string" ? value.syscall : undefined,
    hostname: typeof value.hostname === "string" ? value.hostname : undefined,
    address: typeof value.address === "string" ? value.address : undefined,
    port: typeof value.port === "number" ? value.port : undefined,
  };
}

function headers(value: readonly { name: string; value: Uint8Array }[]): string[] {
  const decoder = new TextDecoder("latin1");
  return value.flatMap(({ name, value: bytes }) => [name, decoder.decode(bytes)]);
}

function responseHeaders(rawHeaders: string[]): Array<{ name: string; value: Uint8Array }> {
  const result: Array<{ name: string; value: Uint8Array }> = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    result.push({
      name: rawHeaders[index],
      value: Uint8Array.from(rawHeaders[index + 1], (character) => character.charCodeAt(0)),
    });
  }
  return result;
}

function timeoutError(syscall: string): Error & { code: string; syscall: string } {
  return Object.assign(new Error(`HTTP ${syscall} timed out`), {
    code: "ETIMEDOUT",
    syscall,
  });
}

export async function request(options: DirectHttpRequest): AsyncResult<DirectHttpResponse> {
  return new Promise((resolve) => {
    let connectTimer: Timer | undefined;
    let firstByteTimer: Timer | undefined;
    const finish = (result: DirectHttpResult<DirectHttpResponse>): void => {
      clearTimeout(connectTimer);
      clearTimeout(firstByteTimer);
      resolve(result);
    };
    const request = nodeHttp.request(
      new URL(`${options.scheme}://${options.authority}${options.pathWithQuery}`),
      {
        method: options.method,
        headers: headers(options.headers),
        joinDuplicateHeaders: true,
      },
      (response) => {
        clearTimeout(connectTimer);
        clearTimeout(firstByteTimer);
        const chunks: Uint8Array[] = [];
        if (options.betweenBytesTimeoutMs !== undefined) {
          response.setTimeout(options.betweenBytesTimeoutMs, () => {
            response.destroy(timeoutError("read"));
          });
        }
        response.on("data", (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk)));
        response.once("error", (error) => finish({ tag: "err", val: serializeError(error) }));
        response.once("end", () => {
          const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
          const body = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
          }
          finish({
            tag: "ok",
            val: {
              statusCode: response.statusCode ?? 0,
              statusMessage: response.statusMessage ?? "",
              httpVersion: response.httpVersion,
              headers: responseHeaders(response.rawHeaders),
              body,
            },
          });
        });
      },
    );
    request.once("error", (error) => finish({ tag: "err", val: serializeError(error) }));
    if (options.connectTimeoutMs !== undefined) {
      request.once("socket", (socket) => {
        if (!socket.connecting) {
          return;
        }
        connectTimer = setTimeout(
          () => request.destroy(timeoutError("connect")),
          options.connectTimeoutMs,
        );
        socket.once("connect", () => clearTimeout(connectTimer));
      });
    }
    request.end(options.body);
    if (options.firstByteTimeoutMs !== undefined) {
      firstByteTimer = setTimeout(
        () => request.destroy(timeoutError("request")),
        options.firstByteTimeoutMs,
      );
    }
  });
}

function nodeServerOptions(options: DirectHttpServerOptions): nodeHttp.ServerOptions {
  return {
    requestTimeout: options.requestTimeout,
    headersTimeout: options.headersTimeout,
    keepAliveTimeout: options.keepAliveTimeout,
    keepAliveTimeoutBuffer: options.keepAliveTimeoutBuffer,
    connectionsCheckingInterval: options.connectionsCheckingInterval,
    maxHeaderSize: options.maxHeaderSize,
    joinDuplicateHeaders: options.joinDuplicateHeaders,
    noDelay: options.noDelay,
    requireHostHeader: options.requireHostHeader,
    keepAlive: options.keepAlive,
    keepAliveInitialDelay: options.keepAliveInitialDelay,
    rejectNonStandardBodyWrites: options.rejectNonStandardBodyWrites,
    optimizeEmptyRequests: options.optimizeEmptyRequests,
  };
}

function serverAddress(
  address: Exclude<ReturnType<nodeHttp.Server["address"]>, null>,
): DirectHttpServerAddress {
  return typeof address === "string"
    ? { tag: "pipe", val: address }
    : {
        tag: "tcp",
        val: { address: address.address, family: address.family, port: address.port },
      };
}

class NodeHttpServer {
  readonly #listener: DirectHttpRequestListener;
  readonly #server: nodeHttp.Server;

  constructor(options: DirectHttpServerOptions, listener: DirectHttpRequestListener) {
    this.#listener = listener;
    this.#server = nodeHttp.createServer(nodeServerOptions(options), async (request, response) => {
      try {
        const chunks: Uint8Array[] = [];
        for await (const chunk of request) {
          chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
        }
        const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        const result = await listener.handle({
          method: request.method ?? "GET",
          url: request.url ?? "/",
          httpVersion: request.httpVersion,
          headers: responseHeaders(request.rawHeaders),
          body,
          remoteAddress: request.socket.remoteAddress,
          remotePort: request.socket.remotePort,
        });
        if (result.tag === "err") {
          throw Object.assign(new Error(result.val.message), result.val);
        }
        response.writeHead(
          result.val.statusCode,
          result.val.statusMessage,
          headers(result.val.headers),
        );
        response.end(result.val.body);
      } catch (error) {
        if (!response.headersSent) {
          response.statusCode = 500;
          response.setHeader("content-type", "text/plain; charset=utf-8");
          response.end(error instanceof Error ? error.message : String(error));
        } else {
          response.destroy(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
  }

  async listen(options: DirectHttpListenOptions): AsyncResult<DirectHttpServerAddress> {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => reject(error);
        this.#server.once("error", onError);
        const done = (): void => {
          this.#server.off("error", onError);
          resolve();
        };
        if (options.path !== undefined) {
          this.#server.listen(
            {
              path: options.path,
              backlog: options.backlog,
              exclusive: options.exclusive,
            },
            done,
          );
        } else {
          this.#server.listen(
            {
              port: options.port ?? 0,
              host: options.host,
              backlog: options.backlog,
              exclusive: options.exclusive,
              ipv6Only: options.ipv6Only,
              reusePort: options.reusePort,
            },
            done,
          );
        }
      });
      const address = this.#server.address();
      if (address === null) {
        throw new Error("HTTP server started without a listening address");
      }
      return { tag: "ok", val: serverAddress(address) };
    } catch (error) {
      return { tag: "err", val: serializeError(error) };
    }
  }

  async close(): AsyncResult<boolean> {
    const wasListening = this.#server.listening;
    if (!wasListening) {
      return { tag: "ok", val: false };
    }
    try {
      await new Promise<void>((resolve, reject) => {
        this.#server.close((error) => (error ? reject(error) : resolve()));
      });
      return { tag: "ok", val: true };
    } catch (error) {
      return { tag: "err", val: serializeError(error) };
    }
  }

  closeAllConnections(): DirectHttpResult<undefined> {
    try {
      this.#server.closeAllConnections();
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: serializeError(error) };
    }
  }

  closeIdleConnections(): DirectHttpResult<undefined> {
    try {
      this.#server.closeIdleConnections();
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: serializeError(error) };
    }
  }

  async getConnections(): AsyncResult<bigint> {
    try {
      const count = await new Promise<number>((resolve, reject) => {
        this.#server.getConnections((error, value) => (error ? reject(error) : resolve(value)));
      });
      return { tag: "ok", val: BigInt(count) };
    } catch (error) {
      return { tag: "err", val: serializeError(error) };
    }
  }

  address(): DirectHttpServerAddress | undefined {
    const address = this.#server.address();
    return address === null ? undefined : serverAddress(address);
  }

  ref(): void {
    this.#server.ref();
  }

  unref(): void {
    this.#server.unref();
  }

  [Symbol.dispose](): void {
    this.#server.close();
    this.#listener[Symbol.dispose]();
  }
}

export const Server = NodeHttpServer as unknown as DirectHttpServerConstructor;

export default { request, Server };
