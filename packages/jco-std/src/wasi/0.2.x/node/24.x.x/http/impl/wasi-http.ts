import { concatBytes } from "../body.js";
import { STATUS_CODES } from "../constants.js";
import { fromImplementationError, unsupported } from "../errors.js";
import type { HttpHeaderField, HttpImplementation } from "../types.js";

export type WasiHttpMethod =
  | { tag: "get" | "head" | "post" | "put" | "delete" | "connect" | "options" | "trace" | "patch" }
  | { tag: "other"; val: string };

export type WasiHttpScheme = { tag: "HTTP" | "HTTPS" } | { tag: "other"; val: string };
export type WasiResult<T, E> = { tag: "ok"; val: T } | { tag: "err"; val: E };

export interface WasiHttpPollable {
  block(): void;
  [Symbol.dispose]?(): void;
}

export interface WasiHttpInputStream {
  blockingRead(length: bigint): Uint8Array;
  [Symbol.dispose]?(): void;
}

export interface WasiHttpOutputStream {
  blockingWriteAndFlush(contents: Uint8Array): void;
  [Symbol.dispose]?(): void;
}

export interface WasiHttpFields {
  entries(): Array<[string, Uint8Array]>;
  [Symbol.dispose]?(): void;
}

export interface WasiHttpFieldsConstructor {
  fromList(entries: Array<[string, Uint8Array]>): WasiHttpFields;
}

export interface WasiHttpOutgoingBody {
  write(): WasiHttpOutputStream;
  [Symbol.dispose]?(): void;
}

export interface WasiHttpOutgoingBodyConstructor {
  finish(body: WasiHttpOutgoingBody, trailers: WasiHttpFields | undefined): void;
}

export interface WasiHttpOutgoingRequest {
  body(): WasiHttpOutgoingBody;
  setMethod(method: WasiHttpMethod): void;
  setScheme(scheme: WasiHttpScheme | undefined): void;
  setAuthority(authority: string | undefined): void;
  setPathWithQuery(path: string | undefined): void;
  [Symbol.dispose]?(): void;
}

export interface WasiHttpOutgoingRequestConstructor {
  new (headers: WasiHttpFields): WasiHttpOutgoingRequest;
}

export interface WasiHttpRequestOptions {
  setConnectTimeout(duration: bigint | undefined): void;
  setFirstByteTimeout(duration: bigint | undefined): void;
  setBetweenBytesTimeout(duration: bigint | undefined): void;
  [Symbol.dispose]?(): void;
}

export interface WasiHttpRequestOptionsConstructor {
  new (): WasiHttpRequestOptions;
}

export interface WasiHttpIncomingBody {
  stream(): WasiHttpInputStream;
  [Symbol.dispose]?(): void;
}

export interface WasiHttpIncomingBodyConstructor {
  finish(body: WasiHttpIncomingBody): unknown;
}

export interface WasiHttpIncomingResponse {
  status(): number;
  headers(): WasiHttpFields;
  consume(): WasiHttpIncomingBody;
  [Symbol.dispose]?(): void;
}

export interface WasiHttpFutureIncomingResponse {
  subscribe(): WasiHttpPollable;
  get(): WasiResult<WasiResult<WasiHttpIncomingResponse, WasiHttpErrorCode>, undefined> | undefined;
  [Symbol.dispose]?(): void;
}

export interface WasiHttpErrorCode {
  tag: string;
  val?: unknown;
}

export interface WasiHttpProvider {
  outgoingHandler: {
    handle(
      request: WasiHttpOutgoingRequest,
      options: WasiHttpRequestOptions | undefined,
    ): WasiHttpFutureIncomingResponse;
  };
  types: {
    Fields: WasiHttpFieldsConstructor;
    IncomingBody: WasiHttpIncomingBodyConstructor;
    OutgoingBody: WasiHttpOutgoingBodyConstructor;
    OutgoingRequest: WasiHttpOutgoingRequestConstructor;
    RequestOptions: WasiHttpRequestOptionsConstructor;
  };
}

function error(errorCode: WasiHttpErrorCode, syscall: string): Error {
  const nodeCodes: Record<string, string> = {
    "DNS-timeout": "ETIMEOUT",
    "DNS-error": "ENOTFOUND",
    "destination-not-found": "ENOTFOUND",
    "destination-unavailable": "EHOSTUNREACH",
    "connection-refused": "ECONNREFUSED",
    "connection-terminated": "ECONNRESET",
    "connection-timeout": "ETIMEDOUT",
    "connection-read-timeout": "ETIMEDOUT",
    "connection-write-timeout": "ETIMEDOUT",
  };
  const code = nodeCodes[errorCode.tag] ?? "ERR_JCO_WASI_HTTP";
  return fromImplementationError({
    name: "Error",
    message: `${syscall} ${code}: wasi:http ${errorCode.tag}`,
    code,
    syscall,
  });
}

function streamErrorCode(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && "tag" in value) {
    const tag = (value as { tag?: unknown }).tag;
    return typeof tag === "string" ? tag : undefined;
  }
  return undefined;
}

function method(value: string): WasiHttpMethod {
  const standard = new Set([
    "get",
    "head",
    "post",
    "put",
    "delete",
    "connect",
    "options",
    "trace",
    "patch",
  ]);
  const lower = value.toLowerCase();
  return standard.has(lower)
    ? { tag: lower as Exclude<WasiHttpMethod, { tag: "other" }>["tag"] }
    : { tag: "other", val: value };
}

function scheme(value: string): WasiHttpScheme {
  switch (value) {
    case "http":
      return { tag: "HTTP" };
    case "https":
      return { tag: "HTTPS" };
    default:
      return { tag: "other", val: value };
  }
}

function duration(milliseconds: number | undefined): bigint | undefined {
  return milliseconds === undefined ? undefined : BigInt(milliseconds) * 1_000_000n;
}

function dispose(resource: { [Symbol.dispose]?(): void } | undefined): void {
  resource?.[Symbol.dispose]?.();
}

function requestOptions(
  RequestOptions: WasiHttpRequestOptionsConstructor,
  request: {
    connectTimeoutMs?: number;
    firstByteTimeoutMs?: number;
    betweenBytesTimeoutMs?: number;
  },
): WasiHttpRequestOptions | undefined {
  if (
    request.connectTimeoutMs === undefined &&
    request.firstByteTimeoutMs === undefined &&
    request.betweenBytesTimeoutMs === undefined
  ) {
    return undefined;
  }
  const options = new RequestOptions();
  options.setConnectTimeout(duration(request.connectTimeoutMs));
  options.setFirstByteTimeout(duration(request.firstByteTimeoutMs));
  options.setBetweenBytesTimeout(duration(request.betweenBytesTimeoutMs));
  return options;
}

function awaitResponse(future: WasiHttpFutureIncomingResponse): WasiHttpIncomingResponse {
  for (;;) {
    const outer = future.get();
    if (!outer) {
      const pollable = future.subscribe();
      try {
        pollable.block();
      } finally {
        dispose(pollable);
      }
      continue;
    }
    if (outer.tag === "err") {
      throw fromImplementationError({
        name: "Error",
        message: "wasi:http response future was already consumed",
        code: "ERR_JCO_WASI_HTTP_STATE",
      });
    }
    if (outer.val.tag === "err") {
      throw error(outer.val.val, "request");
    }
    return outer.val.val;
  }
}

function readBody(stream: WasiHttpInputStream): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (;;) {
    try {
      chunks.push(stream.blockingRead(65_536n));
    } catch (caught) {
      if (streamErrorCode(caught) !== "closed") {
        throw caught;
      }
      return concatBytes(chunks);
    }
  }
}

function responseHeaders(fields: WasiHttpFields): HttpHeaderField[] {
  return fields.entries().map(([name, value]) => ({ name, value: value.slice() }));
}

export function createWasiHttpImplementation(provider: WasiHttpProvider): HttpImplementation {
  return {
    serverUnsupportedReason:
      "wasi:http outgoing-handler cannot accept arbitrary inbound HTTP connections",

    request(request) {
      if (request.tls !== undefined) {
        unsupported(
          `${request.scheme}.request TLS options with the wasi-http implementation`,
          "wasi:http/outgoing-handler owns certificate validation and cannot take per-request TLS configuration",
        );
      }
      try {
        const fields = provider.types.Fields.fromList(
          request.headers.map(({ name, value }): [string, Uint8Array] => [name, value]),
        );
        const outgoing = new provider.types.OutgoingRequest(fields);
        outgoing.setMethod(method(request.method));
        outgoing.setScheme(scheme(request.scheme));
        outgoing.setAuthority(request.authority);
        outgoing.setPathWithQuery(request.pathWithQuery);
        const body = outgoing.body();
        const output = body.write();
        try {
          if (request.body.byteLength > 0) {
            output.blockingWriteAndFlush(request.body);
          }
        } finally {
          dispose(output);
        }
        provider.types.OutgoingBody.finish(body, undefined);
        const future = provider.outgoingHandler.handle(
          outgoing,
          requestOptions(provider.types.RequestOptions, request),
        );
        try {
          const incoming = awaitResponse(future);
          try {
            const incomingFields = incoming.headers();
            try {
              const incomingBody = incoming.consume();
              const input = incomingBody.stream();
              let responseBody: Uint8Array;
              try {
                responseBody = readBody(input);
              } finally {
                dispose(input);
              }
              provider.types.IncomingBody.finish(incomingBody);
              const statusCode = incoming.status();
              return {
                statusCode,
                statusMessage: STATUS_CODES[statusCode] ?? "",
                httpVersion: "1.1",
                headers: responseHeaders(incomingFields),
                body: responseBody,
              };
            } finally {
              dispose(incomingFields);
            }
          } finally {
            dispose(incoming);
          }
        } finally {
          dispose(future);
        }
      } catch (caught) {
        if (caught instanceof Error && "code" in caught) {
          throw caught;
        }
        throw error({ tag: streamErrorCode(caught) ?? "internal-error" }, "request");
      }
    },
  };
}
