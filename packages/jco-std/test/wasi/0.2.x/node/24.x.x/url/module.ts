import assert from "node:assert/strict";
import { test } from "vitest";
import { nodeUrl, url } from "./helpers/conformance.js";

test("complete Node24 module shape, aliases and constructors", () => {
  assert.deepEqual(Object.keys(url), Object.keys(nodeUrl));
  const value = new url.URL("https://example.com");
  assert.ok(value.searchParams instanceof url.URLSearchParams);
  assert.equal(value.searchParams.constructor, url.URLSearchParams);
  assert.equal(value.constructor, url.URL);
  assert.deepEqual(Object.keys(new url.Url()), Object.keys(new nodeUrl.Url()));
  for (const name of ["URL", "URLSearchParams", "Url"] as const) {
    const actual = url[name];
    const expected = nodeUrl[name];
    assert.equal(actual.name, expected.name);
    assert.equal(actual.length, expected.length);
    assert.deepEqual(
      Object.getOwnPropertyNames(actual.prototype).sort(),
      Object.getOwnPropertyNames(expected.prototype).sort(),
    );
  }
  for (const key of ["canParse", "parse", "createObjectURL", "revokeObjectURL"] as const) {
    const actual = Object.getOwnPropertyDescriptor(url.URL, key)!;
    const expected = Object.getOwnPropertyDescriptor(nodeUrl.URL, key)!;
    assert.deepEqual({ ...actual, value: undefined }, { ...expected, value: undefined });
  }
});
