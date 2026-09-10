import { expect } from "vitest";
import { util, test } from "../helpers/util.js";

test("TextDecoder reuses the engine constructor", () => {
  expect(util.TextDecoder).toBe(globalThis.TextDecoder);
  expect(new util.TextDecoder().decode(new Uint8Array([240, 159, 140, 141]))).toBe("🌍");
  expect(() =>
    new util.TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array([255])),
  ).toThrow(TypeError);
});
