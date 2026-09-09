import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, errorOf } from "../helpers/process.js";
test("nextTick defers execution, forwards arguments, and validates callback", async () => {
  const order: string[] = [];
  process.nextTick((s: string, n: number) => order.push(s + n), "tick", 2);
  order.push("sync");
  await Promise.resolve();
  expect(order).toEqual(["sync", "tick2"]);
  expect(errorOf(() => Reflect.apply(process.nextTick, null, [1]))).toEqual(
    errorOf(() => Reflect.apply(nativeProcess.nextTick, null, [1])),
  );
});
