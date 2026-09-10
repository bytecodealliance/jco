import { expect } from "vitest";
import { util, native, test, capture } from "../helpers/util.js";

test("formatWithOptions passes inspection options through substitutions", () => {
  for (const options of [{ colors: true }, { depth: 0 }, { sorted: true }]) {
    expect(util.formatWithOptions(options, "%O", { z: 1, a: { b: 2 } })).toBe(
      native.formatWithOptions(options, "%O", { z: 1, a: { b: 2 } }),
    );
  }
  expect(capture(() => Reflect.apply(util.formatWithOptions, undefined, [null, "x"]))).toEqual(
    capture(() => Reflect.apply(native.formatWithOptions, undefined, [null, "x"])),
  );
});

test("formatWithOptions groups integers and fractions across numeric substitutions", () => {
  for (const value of [12345678.12345, 12345678n, -0, 1e-9]) {
    for (const placeholder of ["%s", "%d", "%i", "%f"]) {
      expect(util.formatWithOptions({ numericSeparator: true }, placeholder, value)).toBe(
        native.formatWithOptions({ numericSeparator: true }, placeholder, value),
      );
    }
  }
});
