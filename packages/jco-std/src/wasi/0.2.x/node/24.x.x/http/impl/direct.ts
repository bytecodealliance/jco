import { fromImplementationError } from "../errors.js";
import type {
  DirectHttpHost,
  DirectHttpRequestListener,
  DirectHttpServerAddress,
  HttpImplementation,
  HttpRequestHandler,
  HttpServerAddress,
} from "../types.js";

class RequestListener implements DirectHttpRequestListener {
  readonly #handler: HttpRequestHandler;

  constructor(handler: HttpRequestHandler) {
    this.#handler = handler;
  }

  async handle(request: Parameters<DirectHttpRequestListener["handle"]>[0]) {
    try {
      return { tag: "ok" as const, val: await this.#handler(request) };
    } catch (error) {
      const value =
        typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
      return {
        tag: "err" as const,
        val: {
          name: typeof value.name === "string" ? value.name : "Error",
          message: typeof value.message === "string" ? value.message : String(error),
          code: typeof value.code === "string" ? value.code : undefined,
          syscall: typeof value.syscall === "string" ? value.syscall : undefined,
          hostname: typeof value.hostname === "string" ? value.hostname : undefined,
          address: typeof value.address === "string" ? value.address : undefined,
          port: typeof value.port === "number" ? value.port : undefined,
        },
      };
    }
  }

  [Symbol.dispose](): void {}
}

export const httpCallbacks = { RequestListener };

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

export function createDirectHttpImplementation(host: DirectHttpHost): HttpImplementation {
  return {
    request(options) {
      const result = host.request(options);
      if (result.tag === "err") {
        throw fromImplementationError(result.val);
      }
      return result.val;
    },

    createServer(options, handler) {
      const server = new host.Server(options, new RequestListener(handler));
      return {
        listen(listenOptions) {
          const result = server.listen(listenOptions);
          if (result.tag === "err") {
            throw fromImplementationError(result.val);
          }
          return directAddress(result.val)!;
        },

        close() {
          const result = server.close();
          if (result.tag === "err") {
            throw fromImplementationError(result.val);
          }
          return result.val;
        },

        closeAllConnections() {
          const result = server.closeAllConnections();
          if (result.tag === "err") {
            throw fromImplementationError(result.val);
          }
        },

        closeIdleConnections() {
          const result = server.closeIdleConnections();
          if (result.tag === "err") {
            throw fromImplementationError(result.val);
          }
        },

        getConnections() {
          const result = server.getConnections();
          if (result.tag === "err") {
            throw fromImplementationError(result.val);
          }
          return Number(result.val);
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
