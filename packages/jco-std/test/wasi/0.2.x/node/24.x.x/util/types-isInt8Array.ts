import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isInt8Array agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new Int8Array(1)];
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
    expect(util.types.isInt8Array(value)).toBe(native.types.isInt8Array(value));
  }
});
