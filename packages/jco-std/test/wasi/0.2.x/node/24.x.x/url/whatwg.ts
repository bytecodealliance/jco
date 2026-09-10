import assert from "node:assert/strict";
import { test } from "vitest";
import { url, nodeUrl, result } from "./helpers/conformance.js";
import {
  utf8Encode,
  utf8DecodeWithoutBOM,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/url/encoding.js";

test("WHATWG URL errors, coercion, subclassing and statics", () => {
  for (const args of [
    [],
    [undefined],
    [null],
    ["relative"],
    ["/x", "invalid"],
    ["https://example.com"],
    ["/x", "https://example.com"],
  ]) {
    assert.deepEqual(
      result(() => Reflect.construct(url.URL, args).href),
      result(() => Reflect.construct(nodeUrl.URL, args).href),
    );
    for (const method of ["parse", "canParse"] as const) {
      assert.deepEqual(
        result(() => {
          const value = Reflect.apply(url.URL[method], null, args);
          return value instanceof url.URL ? value.href : value;
        }),
        result(() => {
          const value = Reflect.apply(nodeUrl.URL[method], null, args);
          return value instanceof nodeUrl.URL ? value.href : value;
        }),
      );
    }
  }
  const sentinel = new Error("coercion");
  const input = {
    toString() {
      throw sentinel;
    },
  };
  for (const call of [
    () => Reflect.construct(url.URL, [input]),
    () => Reflect.apply(url.URL.parse, null, [input]),
    () => Reflect.apply(url.URL.canParse, null, [input]),
  ]) {
    assert.throws(call, (error) => error === sentinel);
  }
  class Child extends url.URL {}
  const child = new Child("https://example.com");
  assert.ok(child instanceof Child);
  const native = new nodeUrl.URL(child.href);
  assert.deepEqual(
    result(() => {
      child.href = "bad";
    }),
    result(() => {
      native.href = "bad";
    }),
  );
  assert.equal(child.href, "https://example.com/");
});

test("UTF-8 adapter matches the standard decoder for truncation, invalid continuations and BOM", () => {
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  for (const bytes of [
    [0xef, 0xbb, 0xbf],
    [0xe0, 0xa4],
    [0xe0, 0xa4, 0x25, 0x41],
    [0xf0, 0x9f, 0x8c],
    [0xf4, 0x90, 0x80, 0x80],
    [0xed, 0xa0, 0x80],
    [0xc0, 0x80],
    [0xff, 0xfe],
    [0xe0, 0x80, 0x80],
    [0xf0, 0x90, 0x80, 0x80],
  ]) {
    assert.equal(
      utf8DecodeWithoutBOM(new Uint8Array(bytes)),
      decoder.decode(new Uint8Array(bytes)),
    );
  }
  for (let first = 0; first < 256; first++) {
    for (let second = 0; second < 256; second++) {
      const bytes = new Uint8Array([first, second]);
      assert.equal(utf8DecodeWithoutBOM(bytes), decoder.decode(bytes), `${first},${second}`);
    }
  }
  for (const text of ["ASCII", "🌍✓", "\ud800", "\udc00", "\ufeffhello"]) {
    assert.deepEqual([...utf8Encode(text)], [...new TextEncoder().encode(text)]);
  }
});

test("URL validates receivers before coercion and preserves writable statics", () => {
  const value = new url.URL("https://example.com");
  let touched = false;
  const poison = {
    toString() {
      touched = true;
      throw new Error("coerced");
    },
  };
  for (const key of [
    "href",
    "protocol",
    "username",
    "password",
    "host",
    "hostname",
    "port",
    "pathname",
    "search",
    "hash",
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(url.URL.prototype, key)!;
    assert.throws(() => descriptor.get!.call({}), { code: "ERR_INVALID_THIS" });
    assert.throws(() => descriptor.set!.call({}, poison), { code: "ERR_INVALID_THIS" });
    assert.throws(() => descriptor.get!.call(new Proxy(value, {})), { code: "ERR_INVALID_THIS" });
  }
  assert.equal(touched, false);
  for (const key of ["toString", "toJSON"] as const) {
    assert.throws(() => Reflect.apply(url.URL.prototype[key], {}, []), {
      code: "ERR_INVALID_THIS",
    });
  }
  const original = url.URL.canParse;
  const replacement = () => false;
  try {
    url.URL.canParse = replacement;
    assert.equal(url.URL.canParse, replacement);
  } finally {
    url.URL.canParse = original;
  }
});
