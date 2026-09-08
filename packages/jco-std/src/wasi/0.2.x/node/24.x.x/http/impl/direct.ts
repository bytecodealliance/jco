import type { HostImports } from "../../internal/wit-types.js";
import { callHost } from "../../internal/host-error.js";
import { serializeNodeError } from "../../internal/http-host.js";
import { codedError } from "../../errors/core.js";
import { fromImplementationError } from "../errors.js";
import type {
  DirectHttpCallbacks,
  DirectHttpHost,
  DirectHttpServerAddress,
  HttpImplementation,
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

export function createDirectHttpImplementation(
  host: HostImports<DirectHttpHost>,
): HttpImplementation & { httpCallbacks: DirectHttpCallbacks } {
  // Each implementation (and bundled guest instance) owns its registrations.
  const listeners = new Map<number, HttpRequestHandler>();
  let nextListener = 1;
  return {
    httpCallbacks: {
      async handle(listener, request) {
        try {
          const handler = listeners.get(listener);
          if (!handler) {
            throw codedError(
              new Error("HTTP callback registration is not active"),
              "ERR_JCO_HTTP_CALLBACK_NOT_FOUND",
            );
          }
          // Exported WIT results use JS return/throw, rather than tagged results.
          return await handler(request);
        } catch (error) {
          throw serializeNodeError(error);
        }
      },
    },

    request(options) {
      return callHost(() => host.request(options), fromImplementationError);
    },

    createServer(options, handler) {
      if (nextListener > 0xffff_ffff) {
        throw codedError(
          new Error("HTTP callback registrations exhausted"),
          "ERR_JCO_HTTP_CALLBACK_LIMIT",
        );
      }
      const listener = nextListener++;
      const server = new host.Server(options, listener);
      return {
        listen(listenOptions) {
          listeners.set(listener, handler);
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
