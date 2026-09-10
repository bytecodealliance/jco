import { expect, test } from "vitest";
import { MockTracker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/mock.js";
test("module mocking does not access loader options or deprecated exports", () => {
  const tracker = new MockTracker();
  let touched = false;
  expect(() =>
    tracker.module("node:fs", {
      get namedExports(): object {
        touched = true;
        throw new Error("getter");
      },
    }),
  ).toThrow(/runtime loader hooks/);
  expect(touched).toBe(false);
});
