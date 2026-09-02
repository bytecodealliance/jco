import { fromImplementationError } from "../errors.js";
import type {
  DirectHttpHost,
  DirectHttpIncomingRequest,
  DirectHttpOutgoingResponse,
  DirectHttpServerAddress,
  HttpImplementation,
  HttpRequestHandler,
  HttpServerAddress,
} from "../types.js";

/**
 * Handlers the host can call back into, by the id their server was created with.
 *
 * A guest cannot hand one of its own resources to an import -- an imported interface's
 * resource types belong to the host, and a world that both imports and exports an interface
 * ends up with two unrelated copies of its types. So the server constructor carries an id,
 * and the host calls the exported `handle-request` with it.
 */
const HANDLERS = new Map<bigint, HttpRequestHandler>();

let nextListenerId = 1n;

/** Register a handler for the host to call back into, and return the id that names it. */
function registerHandler(handler: HttpRequestHandler): bigint {
  const id = nextListenerId;
  nextListenerId += 1n;
  HANDLERS.set(id, handler);
  return id;
}

/** Stop answering for a handler once its server is closed. */
function forgetHandler(id: bigint): void {
  HANDLERS.delete(id);
}

/** Shape a thrown value the way the WIT `error` record is written. */
function toWitError(error: unknown): Record<string, unknown> {
  const value =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    message: typeof value.message === "string" ? value.message : String(error),
    code: typeof value.code === "string" ? value.code : undefined,
    syscall: typeof value.syscall === "string" ? value.syscall : undefined,
    hostname: typeof value.hostname === "string" ? value.hostname : undefined,
    address: typeof value.address === "string" ? value.address : undefined,
    port: typeof value.port === "number" ? value.port : undefined,
  };
}

/**
 * The guest side of `jco:node/http-callbacks`.
 *
 * A `result` return is the returned value on success and a thrown error otherwise -- the
 * bindings do the wrapping -- so nothing here builds a tagged object.
 */
export const httpCallbacks = {
  async handleRequest(
    listenerId: bigint,
    request: DirectHttpIncomingRequest,
  ): Promise<DirectHttpOutgoingResponse> {
    const handler = HANDLERS.get(listenerId);
    if (!handler) {
      throw Object.assign(new Error(`no request handler is registered for id [${listenerId}]`), {
        code: "ERR_JCO_NODE_HTTP_NO_HANDLER",
      });
    }
    try {
      return await handler(request);
    } catch (error) {
      throw Object.assign(new Error(String(toWitError(error).message)), toWitError(error));
    }
  },
};

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

/** Run a host call, restating whatever it throws as a Node-shaped error. */
function hostCall<T>(call: () => T): T {
  try {
    return call();
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      throw error;
    }
    throw fromImplementationError(toWitError(error) as never);
  }
}

export function createDirectHttpImplementation(host: DirectHttpHost): HttpImplementation {
  return {
    request(options) {
      return hostCall(() => host.request(options));
    },

    createServer(options, handler) {
      const listenerId = registerHandler(handler);
      const server = new host.Server(options, listenerId);
      return {
        listen(listenOptions) {
          return directAddress(hostCall(() => server.listen(listenOptions)))!;
        },

        close() {
          forgetHandler(listenerId);
          return hostCall(() => server.close());
        },

        closeAllConnections() {
          hostCall(() => server.closeAllConnections());
        },

        closeIdleConnections() {
          hostCall(() => server.closeIdleConnections());
        },

        getConnections() {
          return Number(hostCall(() => server.getConnections()));
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
