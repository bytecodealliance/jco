import { expect, test } from "vitest";
import { mock as native } from "node:test";
import { MockTracker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/mock.js";
test("getter mocks preserve the setter and restore descriptors", () => {
  for (const create of [
    (object: { value: number }) => new MockTracker().getter(object, "value", (): number => 7),
    (object: { value: number }) => native.getter(object, "value", (): number => 7),
  ]) {
    let value = 1;
    const object = {
      get value(): number {
        return value;
      },
      set value(next: number) {
        value = next;
      },
    };
    const original = Object.getOwnPropertyDescriptor(object, "value");
    const fn = create(object);
    object.value = 3;
    expect(object.value).toBe(7);
    expect(fn.mock.callCount()).toBe(1);
    fn.mock.restore();
    expect(object.value).toBe(3);
    expect(Object.getOwnPropertyDescriptor(object, "value")).toEqual(original);
  }
});
