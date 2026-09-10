import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

import * as namespace from "../../../../../../src/wasi/0.2.x/node/24.x.x/util/index.js";
import * as typeNamespace from "../../../../../../src/wasi/0.2.x/node/24.x.x/util-types.js";

test("matches the complete module and predicate namespaces", () => {
  expect(Object.keys(util).sort()).toEqual(Object.keys(native).sort());
  expect(Object.keys(namespace).sort()).toEqual([...Object.keys(native), "default"].sort());
  expect(Object.keys(util.types).sort()).toEqual(Object.keys(native.types).sort());
  expect(Object.keys(typeNamespace).sort()).toEqual(
    [...Object.keys(native.types), "default"].sort(),
  );
  expect(typeNamespace.default).toBe(util.types);
  for (const key of Object.keys(util) as (keyof typeof util)[]) {
    expect(namespace[key]).toBe(util[key]);
  }
  expect(util.debug).toBe(util.debuglog);
  expect(util.inspect.custom).toBe(Symbol.for("nodejs.util.inspect.custom"));
  expect(util.promisify.custom).toBe(Symbol.for("nodejs.util.promisify.custom"));
  for (const key of Object.keys(util.types) as (keyof typeof util.types)[]) {
    expect(typeNamespace[key]).toBe(util.types[key]);
    const actual = Object.getOwnPropertyDescriptor(util.types, key)!;
    const expected = Object.getOwnPropertyDescriptor(native.types, key)!;
    expect([actual.enumerable, actual.writable, actual.configurable]).toEqual([
      expected.enumerable,
      expected.writable,
      expected.configurable,
    ]);
  }
});
