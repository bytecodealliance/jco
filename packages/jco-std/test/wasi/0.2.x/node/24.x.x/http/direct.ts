import { describe, expect, test } from "vitest";

import { createHttp } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/core.js";
import { createDirectHttpImplementation } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/direct.js";
import type {
  DirectHttpHost,
  DirectHttpRequest,
  DirectHttpRequestListener,
  DirectHttpServer,
  DirectHttpServerOptions,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";
import { response } from "./helpers/index.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("node:http direct implementation", () => {
  test("passes a client request through the direct host interface", () => {
    let received: DirectHttpRequest | undefined;
    const expected = response("direct response");
    const implementation = createDirectHttpImplementation({
      request(options) {
        received = options;
        return { tag: "ok", val: expected };
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
  });

  test("passes a guest request listener resource to the host Server resource", async () => {
    let listener: DirectHttpRequestListener | undefined;
    const host: DirectHttpHost = {
      request: () => {
        throw new Error("not used");
      },
      Server: class Server implements DirectHttpServer {
        constructor(_options: DirectHttpServerOptions, requestListener: DirectHttpRequestListener) {
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
    const http = createHttp(createDirectHttpImplementation(host));
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

    const result = await listener!.handle({
      method: "PUT",
      url: "/resource",
      httpVersion: "1.1",
      headers: [],
      body: encoder.encode("payload"),
    });
    expect(result).toMatchObject({
      tag: "ok",
      val: { statusCode: 204, statusMessage: "No Content" },
    });
    if (result.tag === "ok") {
      expect(result.val.headers).toEqual([
        { name: "X-Guest", value: encoder.encode("PUT payload") },
      ]);
      expect(decoder.decode(result.val.body)).toBe("");
    }
  });
});
