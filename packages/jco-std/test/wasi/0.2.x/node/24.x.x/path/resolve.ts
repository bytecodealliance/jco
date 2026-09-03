import { expect, test, vi } from "vitest";

import { createPath } from "../../../../../../src/wasi/0.2.x/node/24.x.x/path.js";
import { describeDifferential } from "../helpers/assert.js";
import { flavors, path } from "../helpers/path.js";

// Node's resolve() falls back to process.cwd(); the shim falls back to its injected cwd, so the
// oracle is given that cwd as its first segment, which resolve() treats identically.
const inputs: string[][] = [
  [],
  [""],
  ["."],
  [".."],
  ["a"],
  ["a", "b"],
  ["a", "..", "b"],
  ["a/b", "../c"],
  ["/a"],
  ["/a", "b"],
  ["/a", "/b"],
  ["/a/b", "..", "..", "c"],
  ["a", "/b", "c"],
  ["C:\\a"],
  ["C:\\a", "b"],
  ["C:\\a", "D:\\b"],
  ["C:\\a", "\\b"],
  ["\\\\server\\share\\a", "..\\b"],
  ["a\\b", "c"],
];

describeDifferential("path.resolve", () => {
  for (const [flavor, actual, expected, cwd] of flavors()) {
    test.concurrent(`matches Node ${flavor} against the injected cwd`, () => {
      for (const segments of inputs) {
        expect(actual.resolve(...segments), JSON.stringify(segments)).toBe(
          expected.resolve(cwd, ...segments),
        );
      }
    });
  }

  test.concurrent("reads the initial cwd lazily and only when a result is relative", () => {
    const initialCwd = vi.fn(() => "/workspace/project");
    const module = createPath({ initialCwd, getEnvironment: () => [] });
    expect(module.resolve("/absolute", "file.js")).toBe("/absolute/file.js");
    expect(initialCwd).not.toHaveBeenCalled();
    expect(module.resolve("src", "index.js")).toBe("/workspace/project/src/index.js");
    expect(initialCwd).toHaveBeenCalledOnce();
  });

  test.concurrent("fails clearly when a relative result needs an unavailable cwd", () => {
    const module = path(() => undefined);
    expect(() => module.resolve("relative")).toThrow(/wasi:cli\/environment initial-cwd/);
    expect(module.resolve("/absolute")).toBe("/absolute");
  });

  test.concurrent("validates segments from right to left like Node", () => {
    const module = path();
    let caught: unknown;
    try {
      module.resolve("ok", 1 as never, false as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
    expect(String(caught)).toContain('The "paths[2]" argument');
  });
});
