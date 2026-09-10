import { expect } from "vitest";
import { util, native, test, capture } from "../helpers/util.js";

test("stripVTControlCharacters handles ANSI and OSC sequences", () => {
  for (const value of [
    "plain",
    "\x1b[31mred\x1b[0m",
    "\x1b]8;;https://example.com\x07label\x1b]8;;\x07",
    "\x1b[2K🌍",
  ]) {
    expect(util.stripVTControlCharacters(value)).toBe(native.stripVTControlCharacters(value));
  }
  expect(capture(() => Reflect.apply(util.stripVTControlCharacters, undefined, [1]))).toEqual(
    capture(() => Reflect.apply(native.stripVTControlCharacters, undefined, [1])),
  );
});
