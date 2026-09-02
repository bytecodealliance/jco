import { describe, expect, test } from "vitest";

import { createHttp2 } from "../../../../../../../src/wasi/0.2.x/node/24.x.x/http2/core.js";
import type {
  Http2Implementation,
  Http2IncomingStreamData,
  Http2OutgoingResponseData,
} from "../../../../../../../src/wasi/0.2.x/node/24.x.x/http2/types.js";

type Capability = { supported: true } | { supported: false; errorCode: string };

export interface Http2ConformanceHarness {
  implementation: Http2Implementation;
  dispatch?: (stream: Http2IncomingStreamData) => Promise<Http2OutgoingResponseData>;
}

export interface Http2ConformanceOptions {
  createHarness: () => Http2ConformanceHarness;
  client: Capability;
  server: Capability;
}

const encoder = new TextEncoder();

export function http2ImplementationConformance(
  name: string,
  options: Http2ConformanceOptions,
): void {
  describe(`${name} node:http2 implementation conformance`, () => {
    test("implements or explicitly rejects clients", async () => {
      const harness = options.createHarness();
      const http2 = createHttp2(harness.implementation);
      if (!options.client.supported) {
        expect(() => http2.connect("http://example.com")).toThrow(
          expect.objectContaining({ code: options.client.errorCode }),
        );
        return;
      }
      const session = http2.connect("http://example.com");
      const stream = session.request({ ":method": "POST", ":path": "/conformance" });
      const completed = new Promise<string>((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
        stream.once("error", reject);
        stream.once("end", () =>
          resolve(chunks.map((chunk) => new TextDecoder().decode(chunk)).join("")),
        );
      });
      stream.end("request");
      await expect(completed).resolves.toBe("response");
      session.close();
    });

    test("implements or explicitly rejects servers", async () => {
      const harness = options.createHarness();
      const http2 = createHttp2(harness.implementation);
      if (!options.server.supported) {
        expect(() => http2.createServer()).toThrow(
          expect.objectContaining({ code: options.server.errorCode }),
        );
        return;
      }
      if (!harness.dispatch) {
        throw new Error(`${name} did not provide a server dispatch harness`);
      }
      const server = http2.createServer();
      server.on("stream", (stream: { respond(headers: object): void; end(body: string): void }) => {
        stream.respond({ ":status": 202 });
        stream.end("accepted");
      });
      server.listen(8080);
      await expect(
        harness.dispatch({
          sessionId: 1,
          id: 1,
          headers: [
            { name: ":method", value: encoder.encode("POST") },
            { name: ":path", value: encoder.encode("/conformance") },
          ],
          body: encoder.encode("request"),
        }),
      ).resolves.toMatchObject({ body: encoder.encode("accepted") });
      server.close();
    });
  });
}
