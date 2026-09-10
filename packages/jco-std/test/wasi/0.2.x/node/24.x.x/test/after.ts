import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("after runs on success, failure and timeout, with mocks still installed", async () => {
  const h = harness();
  const order: string[] = [];
  const object = { value: (): number => 1 };
  h.test.after((): void => {
    order.push("root");
  });
  await h.test("failure", (t): never => {
    t.mock.method(object, "value", (): number => 2);
    t.after((): void => {
      order.push(`${t.passed}:${object.value()}`);
    });
    throw new Error("failure");
  });
  await h.drain();
  expect(order).toEqual(["false:2", "root"]);
  expect(object.value()).toBe(1);
  const timed = harness();
  let cleanup = false;
  await timed.test("timeout", { timeout: 2 }, async (t): Promise<void> => {
    t.after((): void => {
      cleanup = true;
    });
    await new Promise((): void => {});
  });
  await timed.drain();
  expect(cleanup).toBe(true);
});
