import { describe, expect, test } from "vitest";

import { createHttp } from "../../../../../../../src/wasi/0.2.x/node/24.x.x/http/core.js";
import type {
  HttpImplementation,
  HttpIncomingRequestData,
  HttpOutgoingResponseData,
} from "../../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";

export interface HttpConformanceHarness {
  implementation: HttpImplementation;
  dispatchServerRequest?: (
    request: HttpIncomingRequestData,
  ) => HttpOutgoingResponseData | Promise<HttpOutgoingResponseData>;
  close?: () => void | Promise<void>;
}

type Capability = { supported: true } | { supported: false; errorCode: string };

export interface HttpImplementationConformanceOptions {
  createHarness: () => HttpConformanceHarness;
  client: Capability;
  server: Capability;
}

const encoder = new TextEncoder();

async function clientExchange(implementation: HttpImplementation): Promise<{
  statusCode: number | undefined;
  body: string;
}> {
  const http = createHttp(implementation);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "example.com",
        method: "POST",
        path: "/conformance",
        headers: { "Content-Type": "text/plain" },
      },
      (response) => {
        response.setEncoding("utf8");
        const chunks: string[] = [];
        response.on("data", (chunk: string) => chunks.push(chunk));
        response.once("error", reject);
        response.once("end", () => {
          resolve({ statusCode: response.statusCode, body: chunks.join("") });
        });
      },
    );
    request.once("error", reject);
    request.end("client request");
  });
}

export function httpImplementationConformance(
  name: string,
  options: HttpImplementationConformanceOptions,
): void {
  describe(`${name} node:http implementation conformance`, () => {
    test("implements or explicitly rejects client requests", async () => {
      const harness = options.createHarness();
      try {
        const exchange = clientExchange(harness.implementation);
        if (!options.client.supported) {
          await expect(exchange).rejects.toMatchObject({ code: options.client.errorCode });
          return;
        }
        await expect(exchange).resolves.toEqual({
          statusCode: 201,
          body: "client response",
        });
      } finally {
        await harness.close?.();
      }
    });

    test("implements or explicitly rejects HTTP servers", async () => {
      const harness = options.createHarness();
      try {
        const http = createHttp(harness.implementation);
        if (!options.server.supported) {
          expect(() => http.createServer()).toThrow(
            expect.objectContaining({ code: options.server.errorCode }),
          );
          return;
        }
        if (!harness.dispatchServerRequest) {
          throw new Error(`${name} did not provide a server dispatch harness`);
        }
        const server = http.createServer(async (request, response) => {
          request.setEncoding("utf8");
          const chunks: string[] = [];
          for await (const chunk of request) {
            chunks.push(String(chunk));
          }
          response.writeHead(202, "Accepted", { "X-Conformance": "yes" });
          response.end(`${request.method} ${request.url}: ${chunks.join("")}`);
        });
        server.listen(8080, "127.0.0.1");
        const response = await harness.dispatchServerRequest({
          method: "PUT",
          url: "/server",
          httpVersion: "1.1",
          headers: [
            { name: "Host", value: encoder.encode("example.com") },
            { name: "Content-Length", value: encoder.encode("14") },
          ],
          body: encoder.encode("server request"),
        });
        expect(response).toMatchObject({ statusCode: 202, statusMessage: "Accepted" });
        expect(new TextDecoder().decode(response.body)).toBe("PUT /server: server request");
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      } finally {
        await harness.close?.();
      }
    });
  });
}
