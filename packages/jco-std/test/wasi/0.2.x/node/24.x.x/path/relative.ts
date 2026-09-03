import { expect, test } from "vitest";

import { describeDifferential } from "../helpers/assert.js";
import { flavors, path } from "../helpers/path.js";

// Node's relative() resolves both sides against process.cwd(); the shim uses its injected cwd, so
// the oracle resolves each side against that same cwd first.
const inputs: Array<[string, string]> = [
  ["", ""],
  [".", ".."],
  ["a", "a"],
  ["a", "b"],
  ["a/b", "a"],
  ["a", "a/b/c"],
  ["/a/b", "/a/c"],
  ["/a/b/c", "/a"],
  ["/a", "../../b"],
  ["/a/b", "/a/b"],
  ["/", "/a"],
  ["/a", "/"],
  ["C:\\a", "C:\\b"],
  ["C:\\a\\b", "C:\\a"],
  ["C:\\a", "D:\\b"],
  ["c:\\A", "C:\\a\\b"],
  ["\\\\server\\share\\a", "..\\b"],
  ["\\\\server\\share\\a", "\\\\other\\share\\a"],
];

describeDifferential("path.relative", () => {
  for (const [flavor, actual, expected, cwd] of flavors()) {
    test.concurrent(`matches Node ${flavor}`, () => {
      for (const [from, to] of inputs) {
        const oracle = expected.relative(expected.resolve(cwd, from), expected.resolve(cwd, to));
        expect(actual.relative(from, to), `${from} -> ${to}`).toBe(oracle);
      }
    });
  }

  test.concurrent("rejects non-string arguments the way Node does", () => {
    const module = path();
    expect(() => module.relative(1 as never, "a")).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    expect(() => module.relative("a", null as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });
});
