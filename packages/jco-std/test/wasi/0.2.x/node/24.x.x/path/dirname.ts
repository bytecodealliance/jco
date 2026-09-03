import { expect, test } from "vitest";

import { describeDifferential } from "../helpers/assert.js";
import { flavors, path } from "../helpers/path.js";

const inputs = [
  "",
  ".",
  "..",
  "/",
  "//",
  "///",
  "a",
  "a/",
  "a//",
  "a/b",
  "a//b",
  "/a/b",
  "/a/b/",
  "/a//b",
  "a/b/../c",
  ".bashrc",
  "C:",
  "C:/",
  "C:\\",
  "C:a",
  "C:\\a\\b",
  "\\\\server\\share",
  "\\\\server\\share\\a\\b",
  "/\\a//b\\",
];

describeDifferential("path.dirname", () => {
  for (const [flavor, actual, expected] of flavors()) {
    test.concurrent(`matches Node ${flavor}`, () => {
      for (const input of inputs) {
        expect(actual.dirname(input), input).toBe(expected.dirname(input));
      }
    });
  }

  test.concurrent("rejects non-string arguments the way Node does", () => {
    const module = path();
    for (const invalid of [1, null, undefined, {}]) {
      expect(() => module.dirname(invalid as never)).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
      );
    }
  });
});
