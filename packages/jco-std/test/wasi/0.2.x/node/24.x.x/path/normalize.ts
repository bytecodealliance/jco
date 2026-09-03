import { expect, test } from "vitest";

import { describeDifferential } from "../helpers/assert.js";
import { flavors, path } from "../helpers/path.js";

const inputs = [
  "",
  ".",
  "..",
  "...",
  "/",
  "//",
  "///",
  "./",
  "../",
  "a",
  "a/",
  "a//",
  "a/.",
  "a/..",
  "a/...",
  "a//b",
  "/a//b",
  "/a/..",
  "/a/../..",
  "a/b/../../..",
  "./a/./b/./",
  "//server/share/a",
  "C:",
  "C:/",
  "C:\\",
  "C:a",
  "C:/a",
  "C:\\a\\..\\b",
  "\\a",
  "\\\\server\\share",
  "\\\\server\\share\\a\\..\\b",
  "/\\a//b\\",
  "\\?\\C:\\foo",
  "\\.\\pipe\\x",
];

describeDifferential("path.normalize", () => {
  for (const [flavor, actual, expected] of flavors()) {
    test.concurrent(`matches Node ${flavor}`, () => {
      for (const input of inputs) {
        expect(actual.normalize(input), input).toBe(expected.normalize(input));
      }
    });
  }

  test.concurrent("rejects non-string arguments the way Node does", () => {
    const module = path();
    for (const invalid of [1, null, undefined, {}]) {
      expect(() => module.normalize(invalid as never)).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
      );
    }
  });
});
