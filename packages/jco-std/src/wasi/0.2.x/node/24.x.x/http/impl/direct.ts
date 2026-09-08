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

export function createDirectHttpImplementation(host: HostImports<DirectHttpHost>) {
  // Each implementation (and bundled guest instance) owns its registrations.
  const listeners = new Map<number, RequestListener>();
  let nextListener = 1;
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
      return callHost(() => host.request(options), fromImplementationError);
    },

    createServer(options: HttpServerOptions, handler: HttpRequestHandler) {
      if (nextListener > 0xffff_ffff) {
        throw codedError(
          new Error("HTTP callback registrations exhausted"),
          "ERR_JCO_HTTP_CALLBACK_LIMIT",
        );
      }
      const listener = nextListener++;
      const server = new host.Server(options, listener);
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
