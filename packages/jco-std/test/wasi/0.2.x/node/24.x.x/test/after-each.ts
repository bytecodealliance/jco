import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("afterEach runs inner-to-outer, including failed tests", async () => {
  const h = harness();
  const order: string[] = [];
  h.test.afterEach((t): void => {
    order.push(`outer:${t.passed}`);
  });
  h.test.suite("suite", (): void => {
    h.test.afterEach((t): void => {
      order.push(`inner:${t.passed}`);
    });
    h.test("one", (): never => {
      throw new Error("failure");
    });
    h.test("two");
  });
  await h.drain();
  expect(order).toEqual(["inner:false", "outer:false", "inner:true", "outer:true"]);
});
