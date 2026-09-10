import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isInt16Array agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new Int16Array(1)];
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
    expect(util.types.isInt16Array(value)).toBe(native.types.isInt16Array(value));
  }
});
