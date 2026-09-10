import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("skip aliases prevent callbacks and preserve reasons", async () => {
  const h = harness();
  let touched = false;
  await h.test.skip("skipped", (): void => {
    touched = true;
  });
  await h.test("reason", { skip: "later" }, (): void => {
    touched = true;
  });
  await h.test.suite.skip("suite", (): void => {
    touched = true;
  });
  await h.drain();
  expect(touched).toBe(false);
  expect(h.results().map((r) => r.skip)).toEqual([true, "later", true]);
});
