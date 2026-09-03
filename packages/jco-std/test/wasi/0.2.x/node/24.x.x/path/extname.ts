import { expect, test } from "vitest";

import { describeDifferential } from "../helpers/assert.js";
import { flavors, path } from "../helpers/path.js";

const inputs = [
  "",
  ".",
  "..",
  "...",
  "/",
  "a",
  "a.",
  "a..",
  "a.b",
  "a..b",
  "a.b.c",
  ".bashrc",
  "..bashrc",
  "a/.b",
  "a/..b",
  "/a/b.txt",
  "/a/b.txt/",
  "dir.d/file",
  "dir/file.tar.gz",
  "C:\\a\\b.txt",
  "\\\\server\\share\\a.b",
];

describeDifferential("path.extname", () => {
  for (const [flavor, actual, expected] of flavors()) {
    test.concurrent(`matches Node ${flavor}`, () => {
      for (const input of inputs) {
        expect(actual.extname(input), input).toBe(expected.extname(input));
      }
    });
  }

  test.concurrent("rejects non-string arguments the way Node does", () => {
    const module = path();
    for (const invalid of [1, null, undefined, {}]) {
      expect(() => module.extname(invalid as never)).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
      );
    }
  });
});
