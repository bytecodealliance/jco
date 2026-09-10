import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isUint8Array agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new Uint8Array(1)];
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
    expect(util.types.isUint8Array(value)).toBe(native.types.isUint8Array(value));
  }
});
