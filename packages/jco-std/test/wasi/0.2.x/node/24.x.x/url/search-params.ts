import assert from "node:assert/strict";
import { test } from "vitest";
import { url, nodeUrl, result } from "./helpers/conformance.js";

test("URLSearchParams Node overloads, malformed tuples, records and errors", () => {
  const inputs = [
    undefined,
    null,
    42,
    true,
    "?a=1&a=2",
    [
      ["a", "1"],
      ["a", "2"],
    ],
    [["a"]],
    [["a", "b", "c"]],
    [null],
    ["ab"],
    { [Symbol.iterator]: 42 },
    { "\ud800": "first", "\ud801": "last" },
    { [Symbol("key")]: 1 },
    { list: ["a", "b"] },
    Object.assign(() => {}, { key: "value" }),
  ];
  for (const input of inputs) {
    assert.deepEqual(
      result(() => Reflect.construct(url.URLSearchParams, [input]).toString()),
      result(() => Reflect.construct(nodeUrl.URLSearchParams, [input]).toString()),
    );
  }
  for (const name of [
    "append",
    "delete",
    "get",
    "getAll",
    "has",
    "set",
    "sort",
    "toString",
    "keys",
    "values",
    "entries",
    "forEach",
  ] as const) {
    for (const args of [[], ["name"], [Symbol("name"), "value"]]) {
      // Skip successful iterator/callback cases here; guest fixtures cover their behavior.
      const actual = result(() =>
        Reflect.apply(url.URLSearchParams.prototype[name], new url.URLSearchParams(), args),
      );
      const expected = result(() =>
        Reflect.apply(nodeUrl.URLSearchParams.prototype[name], new nodeUrl.URLSearchParams(), args),
      );
      if (actual && typeof actual === "object" && "next" in actual) {
        continue;
      }
      assert.deepEqual(actual, expected, name);
    }
    assert.deepEqual(
      result(() => Reflect.apply(url.URLSearchParams.prototype[name], {}, [])),
      result(() => Reflect.apply(nodeUrl.URLSearchParams.prototype[name], {}, [])),
      name,
    );
  }
  assert.equal(
    url.URLSearchParams.prototype[Symbol.iterator],
    url.URLSearchParams.prototype.entries,
  );
});

test("URLSearchParams converts tuples during iteration and closes on failure", () => {
  function observe(Constructor: typeof URLSearchParams): unknown {
    const events: string[] = [];
    function* pairs(): Generator<unknown> {
      try {
        yield [
          {
            toString() {
              events.push("name");
              return "x";
            },
          },
          {
            toString() {
              events.push("value");
              return "1";
            },
          },
        ];
        events.push("second");
        yield ["invalid"];
        events.push("unreachable");
      } finally {
        events.push("closed");
      }
    }
    return [result(() => Reflect.construct(Constructor, [pairs()])), events];
  }
  assert.deepEqual(observe(url.URLSearchParams), observe(nodeUrl.URLSearchParams));
});
