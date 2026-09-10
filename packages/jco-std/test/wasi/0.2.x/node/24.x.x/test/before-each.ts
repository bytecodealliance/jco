import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("beforeEach inherits outer-to-inner and sees the test context", async () => {
  const h = harness();
  const order: string[] = [];
  h.test.beforeEach((t): void => {
    order.push(`outer:${t.name}`);
  });
  h.test.suite("suite", (): void => {
    h.test.beforeEach((t): void => {
      order.push(`inner:${t.name}`);
    });
    h.test("one");
    h.test.skip("skip");
    h.test("two");
  });
  await h.drain();
  expect(order).toEqual(["outer:one", "inner:one", "outer:two", "inner:two"]);
});
