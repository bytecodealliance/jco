import nodePath from "node:path";
import { cwd } from "node:process";
import { describe, expect, test, vi } from "vitest";

import {
  createPath,
  type FormatInputPathObject,
  type PathModule,
} from "../../src/wasi/0.2.x/node/24.x.x/path.js";

const pathCases = [
  "",
  ".",
  "..",
  "...",
  "/",
  "//",
  "///",
  "a",
  "a/",
  "a//",
  "a/.",
  "a/..",
  "a/...",
  "a//b",
  "/a//b",
  "/a/..",
  ".bashrc",
  "..bashrc",
  "a.",
  "a..",
  "a.b",
  "a..b",
  "a/.b",
  "a/..b",
  "a/b/../../..",
  "//server/share/a",
  "C:",
  "C:/",
  "C:\\",
  "C:a",
  "C:/a",
  "C:\\a",
  "\\a",
  "\\\\server\\share",
  "\\\\server\\share\\a",
  "/\\a//b\\",
  "\\?\\C:\\foo",
  "\\.\\pipe\\x",
];

const formatCases: FormatInputPathObject[] = [
  {},
  { root: "/", dir: "/a", base: "b.txt" },
  { dir: "/a", name: "b", ext: "txt" },
  { root: "C:\\", dir: "C:\\a", name: "b", ext: ".txt" },
  { name: ".bashrc", ext: "" },
];

function factory(initialCwd: () => string | undefined = () => "/workspace"): PathModule {
  return createPath({ initialCwd, getEnvironment: () => [] });
}

function compareUnary(
  actual: PathModule,
  expected: typeof nodePath.posix,
  compareNamespacedPath = true,
): void {
  for (const value of pathCases) {
    expect(actual.normalize(value)).toBe(expected.normalize(value));
    expect(actual.dirname(value)).toBe(expected.dirname(value));
    expect(actual.basename(value)).toBe(expected.basename(value));
    expect(actual.extname(value)).toBe(expected.extname(value));
    expect(actual.parse(value)).toEqual(expected.parse(value));
    expect(actual.isAbsolute(value)).toBe(expected.isAbsolute(value));
    if (compareNamespacedPath) {
      expect(actual.toNamespacedPath(value)).toBe(expected.toNamespacedPath(value));
    }
  }
}

function compareComposed(actual: PathModule, expected: typeof nodePath.posix): void {
  const pairs = [
    ["", ""],
    [".", ".."],
    ["/a/b", "/a/c"],
    ["/a", "../../b"],
    ["C:\\a", "C:\\b"],
    ["C:\\a", "D:\\b"],
    ["\\\\server\\share\\a", "..\\b"],
  ] as const;

  for (const [from, to] of pairs) {
    expect(actual.join(from, to)).toBe(expected.join(from, to));
    expect(actual.relative(from, to)).toBe(expected.relative(from, to));
  }

  for (const value of pathCases) {
    for (const suffix of ["", ".js", ".bashrc", "a", "..."]) {
      expect(actual.basename(value, suffix)).toBe(expected.basename(value, suffix));
    }
  }

  for (const pathObject of formatCases) {
    expect(actual.format(pathObject)).toBe(expected.format(pathObject));
  }
}

function expectInvalidArgType(operation: () => unknown): void {
  try {
    operation();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(TypeError);
    expect(error).toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
    return;
  }
  throw new Error("expected ERR_INVALID_ARG_TYPE");
}

describe("node:path factory", () => {
  test.concurrent("matches the complete Node 24 module surface", () => {
    const path = factory();
    expect(Object.keys(path)).toEqual(Object.keys(nodePath));
    expect(Object.keys(path.posix)).toEqual(Object.keys(nodePath.posix));
    expect(Object.keys(path.win32)).toEqual(Object.keys(nodePath.win32));
    expect(path._makeLong).toBe(path.toNamespacedPath);
    expect(path.posix._makeLong).toBe(path.posix.toNamespacedPath);
    expect(path.win32._makeLong).toBe(path.win32.toNamespacedPath);
  });

  test.concurrent("matches Node 24 POSIX algorithms", () => {
    const path = factory(cwd).posix;
    compareUnary(path, nodePath.posix);
    compareComposed(path, nodePath.posix);
  });

  test.concurrent("matches Node 24 Windows algorithms", () => {
    const path = factory(cwd).win32;
    compareUnary(path, nodePath.win32);
    compareComposed(path, nodePath.win32);
  });

  test.concurrent("uses POSIX as the WASI default and preserves namespace identities", () => {
    const path = factory();
    expect(path.sep).toBe("/");
    expect(path.delimiter).toBe(":");
    expect(path.posix).toBe(path);
    expect(path.posix.posix).toBe(path.posix);
    expect(path.win32.win32).toBe(path.win32);
    expect(path.win32.posix).toBe(path.posix);
    expect(path.posix.win32).toBe(path.win32);
  });

  test.concurrent("does not access WASI providers for lexical operations", () => {
    const fail = vi.fn((): never => {
      throw new Error("provider accessed");
    });
    const path = createPath({ initialCwd: fail, getEnvironment: fail });
    compareUnary(path, nodePath.posix, false);
    compareUnary(path.win32, nodePath.win32, false);
    expect(fail).not.toHaveBeenCalled();
  });

  test.concurrent("reads initial cwd lazily only when resolution needs it", () => {
    const initialCwd = vi.fn(() => "/workspace/project");
    const path = factory(initialCwd);
    expect(path.resolve("src", "index.js")).toBe("/workspace/project/src/index.js");
    expect(initialCwd).toHaveBeenCalledOnce();

    initialCwd.mockClear();
    expect(path.resolve("/absolute", "file.js")).toBe("/absolute/file.js");
    expect(path.relative("/absolute/a", "/absolute/b")).toBe("../b");
    expect(initialCwd).not.toHaveBeenCalled();
  });

  test.concurrent("fails clearly when an operation requires an unavailable cwd", () => {
    const path = factory(() => undefined);
    expect(() => path.resolve("relative")).toThrow(/wasi:cli\/environment initial-cwd/);
    expect(path.resolve("/absolute")).toBe("/absolute");
  });

  test.concurrent("uses case-insensitive per-drive Windows working directories", () => {
    const getEnvironment = vi.fn((): Array<[string, string]> => [["=c:", "C:\\users\\me"]]);
    const path = createPath({
      initialCwd: () => "D:\\workspace",
      getEnvironment,
    });
    expect(path.win32.resolve("C:src")).toBe("C:\\users\\me\\src");
    expect(getEnvironment).toHaveBeenCalledOnce();
  });

  test.concurrent("validates factory providers before returning a module", () => {
    expect(() => createPath(undefined as unknown as Parameters<typeof createPath>[0])).toThrow(
      /initialCwd and getEnvironment providers/,
    );
    expect(() => createPath({ initialCwd: () => "/", getEnvironment: undefined as never })).toThrow(
      /initialCwd and getEnvironment providers/,
    );
  });

  test.concurrent("uses Node-style type errors and validation order", () => {
    const path = factory();
    expectInvalidArgType(() => path.join("ok", 1 as unknown as string));
    expectInvalidArgType(() => path.basename("ok", 1 as unknown as string));
    expectInvalidArgType(() => path.format(null as unknown as FormatInputPathObject));
    expectInvalidArgType(() => path.matchesGlob("ok", 1 as unknown as string));

    try {
      path.resolve("ok", 1 as unknown as string, false as unknown as string);
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
      expect(String(error)).toContain('The "paths[2]" argument');
      return;
    }
    throw new Error("expected resolve() to validate from right to left");
  });

  test.each([
    ["src/component.js", "**/*.js"],
    ["src/component.ts", "**/*.{js,ts}"],
    ["test/a/path.js", "test/**/[a-z]*.js"],
    ["literal[1].js", "literal[[]1].js"],
    [".git/config", "**/*"],
    ["foo/bar", "foo/**"],
  ])("matches Node 24 POSIX glob behavior for %s", (value, pattern) => {
    expect(factory().matchesGlob(value, pattern)).toBe(nodePath.posix.matchesGlob(value, pattern));
  });

  test.each([
    ["SRC\\component.js", "src\\*.js"],
    ["test\\a\\path.js", "test\\**\\*.js"],
    ["a\\b.js", "**\\*.js"],
  ])("matches Node 24 Windows glob behavior for %s", (value, pattern) => {
    expect(factory().win32.matchesGlob(value, pattern)).toBe(
      nodePath.win32.matchesGlob(value, pattern),
    );
  });
});
