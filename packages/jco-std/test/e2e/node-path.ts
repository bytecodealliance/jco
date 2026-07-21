import nodePath from "node:path";
import { describe, expect, test, vi } from "vitest";
import { createPath, type PathModule } from "../../src/node/path.js";

const lexicalCases = ["", ".", "..", "/", "/foo//bar/..", "foo/bar/", ".bashrc", "a.tar.gz"];
const windowsCases = [
  "",
  ".",
  "C:\\",
  "C:\\foo\\bar\\..",
  "foo\\bar\\",
  "\\\\server\\share\\foo",
  ".bashrc",
  "a.tar.gz",
];

function factory(initialCwd: () => string | undefined = () => "/workspace") {
  return createPath({ initialCwd, getEnvironment: () => [] });
}

function compareLexical(actual: PathModule, expected: typeof nodePath.posix, cases: string[]) {
  for (const value of cases) {
    expect(actual.normalize(value)).toBe(expected.normalize(value));
    expect(actual.dirname(value)).toBe(expected.dirname(value));
    expect(actual.basename(value)).toBe(expected.basename(value));
    expect(actual.extname(value)).toBe(expected.extname(value));
    expect(actual.parse(value)).toEqual(expected.parse(value));
  }
}

describe("node:path factory", () => {
  test("matches Node 24 lexical POSIX behavior", () => {
    compareLexical(factory(), nodePath.posix, lexicalCases);
  });

  test("matches Node 24 lexical Windows behavior", () => {
    compareLexical(factory().win32, nodePath.win32, windowsCases);
  });

  test("uses POSIX as the default and preserves Node namespace identities", () => {
    const path = factory();
    expect(path.sep).toBe("/");
    expect(path.posix).toBe(path);
    expect(path.posix.posix).toBe(path.posix);
    expect(path.win32.win32).toBe(path.win32);
    expect(path.win32.posix).toBe(path.posix);
    expect(path.posix.win32).toBe(path.win32);
  });

  test("does not access WASI providers for lexical operations", () => {
    const fail = vi.fn(() => {
      throw new Error("provider accessed");
    });
    const path = createPath({ initialCwd: fail, getEnvironment: fail });
    compareLexical(path, nodePath.posix, lexicalCases);
    compareLexical(path.win32, nodePath.win32, windowsCases);
    expect(fail).not.toHaveBeenCalled();
  });

  test("reads initial cwd lazily for relative resolution", () => {
    const initialCwd = vi.fn(() => "/workspace/project");
    const path = factory(initialCwd);
    expect(path.resolve("src", "index.js")).toBe("/workspace/project/src/index.js");
    expect(initialCwd).toHaveBeenCalledOnce();
    initialCwd.mockClear();
    expect(path.resolve("/absolute", "file.js")).toBe("/absolute/file.js");
    expect(initialCwd).not.toHaveBeenCalled();
  });

  test("fails clearly when an operation requires an unavailable cwd", () => {
    const path = factory(() => undefined);
    expect(() => path.resolve("relative")).toThrow(/wasi:cli\/environment initial-cwd/);
    expect(path.resolve("/absolute")).toBe("/absolute");
  });

  test("uses per-drive Windows working directories", () => {
    const path = createPath({
      initialCwd: () => "D:\\workspace",
      getEnvironment: () => [["=C:", "C:\\users\\me"]],
    });
    expect(path.win32.resolve("C:src")).toBe("C:\\users\\me\\src");
  });

  test("validates argument types", () => {
    const path = factory();
    expect(() => path.join("ok", 1 as unknown as string)).toThrow(TypeError);
    expect(() => path.basename("ok", 1 as unknown as string)).toThrow(TypeError);
    expect(() => path.format(null as unknown as nodePath.FormatInputPathObject)).toThrow(TypeError);
  });

  test.each([
    ["src/component.js", "**/*.js"],
    ["src/component.ts", "**/*.{js,ts}"],
    ["test/a/path.js", "test/**/[a-z]*.js"],
    ["literal[1].js", "literal[[]1].js"],
  ])("matches Node 24 POSIX glob behavior for %s", (value, pattern) => {
    expect(factory().matchesGlob(value, pattern)).toBe(nodePath.posix.matchesGlob(value, pattern));
  });

  test.each([
    ["SRC\\component.js", "src\\*.js"],
    ["test\\a\\path.js", "test\\**\\*.js"],
  ])("matches Node 24 Windows glob behavior for %s", (value, pattern) => {
    expect(factory().win32.matchesGlob(value, pattern)).toBe(
      nodePath.win32.matchesGlob(value, pattern),
    );
  });
});
