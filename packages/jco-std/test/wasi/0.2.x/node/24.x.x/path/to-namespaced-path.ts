import { expect, test } from "vitest";

import { describeDifferential } from "../helpers/assert.js";
import { flavors, path } from "../helpers/path.js";

// POSIX returns its input unchanged; Windows resolves the input (against the cwd when it is
// relative) and prefixes the result with the \\?\ namespace, so the win32 oracle resolves against
// the shim's injected cwd first.
const inputs = [
  "",
  ".",
  "a",
  "a/b",
  "/a/b",
  // Drive-relative inputs ("C:", "C:a") are deliberately absent: Node resolves them through the
  // real process cwd or a per-drive environment entry, which a fixed injected cwd cannot model.
  // The per-drive working-directory behaviour is covered in test/e2e/node-path.ts.
  "C:\\",
  "C:\\a\\b",
  "\\a",
  "\\\\server\\share",
  "\\\\server\\share\\a",
  "\\\\?\\C:\\already",
  "\\\\.\\pipe\\x",
  "/\\a//b\\",
];

describeDifferential("path.toNamespacedPath", () => {
  for (const [flavor, actual, expected, cwd] of flavors()) {
    test.concurrent(`matches Node ${flavor}`, () => {
      for (const input of inputs) {
        // Node short-circuits the empty string before resolving, so only non-empty win32 inputs
        // take the cwd-adjusted oracle.
        const oracle =
          flavor === "win32" && input.length > 0
            ? expected.toNamespacedPath(expected.resolve(cwd, input))
            : expected.toNamespacedPath(input);
        expect(actual.toNamespacedPath(input), input).toBe(oracle);
      }
    });
  }

  test.concurrent("passes non-strings through like Node instead of validating", () => {
    const module = path();
    for (const value of [1, null, undefined, {}]) {
      expect(module.toNamespacedPath(value as never)).toBe(value);
      expect(module.win32.toNamespacedPath(value as never)).toBe(value);
    }
  });
});
