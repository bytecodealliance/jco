import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isDate agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new Date(), new Date(NaN)];
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
    expect(util.types.isDate(value)).toBe(native.types.isDate(value));
  }
});
