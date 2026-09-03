import { describe, expect, test } from "vitest";

import {
  parseHttp1Request,
  parseHttp1Response,
  serializeHttp1Request,
  serializeHttp1Response,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/http1.js";
import type { HttpImplementationRequest } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function request(body = ""): HttpImplementationRequest {
  return {
    method: "POST",
    scheme: "http",
    authority: "example.com",
    pathWithQuery: "/submit?q=1",
    headers: [
      { name: "Host", value: encoder.encode("example.com") },
      { name: "Content-Length", value: encoder.encode(String(body.length)) },
    ],
    body: encoder.encode(body),
  };
}

describe("HTTP/1.1 framing", () => {
  test.concurrent("serializes a request and closes first-version connections", () => {
    expect(decoder.decode(serializeHttp1Request(request("hello")))).toBe(
      "POST /submit?q=1 HTTP/1.1\r\n" +
        "Host: example.com\r\n" +
        "Content-Length: 5\r\n" +
        "Connection: close\r\n\r\n" +
        "hello",
    );
  });

  test.concurrent("waits for a fragmented content-length response", () => {
    const first = encoder.encode("HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhel");
    expect(parseHttp1Response(first, "GET")).toBeUndefined();
    const complete = encoder.encode("HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello");
    expect(parseHttp1Response(complete, "GET")).toMatchObject({
      statusCode: 200,
      statusMessage: "OK",
      body: encoder.encode("hello"),
    });
  });

  test.concurrent("decodes chunk extensions, trailers, and informational responses", () => {
    const wire = encoder.encode(
      "HTTP/1.1 100 Continue\r\n\r\n" +
        "HTTP/1.1 201 Created\r\nTransfer-Encoding: chunked\r\n\r\n" +
        "5;ext=yes\r\nhello\r\n6\r\n world\r\n0\r\nX-Trailer: yes\r\n\r\n",
    );
    const result = parseHttp1Response(wire, "POST");
    expect(result?.statusCode).toBe(201);
    expect(decoder.decode(result?.body)).toBe("hello world");
  });

  test.concurrent("uses connection close to delimit an otherwise unframed body", () => {
    const wire = encoder.encode("HTTP/1.0 200 OK\r\nContent-Type: text/plain\r\n\r\nhello");
    expect(parseHttp1Response(wire, "GET", false)).toBeUndefined();
    expect(decoder.decode(parseHttp1Response(wire, "GET", true)?.body)).toBe("hello");
  });

  test.concurrent("never consumes a body for HEAD and no-content statuses", () => {
    const head = encoder.encode("HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\n");
    const noContent = encoder.encode("HTTP/1.1 204 No Content\r\n\r\n");
    expect(parseHttp1Response(head, "HEAD")?.body).toHaveLength(0);
    expect(parseHttp1Response(noContent, "GET")?.body).toHaveLength(0);
  });

  test.concurrent("parses an inbound request and serializes a framed response", () => {
    const parsed = parseHttp1Request(
      encoder.encode(
        "POST /submit HTTP/1.1\r\nHost: example.com\r\nContent-Length: 5\r\n\r\nhello",
      ),
    );
    expect(parsed).toMatchObject({
      request: {
        method: "POST",
        url: "/submit",
        httpVersion: "1.1",
        body: encoder.encode("hello"),
      },
    });
    expect(
      decoder.decode(
        serializeHttp1Response({
          statusCode: 201,
          statusMessage: "Created",
          headers: [{ name: "Content-Type", value: encoder.encode("text/plain") }],
          body: encoder.encode("done"),
        }),
      ),
    ).toBe(
      "HTTP/1.1 201 Created\r\n" +
        "Content-Type: text/plain\r\n" +
        "Content-Length: 4\r\n" +
        "Connection: close\r\n\r\n" +
        "done",
    );
  });

  test.concurrent("waits for an incomplete inbound body", () => {
    expect(
      parseHttp1Request(encoder.encode("POST / HTTP/1.1\r\nContent-Length: 5\r\n\r\nhel")),
    ).toBeUndefined();
  });
});
