import { expect, test } from "vitest";

import { describeDifferential } from "../helpers/assert.js";
import { flavors, path } from "../helpers/path.js";

const inputs: string[][] = [
  [],
  [""],
  ["", ""],
  ["."],
  [".", ".."],
  ["a"],
  ["a", "b"],
  ["a/", "/b"],
  ["a", "", "b"],
  ["/a", "b", "../c"],
  ["/a/b", "../../.."],
  ["a", "b", "..", "..", "..", "c"],
  ["/", "//", "///a"],
  ["C:\\a", "C:\\b"],
  ["C:", "a"],
  ["\\\\server\\share\\a", "..\\b"],
  ["//server/share", "a"],
  ["a\\b", "c/d"],
];

describeDifferential("path.join", () => {
  for (const [flavor, actual, expected] of flavors()) {
    test.concurrent(`matches Node ${flavor}`, () => {
      for (const segments of inputs) {
        expect(actual.join(...segments), JSON.stringify(segments)).toBe(expected.join(...segments));
      }
    });
  }

  test.concurrent("rejects a non-string segment the way Node does", () => {
    const module = path();
    expect(() => module.join("ok", 1 as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    expect(() => module.join(null as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });
});
