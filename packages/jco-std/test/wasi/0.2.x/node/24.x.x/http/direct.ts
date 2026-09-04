import { describe, expect, test } from "vitest";

import { createHttp } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/core.js";
import {
  createDirectHttpImplementation,
  httpCallbacks,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/direct.js";
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
  test("passes a client request through the direct host interface", () => {
    let received: DirectHttpRequest | undefined;
    const expected = response("direct response");
    const implementation = createDirectHttpImplementation({
      request(options) {
        received = options;
        return expected;
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

  test("routes a host request to the guest through the exported callback", async () => {
    let listenerId: bigint | undefined;
    const host: DirectHttpHost = {
      request: () => {
        throw new Error("not used");
      },
      Server: class Server implements DirectHttpServer {
        constructor(_options: DirectHttpServerOptions, id: bigint) {
          listenerId = id;
        }

        listen() {
          return {
            tag: "tcp",
            val: { address: "127.0.0.1", family: "IPv4", port: 8080 },
          } as const;
        }

        close() {
          return true;
        }

        closeAllConnections(): void {}

        closeIdleConnections(): void {}

        getConnections() {
          return 1n;
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

    const result = await httpCallbacks.handleRequest(listenerId!, {
      method: "PUT",
      url: "/resource",
      httpVersion: "1.1",
      headers: [],
      body: encoder.encode("payload"),
    });
    expect(result).toMatchObject({ statusCode: 204, statusMessage: "No Content" });
    expect(result.headers).toEqual([{ name: "X-Guest", value: encoder.encode("PUT payload") }]);
    expect(decoder.decode(result.body)).toBe("");
  });
});
