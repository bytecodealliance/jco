import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("implicit context is scoped synchronously; explicit context survives awaits", async () => {
  const h = harness();
  expect(h.test.getTestContext()).toBeUndefined();
  h.test.suite("suite", (s): void => {
    expect(h.test.getTestContext()).toBe(s);
  });
  await h.test("test", async (t): Promise<void> => {
    expect(h.test.getTestContext()).toBe(t);
    await Promise.resolve();
    expect(h.test.getTestContext()).toBeUndefined();
    expect(() => h.test("implicit")).toThrow(/use t.test/);
    await t.test("explicit", (child): void => {
      expect(h.test.getTestContext()).toBe(child);
    });
  });
  await h.drain();
  expect(h.test.getTestContext()).toBeUndefined();
});
