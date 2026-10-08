import type { TlsConfigurationProvider } from "./tls/host-types.js";
/**
 * Opt-in Node.js HTTP provider.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/http.js, lib/https.js, and
 * lib/_http_client.js (MIT license). Typed resources carry incremental response bodies and
 * upgraded connections; ordinary request bodies and client responses are buffered. Requests with the `https`
 * scheme and servers carrying a `tls` record go through real `node:https`, so
 * TLS is terminated by the host's own stack.
 */
import * as nodeHttp from "node:http";
import type { Socket } from "node:net";
import {
  CallbackResource,
  createCallbackQueue,
  retireCallbacks,
} from "./internal/callback-resource.js";
import * as nodeHttps from "node:https";
import type * as nodeTls from "node:tls";

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
  DirectTlsOptions,
  HttpConnection,
  HttpSocketEvent,
} from "./http/types.js";
type AsyncResult<T> = Promise<DirectHttpResult<T>>;
type Timer = ReturnType<typeof setTimeout>;
let nextConnection = 1;

export class Connection implements HttpConnection {
  readonly #id = nextConnection++;
  constructor(
    readonly socket: Socket,
    readonly owned = false,
  ) {}
  id(): number {
    return this.#id;
  }
  write(data: Uint8Array) {
    try {
      return { tag: "ok" as const, val: this.socket.write(Buffer.from(data)) };
    } catch (error) {
      return { tag: "err" as const, val: serializeNodeError(error) };
    }
  }
  end(): void {
    this.socket.end();
  }
  destroy(): void {
    this.socket.destroy();
  }
  pause(): void {
    this.socket.pause();
  }
  resume(): void {
    this.socket.resume();
  }
  setTimeout(milliseconds: number): void {
    this.socket.setTimeout(milliseconds);
  }
  setNoDelay(value: boolean): void {
    this.socket.setNoDelay(value);
  }
  setKeepAlive(value: boolean, delay: number): void {
    this.socket.setKeepAlive(value, delay);
  }
  ref(): void {
    this.socket.ref();
  }
  unref(): void {
    this.socket.unref();
  }
  [Symbol.dispose](): void {
    if (this.owned) {
      this.socket.destroy();
    }
  }
}

export class ClientRequest implements Disposable {
  readonly #request: nodeHttp.ClientRequest;
  #connection: Connection | undefined;
  #response: DirectHttpResponse | undefined;
  #error: ReturnType<typeof serializeNodeError> | undefined;
  constructor(options: DirectHttpRequest) {
    const headers: Record<string, string | string[]> = {};
    for (const field of options.headers) {
      const value = Buffer.from(field.value).toString("latin1");
      const previous = headers[field.name];
      headers[field.name] =
        previous === undefined
          ? value
          : [...(Array.isArray(previous) ? previous : [previous]), value];
    }
    this.#request = nodeHttp.request(
      new URL(`${options.scheme}://${options.authority}${options.pathWithQuery}`),
      {
        method: options.method,
        headers,
        joinDuplicateHeaders: true,
      },
    );
    this.#request.on("socket", (socket) => {
      this.#connection = new Connection(socket);
    });
    this.#request.on("error", (error) => {
      this.#error = serializeNodeError(error);
    });
    this.#request.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("error", (error) => {
        this.#error = serializeNodeError(error);
      });
      response.on("end", () => {
        this.#response = {
          statusCode: response.statusCode ?? 0,
          statusMessage: response.statusMessage ?? "",
          httpVersion: response.httpVersion,
          headers: rawHeadersToFields(response.rawHeaders),
          body: new Uint8Array(Buffer.concat(chunks)),
        };
      });
    });
  }
  socket(): Connection | undefined {
    const connection = this.#connection;
    this.#connection = undefined;
    return connection;
  }
  finish(headers: DirectHttpRequest["headers"], body: Uint8Array): DirectHttpResult<boolean> {
    try {
      for (const field of headers) {
        this.#request.setHeader(field.name, Buffer.from(field.value).toString("latin1"));
      }
      this.#request.end(body);
      return { tag: "ok", val: true };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }
  response(): DirectHttpResult<DirectHttpResponse | undefined> {
    return this.#error ? { tag: "err", val: this.#error } : { tag: "ok", val: this.#response };
  }
  close(): void {
    this.#request.destroy();
  }
  [Symbol.dispose](): void {
    if (!this.#response) {
      this.#request.destroy();
    }
  }
}

/** HTTP receives a one-use configuration handle; TLS policy belongs to jco:node/tls. */
function nodeTlsOptions(
  options: DirectTlsOptions | undefined,
  tls: TlsConfigurationProvider | undefined,
): nodeTls.ConnectionOptions & nodeTls.TlsOptions {
  if (!tls || options === undefined) {
    throw Object.assign(
      new Error(
        "HTTPS requires the same jco:node/tls provider passed to createHttpHost(callbacks, tls)",
      ),
      { code: "ERR_JCO_TLS_ADAPTER_REQUIRED" },
    );
  }
  return tls.takeContextOptions(options.contextId) as nodeTls.ConnectionOptions &
    nodeTls.TlsOptions;
}

function timeoutError(syscall: string): Error & { code: string; syscall: string } {
  return Object.assign(new Error(`HTTP ${syscall} timed out`), {
    code: "ETIMEDOUT",
    syscall,
  });
}

export async function request(
  options: DirectHttpRequest,
  tls?: TlsConfigurationProvider,
): AsyncResult<DirectHttpResponse> {
  return new Promise((resolve) => {
    let connectTimer: Timer | undefined;
    let firstByteTimer: Timer | undefined;
    const finish = (result: DirectHttpResult<DirectHttpResponse>): void => {
      clearTimeout(connectTimer);
      clearTimeout(firstByteTimer);
      resolve(result);
    };
    // lib/https.js `request` is lib/_http_client.js with the https agent and tls.connect, so
    // the scheme selects the module and the TLS record becomes its connect options.
    const client = options.scheme === "https" ? nodeHttps : nodeHttp;
    const request = client.request(
      new URL(`${options.scheme}://${options.authority}${options.pathWithQuery}`),
      {
        method: options.method,
        headers: fieldsToRawHeaders(options.headers),
        joinDuplicateHeaders: true,
        ...(options.scheme === "https" ? nodeTlsOptions(options.tls, tls) : {}),
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
  readonly #server: nodeHttp.Server | nodeHttps.Server;
  readonly #upgraded = new Set<Socket>();

  constructor(
    options: DirectHttpServerOptions,
    handle: (
      request: DirectHttpIncomingRequest,
      cancelled: () => boolean,
    ) => Promise<DirectHttpOutgoingResponse>,
    tls?: TlsConfigurationProvider,
    upgrade?: (request: DirectHttpIncomingRequest, head: Uint8Array) => Promise<boolean>,
    socketEvent?: (id: number, event: HttpSocketEvent) => Promise<void>,
  ) {
    // A TLS record, including an empty one, selects a native HTTPS server.
    const create =
      options.tls === undefined
        ? (handler: nodeHttp.RequestListener) =>
            nodeHttp.createServer(nodeServerOptions(options), handler)
        : (handler: nodeHttp.RequestListener) =>
            nodeHttps.createServer(
              { ...nodeServerOptions(options), ...nodeTlsOptions(options.tls!, tls) },
              handler,
            );
    this.#server = create((request, response) => {
      const pending = this.#handle(handle, request, response);
      this.#pending.add(pending);
      const complete = () => {
        this.#pending.delete(pending);
      };
      void pending.then(complete, complete);
    });
    if (upgrade && socketEvent) {
      this.#server.on("upgrade", (request, transport, head) => {
        const socket = transport as Socket;
        socket.pause();
        this.#upgraded.add(socket);
        const connection = new Connection(socket, true);
        const dispatch = (event: HttpSocketEvent) => {
          void socketEvent(connection.id(), event).catch(() => socket.destroy());
        };
        socket.on("data", (data) => dispatch({ tag: "data", val: new Uint8Array(data) }));
        socket.on("end", () => dispatch({ tag: "end" }));
        socket.on("error", (error) => dispatch({ tag: "error", val: serializeNodeError(error) }));
        socket.on("timeout", () => dispatch({ tag: "timeout" }));
        socket.on("drain", () => dispatch({ tag: "drain" }));
        socket.once("close", () => {
          this.#upgraded.delete(socket);
          dispatch({ tag: "close" });
        });
        void upgrade(
          {
            method: request.method ?? "GET",
            url: request.url ?? "/",
            httpVersion: request.httpVersion,
            headers: rawHeadersToFields(request.rawHeaders),
            body: new Uint8Array(),
            remoteAddress: socket.remoteAddress,
            remotePort: socket.remotePort,
            connection,
          },
          new Uint8Array(head),
        ).then(
          (accepted) => {
            if (!accepted) {
              socket.destroy();
            }
          },
          () => socket.destroy(),
        );
      });
    }
  }

  async #handle(
    handle: (
      request: DirectHttpIncomingRequest,
      cancelled: () => boolean,
    ) => Promise<DirectHttpOutgoingResponse>,
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
      const result = await handle(
        {
          method: request.method ?? "GET",
          url: request.url ?? "/",
          httpVersion: request.httpVersion,
          headers: rawHeadersToFields(request.rawHeaders),
          body,
          remoteAddress: request.socket.remoteAddress,
          remotePort: request.socket.remotePort,
          connection: new Connection(request.socket),
        },
        () => response.destroyed,
      );
      if (response.destroyed) {
        await result.bodyStream?.[Symbol.dispose]();
        return;
      }
      response.writeHead(
        result.statusCode,
        result.statusMessage,
        fieldsToRawHeaders(result.headers),
      );
      if (result.bodyStream) {
        const body = result.bodyStream;
        try {
          while (!response.destroyed) {
            const event = await body.poll();
            if (event.tag === "end") {
              break;
            }
            if (event.tag === "pending") {
              await new Promise((resolve) => setTimeout(resolve, 1));
              continue;
            }
            // The lifted view belongs to guest memory, whose next call may reuse it.
            if (!response.write(Buffer.from(event.val))) {
              await new Promise<void>((resolve) => {
                const done = () => {
                  response.off("drain", done);
                  response.off("close", done);
                  resolve();
                };
                response.once("drain", done);
                response.once("close", done);
              });
            }
          }
          response.end();
        } finally {
          await body[Symbol.dispose]();
        }
      } else {
        response.end(result.body);
      }
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
      for (const socket of this.#upgraded) {
        socket.destroy();
      }
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
    for (const socket of this.#upgraded) {
      socket.destroy();
    }
  }
}

/** Bind one host provider to one component's exported callback resources. */
export function createHttpHost(
  callbacks: () => DirectHttpCallbacks,
  tls?: TlsConfigurationProvider,
) {
  const enqueue = createCallbackQueue();
  class Server extends NodeHttpServer {
    readonly #listener: CallbackResource<DirectHttpRequestListener>;

    constructor(options: DirectHttpServerOptions, listener: number) {
      const resource = new CallbackResource(
        () => callbacks().takeRequestListener(listener),
        "ERR_JCO_HTTP_CALLBACK_NOT_FOUND",
      );
      super(
        options,
        async (incoming, cancelled) => {
          const listener = await enqueue(() => resource.get());
          let response: DirectHttpOutgoingResponse;
          if (listener.start) {
            const pending = await enqueue(() => listener.start!(incoming));
            try {
              for (;;) {
                if (cancelled()) {
                  throw new Error("HTTP connection closed before response headers");
                }
                const value = await enqueue(() => pending.poll());
                if (value) {
                  response = value;
                  break;
                }
                await new Promise((resolve) => setTimeout(resolve, 1));
              }
            } finally {
              await enqueue(() => pending[Symbol.dispose]());
            }
          } else {
            response = await enqueue(() => listener.handle(incoming));
          }
          if (response.bodyStream) {
            const body = response.bodyStream;
            response.bodyStream = {
              poll: () => enqueue(() => body.poll()),
              [Symbol.dispose]: () => enqueue(() => body[Symbol.dispose]()),
            } as unknown as typeof body;
          }
          return response;
        },
        tls,
        async (incoming, head) => {
          const listener = await enqueue(() => resource.get());
          return enqueue(() => listener.upgrade?.(incoming, head) ?? false);
        },
        async (id, event) => {
          const listener = await enqueue(() => resource.get());
          await enqueue(() => listener.socketEvent?.(id, event));
        },
      );
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
  return {
    request: (options: DirectHttpRequest) => request(options, tls),
    Server: Server as unknown as DirectHttpServerConstructor,
    Connection,
    ClientRequest,
  };
}

// Client-only mappings may still import this module directly. Servers require
// an instance-bound provider so callback IDs cannot cross component instances.
export const Server = class {
  constructor() {
    throw new Error("HTTP servers require createHttpHost(() => instance.httpCallbacks)");
  }
} as unknown as DirectHttpServerConstructor;

export default { request, Server, createHttpHost };
