import { describe, expect, test } from "vitest";

import { createWasiHttpTransport } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/transports/wasi-http.js";
import type {
  WasiHttpFields,
  WasiHttpIncomingBody,
  WasiHttpIncomingResponse,
  WasiHttpOutgoingBody,
  WasiHttpOutgoingRequest,
  WasiHttpProvider,
  WasiHttpRequestOptions,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/transports/wasi-http.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("node:http wasi:http transport", () => {
  test("translates a buffered exchange and disposes child streams before their bodies", () => {
    const events: string[] = [];
    let requestMethod: unknown;
    let requestAuthority: string | undefined;
    let requestPath: string | undefined;
    let requestBody = new Uint8Array();

    class Fields implements WasiHttpFields {
      constructor(readonly values: Array<[string, Uint8Array]>) {}

      entries(): Array<[string, Uint8Array]> {
        return this.values;
      }

      [Symbol.dispose](): void {
        events.push("fields disposed");
      }
    }

    const outgoingBody: WasiHttpOutgoingBody = {
      write() {
        return {
          blockingWriteAndFlush(contents) {
            requestBody = contents.slice();
          },
          [Symbol.dispose]() {
            events.push("output disposed");
          },
        };
      },
      [Symbol.dispose]() {
        events.push("outgoing body disposed");
      },
    };

    class OutgoingRequest implements WasiHttpOutgoingRequest {
      constructor(readonly fields: WasiHttpFields) {}

      body(): WasiHttpOutgoingBody {
        return outgoingBody;
      }

      setMethod(method: unknown): void {
        requestMethod = method;
      }

      setScheme(): void {}

      setAuthority(authority: string | undefined): void {
        requestAuthority = authority;
      }

      setPathWithQuery(path: string | undefined): void {
        requestPath = path;
      }

      [Symbol.dispose](): void {
        events.push("request disposed");
      }
    }

    class RequestOptions implements WasiHttpRequestOptions {
      setConnectTimeout(): void {}

      setFirstByteTimeout(): void {}

      setBetweenBytesTimeout(): void {}
    }

    const incomingBody: WasiHttpIncomingBody = {
      stream() {
        let complete = false;
        return {
          blockingRead() {
            if (complete) {
              throw { tag: "closed" };
            }
            complete = true;
            return encoder.encode("world");
          },
          [Symbol.dispose]() {
            events.push("input disposed");
          },
        };
      },
      [Symbol.dispose]() {
        events.push("incoming body disposed");
      },
    };
    const incoming: WasiHttpIncomingResponse = {
      status: () => 201,
      headers: () => new Fields([["X-Reply", encoder.encode("yes")]]),
      consume: () => incomingBody,
      [Symbol.dispose]() {
        events.push("response disposed");
      },
    };
    let pending = true;
    const provider: WasiHttpProvider = {
      outgoingHandler: {
        handle() {
          return {
            subscribe: () => ({ block: () => events.push("future blocked") }),
            get() {
              if (pending) {
                pending = false;
                return undefined;
              }
              return { tag: "ok", val: { tag: "ok", val: incoming } };
            },
            [Symbol.dispose]() {
              events.push("future disposed");
            },
          };
        },
      },
      types: {
        Fields: { fromList: (entries) => new Fields(entries) },
        IncomingBody: {
          finish() {
            events.push("incoming body finished");
          },
        },
        OutgoingBody: {
          finish() {
            events.push("outgoing body finished");
          },
        },
        OutgoingRequest,
        RequestOptions,
      },
    };

    const response = createWasiHttpTransport(provider).request({
      method: "POST",
      scheme: "http",
      authority: "example.com",
      pathWithQuery: "/submit",
      headers: [["X-Test", "yes"]].map(([name, value]) => ({
        name,
        value: encoder.encode(value),
      })),
      body: encoder.encode("hello"),
      connectTimeoutMs: 100,
    });

    expect(requestMethod).toEqual({ tag: "post" });
    expect(requestAuthority).toBe("example.com");
    expect(requestPath).toBe("/submit");
    expect(decoder.decode(requestBody)).toBe("hello");
    expect(response.statusCode).toBe(201);
    expect(decoder.decode(response.body)).toBe("world");
    expect(events.indexOf("output disposed")).toBeLessThan(
      events.indexOf("outgoing body finished"),
    );
    expect(events.indexOf("input disposed")).toBeLessThan(events.indexOf("incoming body finished"));
    expect(events).toContain("future blocked");
  });

  test("maps wasi:http failures to Node-style errors", () => {
    const provider = {
      outgoingHandler: {
        handle() {
          return {
            subscribe: () => ({ block: () => undefined }),
            get: () => ({
              tag: "ok" as const,
              val: { tag: "err" as const, val: { tag: "connection-refused" } },
            }),
          };
        },
      },
      types: {
        Fields: { fromList: () => ({ entries: () => [] }) },
        IncomingBody: { finish: () => undefined },
        OutgoingBody: { finish: () => undefined },
        OutgoingRequest: class {
          body() {
            return { write: () => ({ blockingWriteAndFlush: () => undefined }) };
          }

          setMethod(): void {}

          setScheme(): void {}

          setAuthority(): void {}

          setPathWithQuery(): void {}
        },
        RequestOptions: class {
          setConnectTimeout(): void {}

          setFirstByteTimeout(): void {}

          setBetweenBytesTimeout(): void {}
        },
      },
    } satisfies WasiHttpProvider;

    expect(() =>
      createWasiHttpTransport(provider).request({
        method: "GET",
        scheme: "http",
        authority: "example.com",
        pathWithQuery: "/",
        headers: [],
        body: new Uint8Array(),
      }),
    ).toThrow(expect.objectContaining({ code: "ECONNREFUSED" }));
  });
});
