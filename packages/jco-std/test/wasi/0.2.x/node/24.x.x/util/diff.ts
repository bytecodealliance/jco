import { expect } from "vitest";
import { util, native, test, capture } from "../helpers/util.js";

test("diff preserves Node Myers tie-breaking and empty inputs", () => {
  const cases: [string | string[], string | string[]][] = [
    ["abc", "adc"],
    ["", "x"],
    ["x", ""],
    ["", ""],
    [
      ["a", "b"],
      ["b", "c"],
    ],
    [["a"], ["a"]],
    ["🌍x", "🌍y"],
  ];
  for (const [a, b] of cases) {
    expect(util.diff(a, b)).toEqual(native.diff(a, b));
  }
  expect(capture(() => Reflect.apply(util.diff, undefined, [1, "a"]))).toEqual(
    capture(() => Reflect.apply(native.diff, undefined, [1, "a"])),
  );
});
