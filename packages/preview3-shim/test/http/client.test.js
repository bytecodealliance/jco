import { TextDecoder, TextEncoder } from "node:util";
import http from "node:http";

import { describe, test, expect, afterAll, beforeAll } from "vitest";

import { Fields, HttpClient, RequestOptions, Request } from "@bytecodealliance/preview3-shim/http";

import { future } from "@bytecodealliance/preview3-shim/future";
import { stream } from "@bytecodealliance/preview3-shim/stream";

const ENCODER = new TextEncoder();

describe("HttpClient Integration", () => {
  let server;
  let authority;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/error") {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Server error" }));
        return;
      }

      if (req.url === "/delayed-first-byte") {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
        }, 200);
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Test-Header", "test-value");
      res.statusCode = 200;

      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const responseBody = JSON.stringify({
          method: req.method,
          path: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString(),
        });
        res.end(responseBody);
      });
    });

    await new Promise((resolve) => {
      server.listen(0, function () {
        authority = `127.0.0.1:${this.address().port}`;
        resolve(null);
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test("makes a GET request", async () => {
    const headers = new Fields();
    headers.append("accept", ENCODER.encode("application/json"));

    const { tx: trailersTx, rx: trailersRx } = future();
    const { req } = Request.new(headers, null, trailersRx);

    req.setMethod("GET");
    req.setAuthority(authority);
    req.setPathWithQuery("/test");

    trailersTx.write(null);

    const response = await HttpClient.request(req);
    expect(response.statusCode()).toBe(200);

    const responseHeaders = response.headers();
    const checkHeader = (name, expectedValue) => {
      const entry = [...responseHeaders.entries()].find(([k]) => k === name);
      const value = entry ? entry[1] : undefined;
      expect(value).toEqual(ENCODER.encode(expectedValue));
    };

    checkHeader("content-type", "application/json");
    checkHeader("x-test-header", "test-value");

    const { body } = response.body();
    const stream = body.intoReadableStream();
    const reader = stream.getReader();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      result += new TextDecoder().decode(value);
    }

    const data = JSON.parse(result);
    expect(data.method).toBe("GET");
    expect(data.path).toBe("/test");
  });

  test("makes a POST request with body", async () => {
    const headers = new Fields();
    headers.append("content-type", ENCODER.encode("application/json"));

    const { tx: bodyTx, rx: bodyRx } = stream();
    const { tx: trailersTx, rx: trailersRx } = future();

    const { req } = Request.new(headers, bodyRx, trailersRx);
    req.setMethod("POST");
    req.setAuthority(authority);
    req.setPathWithQuery("/submit");

    const requestData = JSON.stringify({
      name: "Test User",
      email: "test@example.com",
    });

    const responsePromise = HttpClient.request(req);

    await bodyTx.write(Buffer.from(requestData));
    await bodyTx.close();
    await trailersTx.write(null);

    const response = await responsePromise;
    expect(response.statusCode()).toBe(200);

    const { body } = response.body();
    const reader = body.intoReadableStream().getReader();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      result += new TextDecoder().decode(value);
    }

    const data = JSON.parse(result);
    expect(data.method).toBe("POST");
    expect(data.path).toBe("/submit");
    expect(data.body).toBe(requestData);
  });

  test("handles server errors properly", async () => {
    const headers = new Fields();
    const { tx: trailersTx, rx: trailersRx } = future();

    const { req } = Request.new(headers, null, trailersRx);
    req.setMethod("GET");
    req.setAuthority(authority);
    req.setPathWithQuery("/error");

    await trailersTx.write(null);

    const response = await HttpClient.request(req);
    expect(response.statusCode()).toBe(500);

    const { body } = response.body();
    const stream = body.intoReadableStream();
    const reader = stream.getReader();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      result += new TextDecoder().decode(value);
    }

    const data = JSON.parse(result);
    expect(data.error).toBe("Server error");
  });

  test("handles client errors", async () => {
    const headers = new Fields();
    const { tx: trailersTx, rx: trailersRx } = future();

    const { req } = Request.new(headers, null, trailersRx);
    req.setMethod("GET");

    await trailersTx.write(null);

    await expect(HttpClient.request(req)).rejects.toThrow("Request.authority must be set");
  });

  test("first-byte timeout triggers HttpError", async () => {
    const headers = new Fields();
    const { tx: trailersTx, rx: trailersRx } = future();

    const opts = new RequestOptions();
    opts.setFirstByteTimeout(1_000_000n); // 1 ms
    opts.setBetweenBytesTimeout(1_000_000n); // 1 ms

    const { req } = Request.new(headers, null, trailersRx, opts);
    req.setMethod("GET");
    req.setAuthority(authority);
    req.setPathWithQuery("/delayed-first-byte");

    await trailersTx.write(null);

    await expect(HttpClient.request(req)).rejects.toThrow(/connection-timeout/);
  });
});
