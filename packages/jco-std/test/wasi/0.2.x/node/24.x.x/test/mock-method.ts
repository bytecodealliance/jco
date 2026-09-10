import { expect, test } from "vitest";
import { MockTracker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/mock.js";
test("method spies preserve descriptors and restore inherited and symbol methods", () => {
  const tracker = new MockTracker();
  const symbol = Symbol("method");
  class Base {
    method(): number {
      return 1;
    }
    [symbol](): number {
      return 2;
    }
  }
  const object = new Base();
  const original = object.method;
  const fn = tracker.method(object, "method", (): number => 3);
  expect(object.method()).toBe(3);
  expect(fn.mock.callCount()).toBe(1);
  tracker.method(object, symbol, (): number => 4);
  expect(object[symbol]()).toBe(4);
  tracker.restoreAll();
  expect(object.method).toBe(original);
  expect(object[symbol]()).toBe(2);
  expect(Object.getOwnPropertyDescriptor(object, "method")).toEqual(
    Object.getOwnPropertyDescriptor(Base.prototype, "method"),
  );
});
