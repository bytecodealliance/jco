import { expect, test } from "vitest";
import native from "node:v8";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("reads the real host version tag and denies without a provider", () => {
  expect(v8.cachedDataVersionTag()).toBe(native.cachedDataVersionTag());
  expect(() => blocked.cachedDataVersionTag()).toThrow(expect.objectContaining(deniedError));
});
