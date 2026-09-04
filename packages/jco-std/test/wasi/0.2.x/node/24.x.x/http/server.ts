import nodeHttp from "node:http";

import { describe, expect, test, vi } from "vitest";

import { createHttp } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/core.js";
import type {
  HttpImplementation,
  HttpListenOptions,
  HttpRequestHandler,
  HttpServerImplementation,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function serverImplementation(): {
  implementation: HttpImplementation;
  listen: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  request: (data: Parameters<HttpRequestHandler>[0]) => ReturnType<HttpRequestHandler>;
} {
  const listen = vi.fn((_options: HttpListenOptions) => ({
    address: "127.0.0.1",
    family: "IPv4" as const,
    port: 8080,
  }));
  const close = vi.fn(() => true);
  let handler: HttpRequestHandler | undefined;
  const backend: HttpServerImplementation = {
    listen,
    close,
    closeAllConnections: vi.fn(),
    closeIdleConnections: vi.fn(),
    getConnections: () => 2,
    address: () => ({ address: "127.0.0.1", family: "IPv4", port: 8080 }),
    ref: vi.fn(),
    unref: vi.fn(),
  };
  return {
    implementation: {
      request: () => {
        throw new Error("not used");
      },
      createServer(_options, requestHandler) {
        handler = requestHandler;
        return backend;
      },
    },
    listen,
    close,
    request: (data) => handler!(data),
  };
}

describe("node:http Server", () => {
  test("dispatches inbound requests through a server implementation", async () => {
    const backend = serverImplementation();
    const http = createHttp(backend.implementation);
    const listening = vi.fn();
    const server = http.createServer(async (request, response) => {
      let body = "";
      request.setEncoding("utf-8");
      for await (const chunk of request) {
        body += chunk;
      }
      response.writeHead(201, "Created", { "X-Request-Method": request.method! });
      response.end(`${request.url}:${body}`);
    });

    expect(server.listen(8080, "127.0.0.1", listening)).toBe(server);
    expect(backend.listen).toHaveBeenCalledWith({ port: 8080, host: "127.0.0.1" });
    await Promise.resolve();
    expect(listening).toHaveBeenCalledOnce();
    expect(server.listening).toBe(true);
    expect(server.address()).toEqual({ address: "127.0.0.1", family: "IPv4", port: 8080 });
    await expect(
      new Promise<number>((resolve, reject) => {
        server.getConnections((error, count) => (error ? reject(error) : resolve(count)));
      }),
    ).resolves.toBe(2);

    const response = await backend.request({
      method: "POST",
      url: "/items",
      httpVersion: "1.1",
      headers: [{ name: "Content-Type", value: encoder.encode("text/plain") }],
      body: encoder.encode("hello"),
      remoteAddress: "192.0.2.10",
      remotePort: 1234,
    });
    expect(response).toMatchObject({ statusCode: 201, statusMessage: "Created" });
    expect(decoder.decode(response.body)).toBe("/items:hello");
    expect(response.headers).toEqual([{ name: "X-Request-Method", value: encoder.encode("POST") }]);

    const closed = vi.fn();
    expect(server.close(closed)).toBe(server);
    await Promise.resolve();
    expect(backend.close).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledWith();
    expect(server.listening).toBe(false);
  });

  test("supports construction through the exported Server class", () => {
    const backend = serverImplementation();
    const http = createHttp(backend.implementation);
    expect(new http.Server()).toBeInstanceOf(http.Server);
    expect(new http.Server(null)).toBeInstanceOf(http.Server);
    expect(new http.Server(null, () => undefined).listenerCount("request")).toBe(1);
  });

  test("rejects a non-object options argument the way Node does", () => {
    const backend = serverImplementation();
    const http = createHttp(backend.implementation);
    for (const value of ["8080", 8080, true]) {
      let native: unknown;
      try {
        nodeHttp.createServer(value as never);
      } catch (error) {
        native = error;
      }
      expect(native).toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
      expect(() => http.createServer(value as never)).toThrow(
        expect.objectContaining({
          code: "ERR_INVALID_ARG_TYPE",
          message: (native as Error).message,
        }),
      );
    }
  });

  test("rejects server operations the buffered boundary cannot represent", async () => {
    const backend = serverImplementation();
    const http = createHttp(backend.implementation);
    const server = http.createServer((_request, response) => {
      expect(() => response.writeContinue()).toThrow(
        expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
      );
      response.end();
    });
    expect(() => server.setTimeout(1)).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    await backend.request({
      method: "GET",
      url: "/",
      httpVersion: "1.1",
      headers: [],
      body: new Uint8Array(),
    });
  });
});
