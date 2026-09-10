import { expect, test } from "vitest";
import { MockTracker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/mock.js";
test("one-shot implementations, call history copies, reset and restore", () => {
  const tracker = new MockTracker();
  const fn = tracker.fn((): number => 1);
  fn.mock.mockImplementation((): number => 2);
  fn.mock.mockImplementationOnce((): number => 3, 1);
  expect([fn(), fn(), fn()]).toEqual([2, 3, 2]);
  const calls = fn.mock.calls;
  calls.pop();
  expect(fn.mock.callCount()).toBe(3);
  expect(() => fn.mock.mockImplementationOnce((): number => 4, 1)).toThrow(/onCall/);
  fn.mock.resetCalls();
  expect(fn.mock.callCount()).toBe(0);
  fn.mock.restore();
  expect(fn()).toBe(1);
});
