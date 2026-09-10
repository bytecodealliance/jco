import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isGeneratorObject agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [(function* g() {})(), (async function* g() {})()];
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
    expect(util.types.isGeneratorObject(value)).toBe(native.types.isGeneratorObject(value));
  }
});
