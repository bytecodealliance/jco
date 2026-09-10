import assert from "node:assert/strict";
import { test } from "vitest";
import { url, nodeUrl, result } from "./helpers/conformance.js";

test("format supports WHATWG options, opaque URLs, Unicode authorities and legacy objects", () => {
  for (const text of [
    "https://u:p@xn--bcher-kva.de:8080/a?x#y",
    "https://u:p@[::1]/",
    "https://example.com/?#",
    "file://xn--bcher-kva.de/share",
    "mailto:user@example.com",
    "custom://xn--bcher-kva.de/path",
  ]) {
    for (let bits = 0; bits < 16; bits++) {
      const options = {
        auth: !!(bits & 1),
        search: !!(bits & 2),
        fragment: !!(bits & 4),
        unicode: !!(bits & 8),
      };
      assert.equal(
        url.format(new url.URL(text), options),
        nodeUrl.format(new nodeUrl.URL(text), options),
        text,
      );
    }
  }
  for (const value of [undefined, null, false, 0, 1, "a", [], () => {}]) {
    assert.deepEqual(
      result(() => Reflect.apply(url.format, null, [new url.URL("https://example.com"), value])),
      result(() =>
        Reflect.apply(nodeUrl.format, null, [new nodeUrl.URL("https://example.com"), value]),
      ),
    );
  }
  for (const object of [
    {},
    { protocol: "file:", pathname: "/tmp/a" },
    { hostname: "::1", protocol: "https", port: 42, auth: "a:b c" },
    { query: { list: [1, 2], empty: "" }, search: "x=#y", pathname: "a?b#c" },
  ]) {
    assert.equal(url.format(object), nodeUrl.format(object));
  }
});
