import type { TlsHost } from "../../tls/host-types.js";
import deniedTls from "../../tls/node-host.js";
import { encode } from "../../tls/wire.js";
import { hostCall } from "../../tls/errors.js";
import type { HostImports } from "../../internal/wit-types.js";
import { callHost } from "../../internal/host-error.js";
import { serializeNodeError } from "../../internal/http-host.js";
import { codedError } from "../../errors/core.js";
import { ResponseBody } from "../response-body.js";
import { dispatchSocketEvent } from "../connection.js";
import { fromImplementationError } from "../errors.js";
import type {
  DirectHttpRequestListener,
  DirectHttpHost,
  DirectHttpServerAddress,
  HttpImplementation,
  HttpListenOptions,
  HttpServerOptions,
  HttpRequestHandler,
  HttpServerAddress,
} from "../types.js";

export function createHttpCallbackRegistry() {
  const listeners = new Map<number, RequestListener>();
  let next = 1;
  return { listeners, allocate: () => next++ };
}

function directAddress(address: DirectHttpServerAddress | undefined): HttpServerAddress | null {
  return address === undefined
    ? null
    : address.tag === "tcp"
      ? {
          address: address.val.address,
          family: address.val.family === "IPv6" ? "IPv6" : "IPv4",
          port: address.val.port,
        }
      : address.val;
}

class RequestListener implements DirectHttpRequestListener {
  constructor(
    readonly handler: HttpRequestHandler,
    readonly onUpgrade?: (request: Parameters<HttpRequestHandler>[0], head: Uint8Array) => boolean,
  ) {}

  async handle(request: Parameters<HttpRequestHandler>[0]) {
    try {
      const response = await this.handler(request);
      // The legacy callback exchanges a buffered body. Resource-aware hosts use start().
      if (response.bodyStream) {
        const chunks: Uint8Array[] = [];
        const body = response.bodyStream;
        try {
          for (;;) {
            const event = await body.poll();
            if (event.tag === "end") {
              break;
            }
            if (event.tag === "chunk") {
              chunks.push(event.val.slice());
            }
          }
        } finally {
          body[Symbol.dispose]();
        }
        const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        return { ...response, body: bytes, bodyStream: undefined };
      }
      return response;
    } catch (error) {
      throw serializeNodeError(error);
    }
  }

  async start(request: Parameters<HttpRequestHandler>[0]) {
    return new PendingResponse(this.handler(request));
  }
  async upgrade(request: Parameters<HttpRequestHandler>[0], head: Uint8Array): Promise<boolean> {
    return this.onUpgrade?.(request, head) ?? false;
  }
  async socketEvent(id: number, event: Parameters<typeof dispatchSocketEvent>[1]): Promise<void> {
    dispatchSocketEvent(id, event);
  }

  [Symbol.dispose](): void {}
}

export class PendingResponse implements Disposable {
  #disposed = false;
  #value: Awaited<ReturnType<HttpRequestHandler>> | undefined;
  #error: unknown;
  constructor(result: ReturnType<HttpRequestHandler>) {
    void Promise.resolve(result).then(
      (value) => {
        if (this.#disposed) {
          value.bodyStream?.[Symbol.dispose]();
        } else {
          this.#value = value;
        }
      },
      (error) => {
        this.#error = error;
      },
    );
  }
  async poll() {
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
    if (this.#error) {
      throw serializeNodeError(this.#error);
    }
    const value = this.#value;
    this.#value = undefined;
    return value;
  }
  [Symbol.dispose](): void {
    this.#disposed = true;
    this.#value?.bodyStream?.[Symbol.dispose]();
    this.#value = undefined;
  }
}

export function createDirectHttpImplementation(
  host: HostImports<DirectHttpHost>,
  tls: TlsHost = deniedTls,
  registry = createHttpCallbackRegistry(),
) {
  // Each implementation (and bundled guest instance) owns its registrations.
  const { listeners } = registry;
  return {
    streamResponses: true,
    httpCallbacks: {
      RequestListener,
      ResponseBody,
      PendingResponse,
      takeRequestListener(id: number) {
        const listener = listeners.get(id);
        listeners.delete(id);
        return listener;
      },
    },

    openRequest(options: Parameters<HttpImplementation["request"]>[0]) {
      if (!host.ClientRequest || options.scheme !== "http") {
        return undefined;
      }
      try {
        return new host.ClientRequest({ ...options, tls: undefined });
      } catch (error) {
        if ((error as { code?: string }).code === "ERR_JCO_HTTP_ADAPTER_REQUIRED") {
          return undefined;
        }
        throw error;
      }
    },

    request(options: Parameters<HttpImplementation["request"]>[0]) {
      if (options.scheme !== "https") {
        return callHost(
          () => host.request({ ...options, tls: undefined }),
          fromImplementationError,
        );
      }
      const { alpnProtocols, ...material } = options.tls ?? {};
      const contextId = hostCall(() =>
        tls.createContext(encode({ ...material, ALPNProtocols: alpnProtocols })),
      );
      try {
        return callHost(
          () => host.request({ ...options, tls: { contextId } }),
          fromImplementationError,
        );
      } finally {
        tls.releaseContext(contextId);
      }
    },

    createServer(
      options: HttpServerOptions,
      handler: HttpRequestHandler,
      _onError?: unknown,
      onUpgrade?: (request: Parameters<HttpRequestHandler>[0], head: Uint8Array) => boolean,
    ) {
      const listener = registry.allocate();
      if (listener > 0x7fff_ffff) {
        throw codedError(
          new Error("HTTP callback registrations exhausted"),
          "ERR_JCO_HTTP_CALLBACK_LIMIT",
        );
      }
      const { alpnProtocols, ...material } = options.tls ?? {};
      const contextId =
        options.tls === undefined
          ? undefined
          : hostCall(() =>
              tls.createContext(encode({ ...material, ALPNProtocols: alpnProtocols })),
            );
      let server: InstanceType<typeof host.Server>;
      try {
        server = new host.Server(
          { ...options, tls: contextId === undefined ? undefined : { contextId } },
          listener,
        );
      } finally {
        if (contextId !== undefined) {
          tls.releaseContext(contextId);
        }
      }
      return {
        listen(listenOptions: HttpListenOptions) {
          listeners.set(listener, new RequestListener(handler, onUpgrade));
          try {
            return directAddress(
              callHost(() => server.listen(listenOptions), fromImplementationError),
            )!;
          } catch (error) {
            listeners.delete(listener);
            throw error;
          }
        },

        close() {
          // The host drains accepted callbacks before close returns. On error,
          // retain the registration because the server may still be active.
          const wasListening = callHost(() => server.close(), fromImplementationError);
          listeners.delete(listener);
          return wasListening;
        },

        closeAllConnections() {
          callHost(() => server.closeAllConnections(), fromImplementationError);
        },

        closeIdleConnections() {
          callHost(() => server.closeIdleConnections(), fromImplementationError);
        },

        getConnections() {
          return Number(callHost(() => server.getConnections(), fromImplementationError));
        },

        address() {
          return directAddress(server.address());
        },

        ref() {
          server.ref();
        },

        unref() {
          server.unref();
        },
      };
    },
  };
}
