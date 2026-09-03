import nodePath from "node:path";

import { describe, expect, test, vi } from "vitest";

import { createPath } from "../../../../../../src/wasi/0.2.x/node/24.x.x/path.js";
import { describeDifferential } from "../helpers/assert.js";
import { path } from "../helpers/path.js";

// Export, namespace, and identity contract only. Each public member's behaviour lives in its own
// file beside this one.

describeDifferential("node:path module contract", () => {
  test.concurrent("exposes Node's export keys on the default and both namespaces", () => {
    const module = path();
    expect(Object.keys(module)).toEqual(Object.keys(nodePath));
    expect(Object.keys(module.posix)).toEqual(Object.keys(nodePath.posix));
    expect(Object.keys(module.win32)).toEqual(Object.keys(nodePath.win32));
  });

  test.concurrent("defaults to POSIX and keeps every namespace identity", () => {
    const module = path();
    expect(module.sep).toBe(nodePath.posix.sep);
    expect(module.delimiter).toBe(nodePath.posix.delimiter);
    expect(module.win32.sep).toBe(nodePath.win32.sep);
    expect(module.win32.delimiter).toBe(nodePath.win32.delimiter);
    expect(module.posix).toBe(module);
    expect(module.posix.posix).toBe(module.posix);
    expect(module.win32.win32).toBe(module.win32);
    expect(module.posix.win32).toBe(module.win32);
    expect(module.win32.posix).toBe(module.posix);
  });

  test.concurrent("keeps Node's legacy _makeLong alias of toNamespacedPath", () => {
    const module = path();
    expect(module._makeLong).toBe(module.toNamespacedPath);
    expect(module.posix._makeLong).toBe(module.posix.toNamespacedPath);
    expect(module.win32._makeLong).toBe(module.win32.toNamespacedPath);
  });
});

describe("node:path factory", () => {
  test.concurrent("validates its providers before returning a module", () => {
    expect(() => createPath(undefined as never)).toThrow(/initialCwd and getEnvironment providers/);
    expect(() => createPath({ initialCwd: () => "/", getEnvironment: undefined as never })).toThrow(
      /initialCwd and getEnvironment providers/,
    );
    expect(() => createPath({ initialCwd: undefined as never, getEnvironment: () => [] })).toThrow(
      /initialCwd and getEnvironment providers/,
    );
  });

  test.concurrent("never touches its providers for lexical operations", () => {
    const fail = vi.fn((): never => {
      throw new Error("provider accessed");
    });
    const module = createPath({ initialCwd: fail, getEnvironment: fail });
    for (const namespace of [module.posix, module.win32]) {
      namespace.normalize("a/../b");
      namespace.join("a", "..", "b");
      namespace.dirname("/a/b");
      namespace.basename("/a/b.txt", ".txt");
      namespace.extname("a.b");
      namespace.parse("/a/b.txt");
      namespace.format({ dir: "/a", base: "b" });
      namespace.isAbsolute("/a");
      // toNamespacedPath is deliberately absent: on win32 a relative input resolves against the
      // cwd, so it is not lexical (see to-namespaced-path.ts).
      namespace.matchesGlob("a.js", "*.js");
    }
    expect(fail).not.toHaveBeenCalled();
  });
});
