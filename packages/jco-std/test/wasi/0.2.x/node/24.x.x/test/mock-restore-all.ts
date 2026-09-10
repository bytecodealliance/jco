import { expect, test } from "vitest";
import { MockTracker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/mock.js";
test("restoreAll restores tracked mocks on repeat calls", () => {
  const tracker = new MockTracker();
  const object = { fn: (): number => 1 };
  tracker.method(object, "fn", (): number => 2);
  tracker.restoreAll();
  expect(object.fn()).toBe(1);
  object.fn = (): number => 3;
  tracker.restoreAll();
  expect(object.fn()).toBe(1);
});
