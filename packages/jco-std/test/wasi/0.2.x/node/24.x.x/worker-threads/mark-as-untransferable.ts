import { expect, test } from "vitest";
import { portable } from "../helpers/worker-threads.js";

test("markAsUntransferable is idempotent and does not change object properties", () => {
  const api = portable().workerThreads;
  const object = Object.freeze({});
  api.markAsUntransferable(object);
  api.markAsUntransferable(object);
  expect(api.isMarkedAsUntransferable(object)).toBe(true);
  expect(Object.keys(object)).toEqual([]);
});
