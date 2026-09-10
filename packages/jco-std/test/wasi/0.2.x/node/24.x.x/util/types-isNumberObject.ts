import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isNumberObject agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [Object(1)];
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
    expect(util.types.isNumberObject(value)).toBe(native.types.isNumberObject(value));
  }
});
