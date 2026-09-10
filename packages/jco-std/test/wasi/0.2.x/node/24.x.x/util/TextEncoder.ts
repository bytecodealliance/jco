import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("TextEncoder reuses the engine constructor", () => {
  expect(util.TextEncoder).toBe(globalThis.TextEncoder);
  expect(new util.TextEncoder().encode("🌍")).toEqual(new native.TextEncoder().encode("🌍"));
});
