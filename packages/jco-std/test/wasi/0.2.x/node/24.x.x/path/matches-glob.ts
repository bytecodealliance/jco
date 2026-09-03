import { expect, test } from "vitest";

import { describeDifferential } from "../helpers/assert.js";
import { flavors, path } from "../helpers/path.js";

const posixInputs: Array<[string, string]> = [
  ["src/component.js", "**/*.js"],
  ["src/component.ts", "**/*.{js,ts}"],
  ["src/component.md", "**/*.{js,ts}"],
  ["test/a/path.js", "test/**/[a-z]*.js"],
  ["test/A/path.js", "test/**/[a-z]*.js"],
  ["literal[1].js", "literal[[]1].js"],
  [".git/config", "**/*"],
  ["foo/bar", "foo/**"],
  ["foo", "foo/**"],
  ["a/b/c", "a/*/c"],
  ["a/b/c", "a/*"],
  ["file.js", "file.?s"],
  ["file.mjs", "file.?s"],
];

const win32Inputs: Array<[string, string]> = [
  ["SRC\\component.js", "src\\*.js"],
  ["src\\component.js", "src\\*.js"],
  ["test\\a\\path.js", "test\\**\\*.js"],
  ["a\\b.js", "**\\*.js"],
  ["a/b.js", "**\\*.js"],
  ["C:\\a\\b.js", "C:\\**\\*.js"],
];

describeDifferential("path.matchesGlob", () => {
  for (const [flavor, actual, expected] of flavors()) {
    const inputs = flavor === "posix" ? posixInputs : win32Inputs;
    test.concurrent(`matches Node ${flavor}`, () => {
      for (const [value, pattern] of inputs) {
        expect(actual.matchesGlob(value, pattern), `${value} ~ ${pattern}`).toBe(
          expected.matchesGlob(value, pattern),
        );
      }
    });
  }

  test.concurrent("rejects non-string arguments the way Node does", () => {
    const module = path();
    expect(() => module.matchesGlob(1 as never, "*")).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    expect(() => module.matchesGlob("ok", 1 as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });
});
