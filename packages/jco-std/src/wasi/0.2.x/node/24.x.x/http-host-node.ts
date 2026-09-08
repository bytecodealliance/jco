/**
 * Opt-in Node.js HTTP provider.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/http.js and
 * lib/_http_client.js (MIT license). The Node stream lifecycle is adapted to
 * one buffered, typed WIT request/response exchange.
 */
import * as nodeHttp from "node:http";
import {
  CallbackResource,
  createCallbackQueue,
  retireCallbacks,
} from "./internal/callback-resource.js";

import {
  fieldsToRawHeaders,
  rawHeadersToFields,
  serializeNodeError,
} from "./internal/http-host.js";
import type {
  DirectHttpListenOptions,
  DirectHttpRequest,
  DirectHttpRequestListener,
  DirectHttpCallbacks,
  DirectHttpIncomingRequest,
  DirectHttpOutgoingResponse,
  DirectHttpResponse,
  DirectHttpResult,
  DirectHttpServerAddress,
  DirectHttpServerConstructor,
  DirectHttpServerOptions,
} from "./http/types.js";
type AsyncResult<T> = Promise<DirectHttpResult<T>>;
type Timer = ReturnType<typeof setTimeout>;

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
        headers: fieldsToRawHeaders(options.headers),
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
        response.once("error", (error) => finish({ tag: "err", val: serializeNodeError(error) }));
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
              headers: rawHeadersToFields(response.rawHeaders),
              body,
            },
          });
        });
      },
    );
    request.once("error", (error) => finish({ tag: "err", val: serializeNodeError(error) }));
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
  readonly #pending = new Set<Promise<void>>();
  readonly #server: nodeHttp.Server;

  constructor(
    options: DirectHttpServerOptions,
    handle: (request: DirectHttpIncomingRequest) => Promise<DirectHttpOutgoingResponse>,
  ) {
    this.#server = nodeHttp.createServer(nodeServerOptions(options), (request, response) => {
      const pending = this.#handle(handle, request, response);
      this.#pending.add(pending);
      const complete = () => {
        this.#pending.delete(pending);
      };
      void pending.then(complete, complete);
    });
  }

  async #handle(
    handle: (request: DirectHttpIncomingRequest) => Promise<DirectHttpOutgoingResponse>,
    request: nodeHttp.IncomingMessage,
    response: nodeHttp.ServerResponse,
  ): Promise<void> {
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
      const result = await handle({
        method: request.method ?? "GET",
        url: request.url ?? "/",
        httpVersion: request.httpVersion,
        headers: rawHeadersToFields(request.rawHeaders),
        body,
        remoteAddress: request.socket.remoteAddress,
        remotePort: request.socket.remotePort,
      });
      response.writeHead(
        result.statusCode,
        result.statusMessage,
        fieldsToRawHeaders(result.headers),
      );
      response.end(result.body);
    } catch (caught) {
      const value =
        typeof caught === "object" && caught !== null && "payload" in caught
          ? caught.payload
          : caught;
      const serialized = serializeNodeError(value);
      const error =
        value instanceof Error ? value : Object.assign(new Error(serialized.message), serialized);
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.end(error.message);
      } else {
        response.destroy(error);
      }
    }
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
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  async close(): AsyncResult<boolean> {
    const wasListening = this.#server.listening;
    try {
      if (wasListening) {
        await new Promise<void>((resolve, reject) => {
          this.#server.close((error) => (error ? reject(error) : resolve()));
        });
      }
      await Promise.all(this.#pending);
      return { tag: "ok", val: wasListening };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  closeAllConnections(): DirectHttpResult<undefined> {
    try {
      this.#server.closeAllConnections();
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  closeIdleConnections(): DirectHttpResult<undefined> {
    try {
      this.#server.closeIdleConnections();
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  async getConnections(): AsyncResult<bigint> {
    try {
      const count = await new Promise<number>((resolve, reject) => {
        this.#server.getConnections((error, value) => (error ? reject(error) : resolve(value)));
      });
      return { tag: "ok", val: BigInt(count) };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
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
    this.#server.closeAllConnections();
  }
}

/** Bind one host provider to one component's exported callback resources. */
export function createHttpHost(callbacks: () => DirectHttpCallbacks) {
  const enqueue = createCallbackQueue();
  class Server extends NodeHttpServer {
    readonly #listener: CallbackResource<DirectHttpRequestListener>;

    constructor(options: DirectHttpServerOptions, listener: number) {
      const resource = new CallbackResource(
        () => callbacks().takeRequestListener(listener),
        "ERR_JCO_HTTP_CALLBACK_NOT_FOUND",
      );
      super(options, (incoming) => enqueue(async () => (await resource.get()).handle(incoming)));
      this.#listener = resource;
    }

    override async close(): AsyncResult<boolean> {
      const result = await super.close();
      if (result.tag === "ok") {
        retireCallbacks(enqueue, this.#listener);
      }
      return result;
    }

    override [Symbol.dispose](): void {
      super[Symbol.dispose]();
      // A resource destructor must not synchronously re-enter the guest.
      void this.close();
    }
  }
  return { request, Server: Server as unknown as DirectHttpServerConstructor };
}

// Client-only mappings may still import this module directly. Servers require
// an instance-bound provider so callback IDs cannot cross component instances.
export const Server = class {
  constructor() {
    throw new Error("HTTP servers require createHttpHost(() => instance.httpCallbacks)");
  }
} as unknown as DirectHttpServerConstructor;

export default { request, Server, createHttpHost };
