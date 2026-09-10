import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("format follows substitutions and keeps unused percent sequences", () => {
  const cases: unknown[][] = [
    [],
    ["%%"],
    ["%%", 1],
    ["x %s %d %i %f", "a", 2, "2px", "3.5px"],
    ["%s", 1n],
    ["%j", { a: 1 }],
    ["%o", [1]],
    ["%O", { x: 1 }],
    ["%cX", "css"],
    [{ a: 1 }, "tail"],
    ["%s", "x", "tail"],
    ["%d", -0],
  ];
  for (const args of cases) {
    expect(util.format(...args)).toBe(native.format(...args));
  }
});

test("format applies numeric and custom string conversions", () => {
  class Custom {
    toString(): string {
      return "custom";
    }
  }

  const cases: unknown[][] = [
    ["%i", "0xff"],
    ["%i", "-0"],
    ["%f", "-0"],
    ["%s", -0],
    ["%s", new Custom()],
    ["%s", { toString: () => "own" }],
    ["%s", Object.create(null)],
    ["%s", new Date(0)],
  ];
  for (const args of cases) {
    expect(util.format(...args)).toBe(native.format(...args));
  }
});
