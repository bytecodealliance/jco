import assert from "node:assert/strict";
import { test } from "vitest";
import { url, nodeUrl, result } from "./helpers/conformance.js";

test("domain conversion follows UTS46, percent decoding and IP canonicalization", () => {
  for (const input of [
    "BÜCHER.de",
    "faß.de",
    "測試",
    "mañana.com",
    "ｅｘａｍｐｌｅ.com",
    "xn--bcher-kva.de",
    "0xffffffff",
    "0x7f.1",
    "127.1",
    "[2001:0db8::1]",
    "[invalid]",
    "%65xample.com",
    "a@b",
    "a b",
    "a:80",
    "a/b",
    "a?b",
    "a#b",
    "a\\b",
    "a\u0000b",
    "\ud800",
    "",
    null,
    undefined,
    123,
  ]) {
    for (const name of ["domainToASCII", "domainToUnicode"] as const) {
      assert.deepEqual(
        result(() => Reflect.apply(url[name], null, [input])),
        result(() => Reflect.apply(nodeUrl[name], null, [input])),
        String(input),
      );
    }
  }
  for (const name of ["domainToASCII", "domainToUnicode"] as const) {
    assert.deepEqual(
      result(() => Reflect.apply(url[name], null, [])),
      result(() => Reflect.apply(nodeUrl[name], null, [])),
    );
    const sentinel = new Error("coercion");
    assert.throws(
      () =>
        Reflect.apply(url[name], null, [
          {
            toString() {
              throw sentinel;
            },
          },
        ]),
      (error) => error === sentinel,
    );
  }
});

test("native IDNA adapter supports engines without String.normalize", async () => {
  const { createIDNA } = await import("../../../../../../src/wasi/0.2.x/node/24.x.x/url/idna.js");
  const original = Object.getOwnPropertyDescriptor(String.prototype, "normalize")!;
  const fallback = {
    toASCII() {
      throw new Error("fallback must not run");
    },
  };
  assert.equal(createIDNA(fallback), fallback);
  let native: ReturnType<typeof createIDNA>;
  try {
    Object.defineProperty(String.prototype, "normalize", { ...original, value: undefined });
    native = createIDNA(fallback);
  } finally {
    Object.defineProperty(String.prototype, "normalize", original);
  }
  for (const domain of [
    "bu\u0308cher.de",
    "BÜCHER.de",
    "faß.de",
    "ｅｘａｍｐｌｅ.com",
    "測試",
    "127.1",
  ]) {
    assert.equal(native.toASCII(domain), nodeUrl.domainToASCII(domain));
  }
  for (const domain of [
    "a/b",
    "a@b",
    "a:80",
    "a?b",
    "a#b",
    "%65xample.com",
    "a\\b",
    "bad host",
    "",
  ]) {
    assert.equal(native.toASCII(domain), null);
  }
});
