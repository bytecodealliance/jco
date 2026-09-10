import { expect, test } from "vitest";
import { MockTracker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/mock.js";
test("setter mocks preserve getters and reject conflicting options", () => {
  const tracker = new MockTracker();
  let value = 1;
  const object = {
    get value(): number {
      return value;
    },
    set value(next: number) {
      value = next;
    },
  };
  const fn = tracker.setter(object, "value", (next: number): void => {
    value = next * 2;
  });
  object.value = 3;
  expect(object.value).toBe(6);
  expect(fn.mock.calls[0].arguments).toEqual([3]);
  tracker.reset();
  object.value = 4;
  expect(object.value).toBe(4);
  expect(() => tracker.setter(object, "value", { setter: false })).toThrow(/cannot be false/);
  expect(() => tracker.setter(object, "value", { getter: true })).toThrow(/cannot be used/);
});
