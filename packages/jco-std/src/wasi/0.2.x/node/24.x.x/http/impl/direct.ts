import type { TlsHost } from "../../tls/host-types.js";
import deniedTls from "../../tls/node-host.js";
import { encode } from "../../tls/wire.js";
import { hostCall } from "../../tls/errors.js";
import type { HostImports } from "../../internal/wit-types.js";
import { callHost } from "../../internal/host-error.js";
import { serializeNodeError } from "../../internal/http-host.js";
import { codedError } from "../../errors/core.js";
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
  constructor(readonly handler: HttpRequestHandler) {}

  async handle(request: Parameters<HttpRequestHandler>[0]) {
    try {
      return await this.handler(request);
    } catch (error) {
      throw serializeNodeError(error);
    }
  }

  [Symbol.dispose](): void {}
}

export function createDirectHttpImplementation(
  host: HostImports<DirectHttpHost>,
  tls: TlsHost = deniedTls,
  registry = createHttpCallbackRegistry(),
) {
  // Each implementation (and bundled guest instance) owns its registrations.
  const { listeners } = registry;
  return {
    httpCallbacks: {
      RequestListener,
      takeRequestListener(id: number) {
        const listener = listeners.get(id);
        listeners.delete(id);
        return listener;
      },
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

    createServer(options: HttpServerOptions, handler: HttpRequestHandler) {
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
          listeners.set(listener, new RequestListener(handler));
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
