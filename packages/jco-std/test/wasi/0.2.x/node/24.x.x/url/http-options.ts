import assert from "node:assert/strict";
import { test } from "vitest";
import { url, nodeUrl, result } from "./helpers/conformance.js";

test("HTTP options retain enumerable extensions, symbols, absent fields and validation", () => {
  for (const text of [
    "http://example.com/",
    "https://u%20s:p%40ss@[::1]:8443/a?x#y",
    "file:///a",
    "mailto:a@example.com",
  ]) {
    const symbol = Symbol("extra");
    const extra = { custom: 42, [symbol]: "kept" };
    const actual = url.urlToHttpOptions(Object.assign(new url.URL(text), extra));
    const expected = nodeUrl.urlToHttpOptions(Object.assign(new nodeUrl.URL(text), extra));
    assert.deepEqual(actual, expected);
    assert.equal(Object.getPrototypeOf(actual), null);
  }
  for (const value of [undefined, null, 42, "url", true, [], {}, () => {}]) {
    assert.deepEqual(
      result(() => Reflect.apply(url.urlToHttpOptions, null, [value])),
      result(() => Reflect.apply(nodeUrl.urlToHttpOptions, null, [value])),
    );
  }
});
