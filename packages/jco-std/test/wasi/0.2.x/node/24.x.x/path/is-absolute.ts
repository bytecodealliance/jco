import { expect, test } from "vitest";

import { describeDifferential } from "../helpers/assert.js";
import { flavors, path } from "../helpers/path.js";

const inputs = [
  "",
  ".",
  "..",
  "/",
  "//",
  "a",
  "a/b",
  "/a",
  "/a/b",
  "./a",
  "../a",
  "C:",
  "C:/",
  "C:\\",
  "C:a",
  "C:/a",
  "C:\\a",
  "\\a",
  "/a",
  "\\\\server\\share",
  "\\\\server\\share\\a",
  "//server/share/a",
  "\\?\\C:\\foo",
  "\\.\\pipe\\x",
];

describeDifferential("path.isAbsolute", () => {
  for (const [flavor, actual, expected] of flavors()) {
    test.concurrent(`matches Node ${flavor}`, () => {
      for (const input of inputs) {
        expect(actual.isAbsolute(input), input).toBe(expected.isAbsolute(input));
      }
    });
  }

  test.concurrent("rejects non-string arguments the way Node does", () => {
    const module = path();
    for (const invalid of [1, null, undefined, {}]) {
      expect(() => module.isAbsolute(invalid as never)).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
      );
    }
  });
});
