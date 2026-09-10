import assert from "node:assert/strict";
import { test } from "vitest";
import { url, nodeUrl } from "./helpers/conformance.js";

test("deprecated entry points and object URLs throw before observing inputs", () => {
  let accessed = 0;
  const input = new Proxy(
    {},
    {
      get() {
        accessed++;
        throw new Error("observed input");
      },
    },
  );
  for (const fn of [
    url.parse,
    url.resolve,
    url.resolveObject,
    url.Url.prototype.parse,
    url.Url.prototype.resolve,
  ]) {
    assert.throws(() => Reflect.apply(fn, input, [input, input]), {
      code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
    });
  }
  assert.throws(() => Reflect.apply(url.format, null, ["https://example.com", input]), {
    code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
  });
  for (const fn of [url.URL.createObjectURL, url.URL.revokeObjectURL]) {
    assert.throws(() => Reflect.apply(fn, null, [input]), { code: "ERR_JCO_UNSUPPORTED_NODE_API" });
  }
  assert.equal(accessed, 0);
});

test("non-deprecated legacy Url methods retain object resolution algorithms", () => {
  for (const source of [
    {
      protocol: "http:",
      host: "a",
      hostname: "a",
      pathname: "/base/file",
      href: "http://a/base/file",
    },
    { protocol: "mailto:", host: "domain", pathname: "local", href: "mailto:local@domain" },
  ]) {
    for (const relative of [
      { href: "" },
      { pathname: "../next", href: "../next", hash: "#end" },
      { slashes: true, host: "other", hostname: "other", href: "//other" },
      { protocol: "https:", host: "b", hostname: "b", pathname: "/new", href: "https://b/new" },
      { search: "?q=1", href: "?q=1" },
    ]) {
      const actual = Object.assign(new url.Url(), source).resolveObject({ ...relative });
      const expected = Object.assign(new nodeUrl.Url(), source).resolveObject({ ...relative });
      assert.deepEqual({ ...actual }, { ...expected });
    }
  }
});
