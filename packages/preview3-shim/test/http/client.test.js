import { TextDecoder, TextEncoder } from "node:util";
import http from "node:http";

import { describe, test, expect, afterAll, beforeAll } from "vitest";

import {
  Fields,
  client,
  RequestOptions,
  Request,
  Response,
} from "@bytecodealliance/preview3-shim/http";

import { future } from "@bytecodealliance/preview3-shim/future";
import { stream, readableStreamFromIterator } from "@bytecodealliance/preview3-shim/stream";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

async function withTimeout(promise, ms) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseText(response) {
  const { rx } = future();
  const [body] = Response.consumeBody(response, rx);
  const reader = readableStreamFromIterator(body[Symbol.asyncIterator]()).getReader();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return result;
    }
    result += DECODER.decode(value);
  }
}

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

      if (req.url === "/early-response") {
        res.writeHead(200, { "Content-Type": "text/plain", "X-Test-Header": "early" });
        res.write("ready");
        req.on("end", () => res.end(" done"));
        req.resume();
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
    const [req] = Request.new(headers, null, trailersRx);

    req.setMethod("GET");
    req.setAuthority(authority);
    req.setPathWithQuery("/test");

    trailersTx.write(null);

    const response = await client.send(req);
    expect(response.getStatusCode()).toBe(200);

    const responseHeaders = response.getHeaders();
    const checkHeader = (name, expectedValue) => {
      const entry = responseHeaders.copyAll().find(([k]) => k === name);
      const value = entry ? entry[1] : undefined;
      expect(value).toEqual(ENCODER.encode(expectedValue));
    };

    checkHeader("content-type", "application/json");
    checkHeader("x-test-header", "test-value");

    const { rx: resRx2 } = future();
    const [body] = Response.consumeBody(response, resRx2);
    const stream = readableStreamFromIterator(body[Symbol.asyncIterator]());
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

    const [req] = Request.new(headers, bodyRx, trailersRx);
    req.setMethod("POST");
    req.setAuthority(authority);
    req.setPathWithQuery("/submit");

    const requestData = JSON.stringify({
      name: "Test User",
      email: "test@example.com",
    });

    const responsePromise = client.send(req);

    await bodyTx.write(Buffer.from(requestData));
    await bodyTx.close();
    await trailersTx.write(null);

    const response = await responsePromise;
    expect(response.getStatusCode()).toBe(200);

    const { rx: resRx2 } = future();
    const [body] = Response.consumeBody(response, resRx2);
    const reader = readableStreamFromIterator(body[Symbol.asyncIterator]()).getReader();
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

  test("sends a GET request body when provided", async () => {
    const headers = new Fields();
    headers.append("content-type", ENCODER.encode("text/plain"));
    headers.append("content-length", ENCODER.encode("14"));

    const { tx: bodyTx, rx: bodyRx } = stream();
    const { tx: trailersTx, rx: trailersRx } = future();

    const [req] = Request.new(headers, bodyRx, trailersRx);
    req.setMethod("GET");
    req.setAuthority(authority);
    req.setPathWithQuery("/get-body");

    const responsePromise = client.send(req);
    await bodyTx.write(Buffer.from("hello from get"));
    await bodyTx.close();
    await trailersTx.write(null);

    const response = await responsePromise;
    expect(response.getStatusCode()).toBe(200);

    const data = JSON.parse(await readResponseText(response));
    expect(data.method).toBe("GET");
    expect(data.path).toBe("/get-body");
    expect(data.body).toBe("hello from get");
  });

  test("client.send resolves before request body stream closes", async () => {
    const headers = new Fields();
    headers.append("content-type", ENCODER.encode("text/plain"));

    const { tx: bodyTx, rx: bodyRx } = stream();
    const { tx: trailersTx, rx: trailersRx } = future();

    const [req, transmit] = Request.new(headers, bodyRx, trailersRx);
    req.setMethod("POST");
    req.setAuthority(authority);
    req.setPathWithQuery("/early-response");

    let transmitted = false;
    const transmitResult = transmit.read().then((result) => {
      transmitted = true;
      return result;
    });

    const responsePromise = client.send(req);
    await bodyTx.write(Buffer.from("partial"));

    let response;
    try {
      response = await withTimeout(responsePromise, 1_000);
      expect(response.getStatusCode()).toBe(200);
      expect(transmitted).toBe(false);
    } finally {
      await bodyTx.close().catch(() => {});
      await trailersTx.write(null).catch(() => {});
    }

    await expect(withTimeout(transmitResult, 1_000)).resolves.toEqual({
      tag: "ok",
      val: undefined,
    });
    expect(await readResponseText(response)).toBe("ready done");
  });

  test("request transmission future reports trailer errors", async () => {
    const headers = new Fields();
    headers.append("content-type", ENCODER.encode("text/plain"));

    const { tx: bodyTx, rx: bodyRx } = stream();
    const { tx: trailersTx, rx: trailersRx } = future();

    const [req, transmit] = Request.new(headers, bodyRx, trailersRx);
    req.setMethod("POST");
    req.setAuthority(authority);
    req.setPathWithQuery("/error");

    const response = await client.send(req);
    expect(response.getStatusCode()).toBe(500);

    await bodyTx.close();
    await trailersTx.write({ tag: "err", val: { tag: "HTTP-protocol-error" } });

    await expect(withTimeout(transmit.read(), 1_000)).resolves.toEqual({
      tag: "err",
      val: { tag: "HTTP-protocol-error" },
    });
  });

  test("handles server errors properly", async () => {
    const headers = new Fields();
    const { tx: trailersTx, rx: trailersRx } = future();

    const [req] = Request.new(headers, null, trailersRx);
    req.setMethod("GET");
    req.setAuthority(authority);
    req.setPathWithQuery("/error");

    await trailersTx.write(null);

    const response = await client.send(req);
    expect(response.getStatusCode()).toBe(500);

    const { rx: resRx2 } = future();
    const [body] = Response.consumeBody(response, resRx2);
    const stream = readableStreamFromIterator(body[Symbol.asyncIterator]());
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

    const [req] = Request.new(headers, null, trailersRx);
    req.setMethod("GET");

    await trailersTx.write(null);

    await expect(client.send(req)).rejects.toThrow("Request.authority must be set");
  });

  test("first-byte timeout triggers HttpError", async () => {
    const headers = new Fields();
    const { tx: trailersTx, rx: trailersRx } = future();

    const opts = new RequestOptions();
    opts.setFirstByteTimeout(1_000_000n); // 1 ms
    opts.setBetweenBytesTimeout(1_000_000n); // 1 ms

    const [req] = Request.new(headers, null, trailersRx, opts);
    req.setMethod("GET");
    req.setAuthority(authority);
    req.setPathWithQuery("/delayed-first-byte");

    await trailersTx.write(null);

    await expect(client.send(req)).rejects.toThrow(/connection-timeout/);
  });
});
