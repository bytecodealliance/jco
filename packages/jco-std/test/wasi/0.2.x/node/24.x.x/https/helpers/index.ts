import { createHttps } from "../../../../../../../src/wasi/0.2.x/node/24.x.x/https/core.js";
import type {
  HttpImplementation,
  HttpImplementationRequest,
  HttpImplementationResponse,
  HttpListenOptions,
  HttpRequestHandler,
  HttpServerImplementation,
  HttpServerOptions,
} from "../../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";

const encoder = new TextEncoder();

export function response(body = "response body"): HttpImplementationResponse {
  return {
    statusCode: 200,
    statusMessage: "OK",
    httpVersion: "1.1",
    headers: [{ name: "Content-Type", value: encoder.encode("text/plain") }],
    body: encoder.encode(body),
  };
}

export function recordingImplementation(result = response()): {
  https: ReturnType<typeof createHttps>;
  requests: HttpImplementationRequest[];
  implementation: HttpImplementation;
} {
  const requests: HttpImplementationRequest[] = [];
  const implementation: HttpImplementation = {
    request(request) {
      requests.push(request);
      return result;
    },
  };
  return { https: createHttps(implementation), requests, implementation };
}

export function servingImplementation(): {
  https: ReturnType<typeof createHttps>;
  implementation: HttpImplementation;
  options: HttpServerOptions[];
  request: (data: Parameters<HttpRequestHandler>[0]) => ReturnType<HttpRequestHandler>;
} {
  const options: HttpServerOptions[] = [];
  let handler: HttpRequestHandler | undefined;
  const backend: HttpServerImplementation = {
    listen: (_listenOptions: HttpListenOptions) => ({
      address: "127.0.0.1",
      family: "IPv4" as const,
      port: 8443,
    }),
    close: () => true,
    closeAllConnections: () => undefined,
    closeIdleConnections: () => undefined,
    getConnections: () => 0,
    address: () => ({ address: "127.0.0.1", family: "IPv4", port: 8443 }),
    ref: () => undefined,
    unref: () => undefined,
  };
  const implementation: HttpImplementation = {
    request: () => {
      throw new Error("not used");
    },
    createServer(serverOptions, requestHandler) {
      options.push(serverOptions);
      handler = requestHandler;
      return backend;
    },
  };
  return {
    https: createHttps(implementation),
    implementation,
    options,
    request: (data) => handler!(data),
  };
}

export function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
