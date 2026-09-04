import { Agent, globalAgent } from "./agent.js";
import {
  ClientRequestBase,
  type ClientRequestConstructor,
  createClientRequest,
  type RequestInput,
  type ResponseListener,
} from "./client-request.js";
import { METHODS, STATUS_CODES, maxHeaderSize } from "./constants.js";
import { invalidArgType, outOfRange, unsupported } from "./errors.js";
import { validateHeaderName, validateHeaderValue } from "./headers.js";
import { IncomingMessage } from "./incoming-message.js";
import { OutgoingMessage } from "./outgoing-message.js";
import { HTTP_PROFILE, type ProtocolProfile } from "./profile.js";
import {
  connectionListener,
  createServerConstructor,
  type ServerBase,
  type ServerConstructor,
  ServerResponse,
  type RequestListener,
  type ServerOptions,
} from "./server.js";
import type { HttpImplementation, HttpRequestOptions } from "./types.js";

type RuntimeConstructor = new (...args: unknown[]) => unknown;

function unavailableConstructor(name: string): RuntimeConstructor {
  return class {
    constructor() {
      unsupported(`http.${name}`, `${name} is not provided by the JavaScript engine`);
    }
  };
}

function globalConstructor(name: "WebSocket" | "CloseEvent" | "MessageEvent"): RuntimeConstructor {
  const value = globalThis[name];
  return typeof value === "function" ? (value as RuntimeConstructor) : unavailableConstructor(name);
}

/**
 * The protocol-dependent half of `node:http`, which `node:https` reuses wholesale.
 */
export interface ProtocolModule {
  ClientRequest: ClientRequestConstructor;
  Server: ServerConstructor;
  createServer: (
    optionsOrListener?: ServerOptions | RequestListener | null,
    listener?: RequestListener,
  ) => ServerBase;
  get: (
    input: RequestInput,
    options?: HttpRequestOptions | ResponseListener,
    callback?: ResponseListener,
  ) => ClientRequestBase;
  request: (
    input: RequestInput,
    options?: HttpRequestOptions | ResponseListener,
    callback?: ResponseListener,
  ) => ClientRequestBase;
}

/**
 * Builds the request/server surface for one protocol.
 *
 * `lib/https.js` reuses `_http_client` and `_http_server` unchanged and only varies the
 * protocol, default port, and default agent, so both modules share this builder.
 */
export function createProtocolModule(
  implementation: HttpImplementation,
  profile: ProtocolProfile,
): ProtocolModule {
  const ClientRequest = createClientRequest(implementation, profile);
  const Server = createServerConstructor(implementation, profile);

  function request(
    input: RequestInput,
    options?: HttpRequestOptions | ResponseListener,
    callback?: ResponseListener,
  ): ClientRequestBase {
    return new ClientRequest(input, options, callback);
  }

  function get(
    input: RequestInput,
    options?: HttpRequestOptions | ResponseListener,
    callback?: ResponseListener,
  ): ClientRequestBase {
    const clientRequest = request(input, options, callback);
    clientRequest.end();
    return clientRequest;
  }

  function createServer(
    optionsOrListener: ServerOptions | RequestListener | null = {},
    listener?: RequestListener,
  ): ServerBase {
    return new Server(optionsOrListener, listener);
  }

  return { ClientRequest, Server, createServer, get, request };
}

export interface NodeHttpModule {
  Agent: typeof Agent;
  ClientRequest: ClientRequestConstructor;
  CloseEvent: RuntimeConstructor;
  IncomingMessage: typeof IncomingMessage;
  METHODS: string[];
  MessageEvent: RuntimeConstructor;
  OutgoingMessage: typeof OutgoingMessage;
  STATUS_CODES: Record<number, string>;
  Server: ServerConstructor;
  ServerResponse: typeof ServerResponse;
  WebSocket: RuntimeConstructor;
  _connectionListener: typeof connectionListener;
  createServer: (
    optionsOrListener?: ServerOptions | RequestListener | null,
    listener?: RequestListener,
  ) => ServerBase;
  get: (
    input: RequestInput,
    options?: HttpRequestOptions | ResponseListener,
    callback?: ResponseListener,
  ) => ClientRequestBase;
  globalAgent: Agent;
  maxHeaderSize: number;
  request: (
    input: RequestInput,
    options?: HttpRequestOptions | ResponseListener,
    callback?: ResponseListener,
  ) => ClientRequestBase;
  setGlobalProxyFromEnv: (environment?: Record<string, string | undefined>) => never;
  setMaxIdleHTTPParsers: (max: number) => void;
  validateHeaderName: typeof validateHeaderName;
  validateHeaderValue: typeof validateHeaderValue;
}

let maxIdleHttpParsers = 1_000;

export function createHttp(implementation: HttpImplementation): NodeHttpModule {
  const { ClientRequest, Server, createServer, get, request } = createProtocolModule(
    implementation,
    HTTP_PROFILE,
  );

  function setMaxIdleHTTPParsers(max: number): void {
    if (typeof max !== "number") {
      throw invalidArgType("max", "number", max);
    }
    if (!Number.isInteger(max) || max < 1) {
      throw outOfRange("max", "an integer >= 1", max);
    }
    maxIdleHttpParsers = max;
  }

  function setGlobalProxyFromEnv(_environment?: Record<string, string | undefined>): never {
    return unsupported(
      "http.setGlobalProxyFromEnv",
      "components do not own Node's process-wide undici and HTTPS agent state",
    );
  }

  void maxIdleHttpParsers;
  return {
    Agent,
    ClientRequest,
    CloseEvent: globalConstructor("CloseEvent"),
    IncomingMessage,
    METHODS,
    MessageEvent: globalConstructor("MessageEvent"),
    OutgoingMessage,
    STATUS_CODES,
    Server,
    ServerResponse,
    WebSocket: globalConstructor("WebSocket"),
    _connectionListener: connectionListener,
    createServer,
    get,
    globalAgent,
    maxHeaderSize,
    request,
    setGlobalProxyFromEnv,
    setMaxIdleHTTPParsers,
    validateHeaderName,
    validateHeaderValue,
  };
}
