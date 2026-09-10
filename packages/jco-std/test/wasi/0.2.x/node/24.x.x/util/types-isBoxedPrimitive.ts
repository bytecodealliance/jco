import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isBoxedPrimitive agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [Object(1), Object("x"), Object(true), Object(1n), Object(Symbol())];
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
    expect(util.types.isBoxedPrimitive(value)).toBe(native.types.isBoxedPrimitive(value));
  }
});
