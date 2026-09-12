import { expect, test } from "vitest";
import { portable } from "../helpers/worker-threads.js";

test("setEnvironmentData preserves values without cloning, deletes undefined and isolates instances", () => {
  const a = portable().workerThreads;
  const b = portable().workerThreads;
  const key = {};
  const value = {
    action() {
      throw new Error("not evaluated");
    },
  };
  a.setEnvironmentData(key, value);
  expect(a.getEnvironmentData(key)).toBe(value);
  expect(b.getEnvironmentData(key)).toBeUndefined();
  a.setEnvironmentData(key);
  expect(a.getEnvironmentData(key)).toBeUndefined();
});
