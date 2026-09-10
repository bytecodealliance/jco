import { expect, test } from "vitest";
import * as native from "node:test";
import * as shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/index.js";
import * as nativeReporters from "node:test/reporters";
import * as reporters from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/reporters.js";

test("complete named exports, callable aliases, getter namespaces, and descriptors", () => {
  expect(Object.keys(shim).sort()).toEqual(Object.keys(native).sort());
  expect(Object.keys(shim.default)).toEqual(Object.keys(native.default));
  expect(shim.default).toBe(shim.test);
  expect(shim.it).toBe(shim.test);
  expect(shim.describe).toBe(shim.suite);
  expect(Object.getPrototypeOf(shim.assert)).toBeNull();
  expect(Object.getPrototypeOf(shim.snapshot)).toBeNull();
  for (const key of Object.keys(native.default)) {
    const expected = Object.getOwnPropertyDescriptor(native.default, key)!;
    const actual = Object.getOwnPropertyDescriptor(shim.default, key)!;
    expect([actual.configurable, actual.enumerable, actual.writable, typeof actual.get]).toEqual([
      expected.configurable,
      expected.enumerable,
      expected.writable,
      typeof expected.get,
    ]);
    expect(Reflect.get(shim.default, key)).toBe(Reflect.get(shim, key));
  }
  expect(shim.default.length).toBe(native.default.length);
  expect(shim.default.name).toBe(native.default.name);
  expect(Object.keys(reporters).sort()).toEqual(Object.keys(nativeReporters).sort());
  expect(Object.keys(reporters.default)).toEqual(
    Object.keys(Reflect.get(nativeReporters, "default")),
  );
  for (const key of Object.keys(Reflect.get(nativeReporters, "default"))) {
    const expected = Object.getOwnPropertyDescriptor(Reflect.get(nativeReporters, "default"), key)!;
    const actual = Object.getOwnPropertyDescriptor(reporters.default, key)!;
    expect([actual.configurable, actual.enumerable, actual.writable, typeof actual.get]).toEqual([
      expected.configurable,
      expected.enumerable,
      expected.writable,
      typeof expected.get,
    ]);
  }
});
