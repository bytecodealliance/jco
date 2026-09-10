import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isFloat32Array agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new Float32Array(1)];
  for (const value of [
    ...positive,
    null,
    undefined,
    0,
    false,
    "x",
    1n,
    Symbol(),
    {},
    [],
    () => {},
  ]) {
    expect(util.types.isFloat32Array(value)).toBe(native.types.isFloat32Array(value));
  }
});
