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
  "a/",
  "a.b",
  "a..",
  ".bashrc",
  "/a/b.txt",
  "/a/b.txt/",
  "/a//b",
  "dir/file.tar.gz",
  "C:",
  "C:/",
  "C:\\",
  "C:a",
  "C:\\a\\b.txt",
  "\\\\server\\share",
  "\\\\server\\share\\a.b",
  "/\\a//b\\",
];

describeDifferential("path.parse", () => {
  for (const [flavor, actual, expected] of flavors()) {
    test.concurrent(`matches Node ${flavor} field for field`, () => {
      for (const input of inputs) {
        expect(actual.parse(input), input).toEqual(expected.parse(input));
      }
    });

    test.concurrent(`round-trips through format on ${flavor}`, () => {
      for (const input of inputs) {
        expect(actual.format(actual.parse(input)), input).toBe(
          expected.format(expected.parse(input)),
        );
      }
    });
  }

  test.concurrent("rejects non-string arguments the way Node does", () => {
    const module = path();
    for (const invalid of [1, null, undefined, {}]) {
      expect(() => module.parse(invalid as never)).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
      );
    }
  });
});
