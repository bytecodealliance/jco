import { expect, test } from "vitest";

import type { FormatInputPathObject } from "../../../../../../src/wasi/0.2.x/node/24.x.x/path.js";
import { describeDifferential } from "../helpers/assert.js";
import { flavors, path } from "../helpers/path.js";

const inputs: FormatInputPathObject[] = [
  {},
  { root: "/" },
  { dir: "/a" },
  { base: "b.txt" },
  { root: "/", dir: "/a", base: "b.txt" },
  { root: "/", dir: "/a", name: "b", ext: ".txt" },
  { dir: "/a", name: "b", ext: "txt" },
  { dir: "/a", name: "b", ext: ".txt", base: "wins.md" },
  { root: "/", base: "b.txt" },
  { name: ".bashrc", ext: "" },
  { name: "b", ext: "." },
  { root: "C:\\", dir: "C:\\a", name: "b", ext: ".txt" },
  { root: "\\\\server\\share\\", dir: "\\\\server\\share\\a", base: "b" },
  { dir: "a", name: "b" },
];

describeDifferential("path.format", () => {
  for (const [flavor, actual, expected] of flavors()) {
    test.concurrent(`matches Node ${flavor}`, () => {
      for (const input of inputs) {
        expect(actual.format(input), JSON.stringify(input)).toBe(expected.format(input));
      }
    });
  }

  test.concurrent("rejects a non-object argument the way Node does", () => {
    const module = path();
    for (const invalid of [null, undefined, "a", 1]) {
      expect(() => module.format(invalid as never)).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
      );
    }
  });
});
