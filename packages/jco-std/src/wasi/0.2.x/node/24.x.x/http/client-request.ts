/**
 * Buffered ClientRequest for the portable node:http shim.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/_http_client.js and the
 * urlToHttpOptions helper in lib/internal/url.js (MIT license). Option
 * normalisation, Host/Authorization defaults, and validation errors are kept;
 * agents, sockets, and the streaming parser are replaced by one typed
 * request/response exchange with the selected implementation.
 */

import { Agent, globalAgent } from "./agent.js";
import { base64 } from "./body.js";
import { deprecated, invalidArgType, invalidArgValue, unsupported } from "./errors.js";
import { validateHeaderName } from "./headers.js";
import { IncomingMessage } from "./incoming-message.js";
import { OutgoingMessage } from "./outgoing-message.js";
import type {
  HttpImplementation,
  HttpImplementationRequest,
  HttpImplementationResponse,
  HttpRequestOptions,
} from "./types.js";

export type ResponseListener = (response: IncomingMessage) => void;
export type RequestInput = string | URL | HttpRequestOptions;

interface NormalizedRequest {
  options: HttpRequestOptions;
  method: string;
  protocol: string;
  hostname: string;
  port: number;
  authority: string;
  path: string;
}

function urlOptions(input: string | URL): HttpRequestOptions {
  const url = input instanceof URL ? input : new URL(input);
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    auth:
      url.username || url.password
        ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`
        : undefined,
  };
}

function numericPort(value: number | string | null | undefined, fallback: number): number {
  const port = value === null || value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw invalidArgValue("options.port", value);
  }
  return port;
}

function normalizedRequest(
  input: RequestInput,
  extra: HttpRequestOptions | undefined,
): NormalizedRequest {
  const base = typeof input === "string" || input instanceof URL ? urlOptions(input) : input;
  if (typeof base !== "object" || base === null) {
    throw invalidArgType("options", "object, string, or URL", input);
  }
  const options = { ...base, ...extra };
  const protocol = options.protocol ?? "http:";
  if (protocol !== "http:") {
    const error = invalidArgValue("protocol", protocol);
    error.code = "ERR_INVALID_PROTOCOL";
    error.message = `Protocol \"${protocol}\" not supported. Expected \"http:\"`;
    throw error;
  }
  let hostname = options.hostname ?? options.host ?? "localhost";
  if (typeof hostname !== "string") {
    throw invalidArgType("options.hostname", "string", hostname);
  }
  let hostPort: string | undefined;
  if (hostname.startsWith("[") && hostname.includes("]")) {
    const closing = hostname.indexOf("]");
    hostPort = hostname.slice(closing + 1).replace(/^:/, "") || undefined;
    hostname = hostname.slice(1, closing);
  } else if (hostname.split(":").length === 2) {
    [hostname, hostPort] = hostname.split(":");
  }
  const port = numericPort(options.port ?? hostPort, Number(options.defaultPort ?? 80));
  const method = (options.method ?? "GET").toUpperCase();
  validateHeaderName(method, "Method");
  const path = options.path ?? "/";
  if (typeof path !== "string") {
    throw invalidArgType("options.path", "string", path);
  }
  if (/[\u0000-\u0020]/.test(path)) {
    const error = invalidArgValue("path", path);
    error.code = "ERR_UNESCAPED_CHARACTERS";
    error.message = "Request path contains unescaped characters";
    throw error;
  }
  const authorityHost = hostname.includes(":") ? `[${hostname}]` : hostname;
  return {
    options,
    method,
    protocol,
    hostname,
    port,
    authority: port === 80 ? authorityHost : `${authorityHost}:${port}`,
    path,
  };
}

function abortError(reason: unknown): Error & { code: string } {
  return Object.assign(
    new Error(reason === undefined ? "The operation was aborted" : String(reason)),
    {
      name: "AbortError",
      code: "ABORT_ERR",
    },
  );
}

export class ClientRequestBase extends OutgoingMessage {
  readonly agent: Agent;
  readonly protocol: string;
  readonly host: string;
  readonly path: string;
  readonly method: string;
  readonly reusedSocket = false;
  maxHeadersCount: number | null = null;
  readonly #implementation: HttpImplementation;
  readonly #hostname: string;
  readonly #port: number;
  readonly #responseListener: ResponseListener | undefined;

  constructor(
    implementation: HttpImplementation,
    input: RequestInput,
    options: HttpRequestOptions | undefined,
    responseListener: ResponseListener | undefined,
  ) {
    const normalized = normalizedRequest(input, options);
    super(normalized.options.headers);
    this.#implementation = implementation;
    this.#hostname = normalized.hostname;
    this.#port = normalized.port;
    this.#responseListener = responseListener;
    // lib/_http_client.js gives an `agent: false` request a fresh instance of the default
    // agent's class rather than no agent at all, so the request never shares the global pool.
    this.agent =
      normalized.options.agent === false
        ? new (globalAgent.constructor as new () => Agent)()
        : ((normalized.options.agent as Agent | null | undefined) ?? globalAgent);
    this.protocol = normalized.protocol;
    this.host = normalized.authority;
    this.path = normalized.path;
    this.method = normalized.method;
    if (normalized.options.setHost !== false && !this.hasHeader("host")) {
      this.setHeader("Host", normalized.authority);
    }
    if (normalized.options.auth && !this.hasHeader("authorization")) {
      this.setHeader("Authorization", `Basic ${base64(normalized.options.auth)}`);
    }
    if (normalized.options.timeout !== undefined) {
      this.setTimeout(normalized.options.timeout);
    }
    const signal = normalized.options.signal;
    if (signal) {
      const abort = () => this.destroy(abortError(signal.reason));
      if (signal.aborted) {
        abort();
      } else {
        signal.addEventListener("abort", abort, { once: true });
      }
    }
  }

  abort(): never {
    return deprecated("http.ClientRequest.abort", "request.destroy()");
  }

  setNoDelay(_noDelay = true): never {
    return unsupported(
      "http.ClientRequest.setNoDelay",
      "the selected implementation owns the socket",
    );
  }

  setSocketKeepAlive(_enable = false, _initialDelay = 0): never {
    return unsupported(
      "http.ClientRequest.setSocketKeepAlive",
      "the selected implementation owns the socket",
    );
  }

  _finalize(body: Uint8Array): () => void {
    if (
      body.byteLength > 0 &&
      !this.hasHeader("content-length") &&
      !this.hasHeader("transfer-encoding")
    ) {
      // The public headers may already be sent after write(), but this adapter
      // buffers request bodies and must still add wire framing internally.
      this._headers.setInternal("Content-Length", body.byteLength);
    }
    const timeout = this._timeout() || undefined;
    const request: HttpImplementationRequest = {
      method: this.method,
      scheme: "http",
      authority: this.host,
      pathWithQuery: this.path,
      headers: this._headers.fields(),
      body,
      connectTimeoutMs: timeout,
      firstByteTimeoutMs: timeout,
      betweenBytesTimeoutMs: timeout,
    };
    const response = this.#implementation.request(request);
    return () => this.#deliver(response);
  }

  #deliver(response: HttpImplementationResponse): void {
    if (this.destroyed) {
      return;
    }
    const message = new IncomingMessage(response);
    this.emit("response", message);
    this.#responseListener?.(message);
    message._start();
  }

  _remote(): { hostname: string; port: number } {
    return { hostname: this.#hostname, port: this.#port };
  }
}

export interface ClientRequestConstructor {
  new (
    input: RequestInput,
    options?: HttpRequestOptions | ResponseListener,
    callback?: ResponseListener,
  ): ClientRequestBase;
}

export function createClientRequest(implementation: HttpImplementation): ClientRequestConstructor {
  return class ClientRequest extends ClientRequestBase {
    constructor(
      input: RequestInput,
      options?: HttpRequestOptions | ResponseListener,
      callback?: ResponseListener,
    ) {
      super(
        implementation,
        input,
        typeof options === "function" ? undefined : options,
        typeof options === "function" ? options : callback,
      );
    }
  };
}
