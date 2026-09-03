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
  "a//",
  "/a/b.txt",
  "/a/b.txt/",
  "a.b",
  "a..",
  ".bashrc",
  "a/.b",
  "dir/file.tar.gz",
  "C:\\a\\b.txt",
  "C:b.txt",
  "\\\\server\\share\\a",
  "/\\a//b\\",
];
const suffixes = ["", ".txt", ".gz", ".bashrc", "a", "...", "b.txt"];

describeDifferential("path.basename", () => {
  for (const [flavor, actual, expected] of flavors()) {
    test.concurrent(`matches Node ${flavor} with and without a suffix`, () => {
      for (const input of inputs) {
        expect(actual.basename(input), input).toBe(expected.basename(input));
        for (const suffix of suffixes) {
          expect(actual.basename(input, suffix), `${input} minus ${suffix}`).toBe(
            expected.basename(input, suffix),
          );
        }
      }
    });
  }

  test.concurrent("rejects non-string arguments the way Node does", () => {
    const module = path();
    for (const invalid of [1, null, undefined, {}]) {
      expect(() => module.basename(invalid as never)).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
      );
    }
    expect(() => module.basename("ok", 1 as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });
});
