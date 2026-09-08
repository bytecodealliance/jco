import { describe, expect, test } from "vitest";

import { createHttp } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/core.js";
import { createDirectHttpImplementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/direct.js";
import type {
  DirectHttpHost,
  DirectHttpRequest,
  DirectHttpServer,
  DirectHttpServerOptions,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";
import { response } from "./helpers/index.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("node:http direct implementation", () => {
  test("scopes registrations to an implementation and releases them on failed listen and close", async () => {
    const incoming = {
      method: "GET",
      url: "/",
      httpVersion: "1.1",
      headers: [],
      body: new Uint8Array(),
    };
    let failListen = false;
    let failClose = false;
    let failConstruction = false;
    const ids: number[] = [];
    const host: DirectHttpHost = {
      request() {
        throw new Error("not used");
      },
      Server: class {
        constructor(_options: DirectHttpServerOptions, id: number) {
          ids.push(id);
          if (failConstruction) {
            throw new Error("construction failed");
          }
        }
        listen() {
          if (failListen) {
            throw new Error("listen failed");
          }
          return { tag: "tcp" as const, val: { address: "127.0.0.1", family: "IPv4", port: 8080 } };
        }
        close() {
          if (failClose) {
            throw new Error("close failed");
          }
          return true;
        }
        closeAllConnections() {}
        closeIdleConnections() {}
        getConnections() {
          return 0n;
        }
        address() {
          return undefined;
        }
        ref() {}
        unref() {}
        [Symbol.dispose]() {}
      },
    };
    const first = createDirectHttpImplementation(host);
    const second = createDirectHttpImplementation(host);
    let count = 0;
    const a = first.createServer!({}, () => response(String(++count)));
    const b = second.createServer!({}, () => response("second"));
    expect(ids).toEqual([1, 1]);
    const inactive = (implementation: typeof first, id = 1) =>
      expect(implementation.httpCallbacks.handle(id, incoming)).rejects.toMatchObject({
        code: "ERR_JCO_HTTP_CALLBACK_NOT_FOUND",
      });
    await inactive(first);
    failListen = true;
    expect(() => a.listen({})).toThrow("listen failed");
    await inactive(first);
    failListen = false;
    a.listen({});
    b.listen({});
    expect(decoder.decode((await first.httpCallbacks.handle(1, incoming)).body)).toBe("1");
    expect(decoder.decode((await second.httpCallbacks.handle(1, incoming)).body)).toBe("second");
    failClose = true;
    expect(() => a.close()).toThrow("close failed");
    expect(decoder.decode((await first.httpCallbacks.handle(1, incoming)).body)).toBe("2");
    failClose = false;
    a.close();
    a.close();
    await inactive(first);
    expect(decoder.decode((await second.httpCallbacks.handle(1, incoming)).body)).toBe("second");
    a.listen({});
    expect(decoder.decode((await first.httpCallbacks.handle(1, incoming)).body)).toBe("3");
    a.close();
    b.close();
    await inactive(second);
    failConstruction = true;
    expect(() => first.createServer!({}, () => response("unused"))).toThrow("construction failed");
    await inactive(first, 2);
  });

  test("exports callback failures using the WIT return/throw convention", async () => {
    let id: number;
    const implementation = createDirectHttpImplementation({
      request() {
        throw new Error("unused");
      },
      Server: class {
        constructor(_options: DirectHttpServerOptions, listener: number) {
          id = listener;
        }
        listen() {
          return { tag: "tcp", val: { address: "127.0.0.1", family: "IPv4", port: 8080 } };
        }
        close() {
          return true;
        }
      } as never,
    });
    const server = implementation.createServer!({}, async () => {
      throw Object.assign(new Error("guest failure"), { code: "EACCES", errno: -13 });
    });
    server.listen({});
    await expect(
      implementation.httpCallbacks.handle(id!, {
        method: "GET",
        url: "/",
        httpVersion: "1.1",
        headers: [],
        body: new Uint8Array(),
      }),
    ).rejects.toMatchObject({
      name: "Error",
      message: "guest failure",
      code: "EACCES",
      errno: { tag: "number", val: -13n },
    });
    server.close();
  });

  test("accepts unwrapped server results and reconstructs thrown WIT errors", () => {
    const error = { name: "Error", message: "listen denied", code: "EACCES" };
    const implementation = createDirectHttpImplementation({
      request() {
        throw Object.assign(new Error("WIT error"), { payload: error });
      },
      Server: class {
        listen() {
          return { tag: "tcp" as const, val: { address: "127.0.0.1", family: "IPv4", port: 8080 } };
        }
        close() {
          return true;
        }
        closeAllConnections() {}
        closeIdleConnections() {
          throw error;
        }
        getConnections() {
          return 2n;
        }
        address() {
          return undefined;
        }
        ref() {}
        unref() {}
        [Symbol.dispose]() {}
      },
    });
    const server = implementation.createServer!({}, async () => {
      throw new Error("not called");
    });
    expect(server.listen({ port: 8080 })).toEqual({
      address: "127.0.0.1",
      family: "IPv4",
      port: 8080,
    });
    expect(server.getConnections()).toBe(2);
    expect(server.close()).toBe(true);
    expect(server.closeAllConnections()).toBeUndefined();
    expect(() => server.closeIdleConnections()).toThrow(expect.objectContaining(error));
    expect(() =>
      implementation.request({
        method: "GET",
        scheme: "http",
        authority: "example.com",
        pathWithQuery: "/",
        headers: [],
        body: new Uint8Array(),
      }),
    ).toThrow(expect.objectContaining(error));
  });

  test.each(["tagged", "unwrapped"])(
    "passes a client request through the %s direct host interface",
    (representation) => {
      let received: DirectHttpRequest | undefined;
      const expected = response("direct response");
      const implementation = createDirectHttpImplementation({
        request(options) {
          received = options;
          return representation === "tagged" ? { tag: "ok" as const, val: expected } : expected;
        },
        Server: class {
          constructor() {
            throw new Error("not used");
          }
        } as never,
      });
      const request: DirectHttpRequest = {
        method: "POST",
        scheme: "http",
        authority: "example.com",
        pathWithQuery: "/resource",
        headers: [{ name: "Content-Type", value: encoder.encode("text/plain") }],
        body: encoder.encode("payload"),
      };

      expect(implementation.request(request)).toBe(expected);
      expect(received).toEqual(request);
    },
  );

  test("dispatches a guest handler through its registered callback ID", async () => {
    let listener: number | undefined;
    const host: DirectHttpHost = {
      request: () => {
        throw new Error("not used");
      },
      Server: class Server implements DirectHttpServer {
        constructor(_options: DirectHttpServerOptions, requestListener: number) {
          listener = requestListener;
        }

        listen() {
          return {
            tag: "ok",
            val: {
              tag: "tcp",
              val: { address: "127.0.0.1", family: "IPv4", port: 8080 },
            },
          } as const;
        }

        close() {
          return { tag: "ok", val: true } as const;
        }

        closeAllConnections() {
          return { tag: "ok", val: undefined } as const;
        }

        closeIdleConnections() {
          return { tag: "ok", val: undefined } as const;
        }

        getConnections() {
          return { tag: "ok", val: 1n } as const;
        }

        address() {
          return {
            tag: "tcp",
            val: { address: "127.0.0.1", family: "IPv4", port: 8080 },
          } as const;
        }

        ref(): void {}

        unref(): void {}

        [Symbol.dispose](): void {}
      },
    };
    const implementation = createDirectHttpImplementation(host);
    const http = createHttp(implementation);
    const server = http.createServer(async (request, response) => {
      request.setEncoding("utf8");
      let body = "";
      for await (const chunk of request) {
        body += chunk;
      }
      response.writeHead(204, "No Content", { "X-Guest": `${request.method} ${body}` });
      response.end();
    });
    server.listen(8080, "127.0.0.1");

    const result = await implementation.httpCallbacks.handle(listener!, {
      method: "PUT",
      url: "/resource",
      httpVersion: "1.1",
      headers: [],
      body: encoder.encode("payload"),
    });
    expect(result).toMatchObject({ statusCode: 204, statusMessage: "No Content" });
    expect(result.headers).toEqual([{ name: "X-Guest", value: encoder.encode("PUT payload") }]);
    expect(decoder.decode(result.body)).toBe("");
    server.close();
  });
});
