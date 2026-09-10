import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("before hooks complete once before children and propagate failures", async () => {
  const h = harness();
  const order: string[] = [];
  h.test.before(async (): Promise<void> => {
    await Promise.resolve();
    order.push("root");
  });
  await h.test("parent", async (t): Promise<void> => {
    t.before((_ctx, done): void => {
      order.push("before");
      done();
    });
    await t.test("one", (): void => {
      order.push("one");
    });
    await t.test("two", (): void => {
      order.push("two");
    });
  });
  await h.drain();
  expect(order).toEqual(["root", "before", "one", "two"]);
  const broken = harness();
  broken.test.suite("broken", (): void => {
    broken.test.before((): never => {
      throw new Error("before");
    });
    broken.test("never", (): never => {
      throw new Error("body");
    });
  });
  await broken.drain();
  expect(broken.results().at(-1)?.details.error?.failureType).toBe("hookFailed");
});
test("context.before starts synchronously and root failures apply to every test", async () => {
  const h = harness();
  const order: string[] = [];
  await h.test("before", (t): void => {
    t.before((): void => {
      order.push("before");
    });
    order.push("body");
  });
  await h.drain();
  expect(order).toEqual(["before", "body"]);
  const broken = harness();
  let ran = false;
  broken.test.before((): never => {
    throw new Error("setup");
  });
  await Promise.all([
    broken.test("one", (): void => {
      ran = true;
    }),
    broken.test("two", (): void => {
      ran = true;
    }),
  ]);
  await broken.drain();
  expect(ran).toBe(false);
  expect(broken.results().map((r) => r.details.error?.failureType)).toEqual([
    "hookFailed",
    "hookFailed",
  ]);
});
