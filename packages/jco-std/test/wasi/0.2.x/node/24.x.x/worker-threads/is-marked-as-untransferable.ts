import { expect, test } from "vitest";
import { portable } from "../helpers/worker-threads.js";

test("isMarkedAsUntransferable distinguishes object identity and ignores primitive marking", () => {
  const api = portable().workerThreads;
  for (const value of [undefined, null, 0, false, "x", Symbol("x")]) {
    api.markAsUntransferable(value);
    expect(api.isMarkedAsUntransferable(value)).toBe(false);
  }
  const object = {};
  api.markAsUntransferable(object);
  expect(api.isMarkedAsUntransferable({})).toBe(false);
});
