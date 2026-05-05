import { TextEncoder } from "node:util";

import { describe, test, expect } from "vitest";

import { Fields, HttpError, RequestOptions, Request } from "@bytecodealliance/preview3-shim/http";

import { FutureReader, future } from "@bytecodealliance/preview3-shim/future";
import { stream } from "@bytecodealliance/preview3-shim/stream";

const ENCODER = new TextEncoder();

describe("Request", () => {
  const headers = new Fields();
  headers.append("x-test", ENCODER.encode("a"));

  const options = new RequestOptions();
  const contents = null;
  const trailers = new FutureReader(Promise.resolve({ ok: null }));

  test("should prevent direct constructor calls", () => {
    expect(() => new Request()).toThrowError("Use Request.new(...) to create a Request");
  });

  test("new() returns Request and FutureReader with defaults", () => {
    const [req, future] = Request.new(headers, contents, trailers, options);
    expect(req).toBeInstanceOf(Request);
    expect(future).toBeInstanceOf(FutureReader);
    expect(req.getMethod()).toEqual({ tag: "get" });
    expect(req.getPathWithQuery()).toBeUndefined();
    expect(req.getScheme()).toBeUndefined();
    expect(req.getAuthority()).toBeUndefined();
  });

  test("setMethod accepts standard and custom methods", () => {
    const [req] = Request.new(headers, contents, trailers, options);

    req.setMethod("POST");
    expect(req.getMethod()).toEqual({ tag: "post" });

    req.setMethod("X-CUSTOM");
    expect(req.getMethod()).toEqual({ tag: "other", val: "x-custom" });
  });

  test("setMethod rejects invalid syntax", () => {
    const [req] = Request.new(headers, contents, trailers, options);
    expect(() => req.setMethod("BAD METHOD")).toThrowError(HttpError);
    expect(() => req.setMethod("BAD METHOD")).toThrowError(
      expect.objectContaining({ payload: { tag: "invalid-syntax" } }),
    );
  });

  test("setScheme handles valid and invalid schemes", () => {
    const [req] = Request.new(headers, contents, trailers, options);

    req.setScheme({ tag: "HTTPS" });
    expect(req.getScheme()).toEqual({ tag: "HTTPS" });

    req.setScheme(undefined);
    expect(req.getScheme()).toBeUndefined();

    expect(() => req.setScheme("1nvalid")).toThrowError(
      expect.objectContaining({ payload: { tag: "invalid-syntax" } }),
    );
  });

  test("setAuthority handles valid and invalid authorities", () => {
    const [req] = Request.new(headers, contents, trailers, options);

    req.setAuthority("example.com:8080");
    expect(req.getAuthority()).toBe("example.com:8080");

    req.setAuthority(undefined);
    expect(req.getAuthority()).toBeUndefined();

    expect(() => req.setAuthority("::invalid::")).toThrowError(
      expect.objectContaining({ payload: { tag: "invalid-syntax" } }),
    );
  });

  test("headers() and options() are immutable", () => {
    const [req] = Request.new(headers, contents, trailers, options);

    expect(() => req.getHeaders().append("x", new Uint8Array([0]))).toThrowError(
      expect.objectContaining({ payload: { tag: "immutable" } }),
    );

    expect(() => req.getOptions().setConnectTimeout(1000)).toThrowError(
      expect.objectContaining({ payload: { tag: "immutable" } }),
    );
  });
});

describe("Request.consumeBody single-stream semantics", () => {
  test("throws if consumeBody() called twice without closing", async () => {
    const headers = new Fields();
    const { tx: bodyTx, rx: bodyRx } = stream();
    const { tx: trailersTx, rx: trailersRx } = future();
    const [req] = Request.new(headers, bodyRx, trailersRx);

    const { rx: resRx2 } = future();
    Request.consumeBody(req, resRx2);
    const { rx: resRx3 } = future();
    expect(() => Request.consumeBody(req, resRx3)).toThrowError(HttpError);

    await bodyTx.close();
    await trailersTx.write(null);
  });

  test("throws after the stream has ended", async () => {
    const headers = new Fields();
    const { tx: bodyTx, rx: bodyRx } = stream();
    const { tx: trailersTx, rx: trailersRx } = future();
    const [req] = Request.new(headers, bodyRx, trailersRx);

    const { rx: resRx2 } = future();
    const [body] = Request.consumeBody(req, resRx2);
    await bodyTx.write(Buffer.from("data"));
    await bodyTx.close();
    await trailersTx.write(null);

    while ((await body.read()) !== null) {}
    const { rx: resRx3 } = future();
    expect(() => Request.consumeBody(req, resRx3)).toThrowError(HttpError);
  });
});
