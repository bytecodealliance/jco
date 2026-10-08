import assert from "node:assert/strict";
import { test } from "vitest";
import { nodeUrl, url } from "./helpers/conformance.js";
import { createUrl, type UrlModule } from "../../../../../../src/wasi/0.2.x/node/24.x.x/url.js";

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

test("adapts legacy parsing without changing the supplied constructor or prototype", () => {
  const descriptors = Object.getOwnPropertyDescriptors(nodeUrl.Url.prototype);
  const adapted = createUrl(
    { initialCwd: () => "/", getEnvironment: () => [] },
    {
      Url: nodeUrl.Url as unknown as UrlModule["Url"],
    },
  );
  assert.deepEqual(Object.getOwnPropertyDescriptors(nodeUrl.Url.prototype), descriptors);
  assert.deepEqual(Object.entries(new adapted.Url()), Object.entries(new nodeUrl.Url()));
  const input = "https://example.com/items?q=one&q=two";
  const parsed = adapted.parse(input, true);
  assert.ok(parsed instanceof adapted.Url);
  assert.equal(parsed.constructor, adapted.Url);
  assert.equal(adapted.parse(parsed), parsed);
  assert.deepEqual(
    JSON.parse(JSON.stringify(parsed)),
    JSON.parse(JSON.stringify(nodeUrl.parse(input, true))),
  );
  assert.equal(adapted.resolve(input, "../next"), nodeUrl.resolve(input, "../next"));
  const resolved = adapted.resolveObject(input, "../next");
  assert.ok(resolved instanceof adapted.Url);
  assert.equal(resolved.href, nodeUrl.resolveObject(input, "../next").href);
  assert.deepEqual(Object.getOwnPropertyDescriptors(nodeUrl.Url.prototype), descriptors);
});
