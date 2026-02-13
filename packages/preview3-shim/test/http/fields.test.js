import { TextEncoder, TextDecoder } from "node:util";

import { describe, test, expect } from "vitest";

import { Fields, HttpError, _forbiddenHeaders } from "@bytecodealliance/preview3-shim/http";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

describe("Fields tests", () => {
  test("constructs fields with multiple values per name", () => {
    const fields = Fields.fromList([["X-Test", [ENCODER.encode("one"), ENCODER.encode("two")]]]);
    const values = fields.get("x-test").map((v) => DECODER.decode(v));
    expect(values).toEqual(["one", "two"]);
    expect(fields.has("X-TEST")).toBe(true);
  });

  test("throws forbidden error for a forbidden header name", () => {
    expect(() => {
      Fields.fromList([["Host", ENCODER.encode("example")]]);
    }).toThrow(HttpError);

    try {
      Fields.fromList([["Connection", ENCODER.encode("keep-alive")]]);
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err.payload.tag).toBe("forbidden");
    }

    _forbiddenHeaders.value.add("new-forbidden");
    expect(() => {
      Fields.fromList([["New-Forbidden", ENCODER.encode("example")]]);
    }).toThrow(HttpError);
  });

  test("appends and retrieves values correctly", () => {
    const f = new Fields();
    f.append("X-Custom", ENCODER.encode("a"));
    f.append("x-custom", ENCODER.encode("b"));
    expect(f.has("X-CUSTOM")).toBe(true);
    const result = f.get("x-custom").map((v) => DECODER.decode(v));
    expect(result).toEqual(["a", "b"]);
  });

  test("preserves insertion order in entries()", () => {
    const f = new Fields();
    f.append("A", ENCODER.encode("1"));
    f.append("B", ENCODER.encode("2"));
    const ents = f.entries().map(([n, v]) => [n, DECODER.decode(v)]);
    expect(ents).toEqual([
      ["A", "1"],
      ["B", "2"],
    ]);
  });

  test("set replaces previous values", () => {
    const f = new Fields();
    f.append("Tok", ENCODER.encode("one"));
    f.set("Tok", [ENCODER.encode("two"), ENCODER.encode("three")]);
    const vals = f.get("tok").map((v) => DECODER.decode(v));
    expect(vals).toEqual(["two", "three"]);
  });

  test("delete removes the header entirely", () => {
    const f = new Fields();
    f.append("D", ENCODER.encode("x"));
    f.delete("d");
    expect(f.has("D")).toBe(false);
    expect(f.get("d")).toEqual([]);
  });

  test("getAndDelete returns old values and deletes", () => {
    const f = new Fields();
    f.append("G", ENCODER.encode("v1"));
    f.append("G", ENCODER.encode("v2"));
    const old = f.getAndDelete("g").map((v) => DECODER.decode(v));
    expect(old).toEqual(["v1", "v2"]);
    expect(f.has("G")).toBe(false);
  });

  test("throws invalid-syntax on setting an invalid name", () => {
    const f = new Fields();
    expect(() => f.set("\nBad", [ENCODER.encode("x")])).toThrow(HttpError);
  });

  test("throws forbidden on setting a forbidden name", () => {
    const f = new Fields();
    expect(() => f.set("Host", [ENCODER.encode("h")])).toThrow(HttpError);
  });
});
