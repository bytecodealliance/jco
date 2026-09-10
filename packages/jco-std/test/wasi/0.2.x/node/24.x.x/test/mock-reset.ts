import { expect, test } from "vitest";
import { MockTracker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/mock.js";
test("reset restores mocks and forgets them, retaining their call history", () => {
  const tracker = new MockTracker();
  const object = { fn: (): number => 1 };
  const fn = tracker.method(object, "fn", (): number => 2);
  fn();
  tracker.reset();
  expect(object.fn()).toBe(1);
  expect(fn.mock.callCount()).toBe(1);
  object.fn = (): number => 3;
  tracker.restoreAll();
  expect(object.fn()).toBe(3);
});
