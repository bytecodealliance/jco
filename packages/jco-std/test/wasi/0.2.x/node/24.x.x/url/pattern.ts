import assert from "node:assert/strict";
import { test } from "vitest";
import { url, nodeUrl } from "./helpers/conformance.js";

test("URLPattern constructors, captures, regexp groups, bases and ignoreCase", () => {
  for (const pattern of [
    "/books/:id",
    "/files/*",
    "/users/:name?",
    "/items/:id(\\d+)",
    "/:café",
    "/:測試",
  ]) {
    const actual = new url.URLPattern(pattern, "https://example.com", { ignoreCase: true });
    const expected = new nodeUrl.URLPattern(pattern, "https://example.com", { ignoreCase: true });
    assert.equal(actual.hasRegExpGroups, expected.hasRegExpGroups);
    for (const input of [
      "/books/42",
      "/BOOKS/ABC",
      "/files/a/b",
      "/users",
      "/items/123",
      "/items/no",
      "/coffee",
    ]) {
      assert.equal(
        actual.test(input, "https://example.com"),
        expected.test(input, "https://example.com"),
      );
      assert.deepEqual(
        JSON.parse(JSON.stringify(actual.exec(input, "https://example.com"))),
        JSON.parse(JSON.stringify(expected.exec(input, "https://example.com"))),
      );
    }
  }
  assert.throws(() => new url.URLPattern("/relative"), TypeError);
  assert.throws(() => new url.URLPattern({ pathname: "[invalid(" }), TypeError);
});
