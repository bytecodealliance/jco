import { Agent, globalAgent } from "./agent.js";
import {
  ClientRequestBase,
  createClientRequest,
  type RequestInput,
  type ResponseListener,
} from "./client-request.js";
import { METHODS, STATUS_CODES, maxHeaderSize } from "./constants.js";
import { invalidArgType, outOfRange, unsupported } from "./errors.js";
import { validateHeaderName, validateHeaderValue } from "./headers.js";
import { IncomingMessage } from "./incoming-message.js";
import { OutgoingMessage } from "./outgoing-message.js";
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

export interface NodeHttpModule {
  Agent: typeof Agent;
  ClientRequest: ReturnType<typeof createClientRequest>;
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
    optionsOrListener?: ServerOptions | RequestListener,
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
  const ClientRequest = createClientRequest(implementation);
  const Server = createServerConstructor(implementation);

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
    optionsOrListener: ServerOptions | RequestListener = {},
    listener?: RequestListener,
  ): ServerBase {
    return new Server(optionsOrListener, listener);
  }

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
