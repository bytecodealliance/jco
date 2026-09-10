import native from "node:timers";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import timers, * as namespace from "../../../../../../src/wasi/0.2.x/node/24.x.x/timers.js";
import promises from "../../../../../../src/wasi/0.2.x/node/24.x.x/timers-promises.js";

test("matches Node 24 exports, descriptors and shared promise identities", () => {
  expect(process.versions.node.split(".")[0]).toBe("24");
  expect(Object.keys(timers)).toEqual(Object.keys(native));
  expect(Object.keys(namespace).sort()).toEqual([...Object.keys(native), "default"].sort());
  expect(timers.promises).toBe(promises);
  expect(promisify(timers.setTimeout)).toBe(promises.setTimeout);
  expect(promisify(timers.setImmediate)).toBe(promises.setImmediate);
  expect(Object.getOwnPropertyDescriptor(timers, "promises")).toMatchObject({
    enumerable: true,
    configurable: true,
    set: undefined,
  });
  for (const key of [
    "setTimeout",
    "setImmediate",
    "setInterval",
    "clearTimeout",
    "clearImmediate",
    "clearInterval",
  ] as const) {
    expect(timers[key]).toBe(namespace[key]);
    expect(timers[key].length).toBe(native[key].length);
  }
});

test("matches handle prototype public descriptors", () => {
  for (const key of ["setTimeout", "setImmediate"] as const) {
    const handle = timers[key](() => {});
    const reference = native[key](() => {});
    try {
      const prototype = Object.getPrototypeOf(handle);
      const expected = Object.getPrototypeOf(reference);
      for (const name of Reflect.ownKeys(prototype)) {
        const actual = Object.getOwnPropertyDescriptor(prototype, name)!;
        expect(actual.enumerable).toBe(Object.getOwnPropertyDescriptor(expected, name)!.enumerable);
      }
    } finally {
      handle[Symbol.dispose]();
      reference[Symbol.dispose]();
    }
  }
});
