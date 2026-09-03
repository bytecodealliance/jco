import nodeModule from "node:module";

import { describe, expect, test } from "vitest";

import jcoModule from "../../../../../../src/wasi/0.2.x/node/24.x.x/module.js";

const UNSUPPORTED = "ERR_JCO_UNSUPPORTED_NODE_API";

describe("createRequire", () => {
  test.concurrent("succeeds, because code creates a require it may never call", () => {
    // Refusing here would break any module that writes `const require = createRequire(...)` at top
    // level and only requires something on a branch it does not take.
    expect(() => jcoModule.createRequire("/app/index.js")).not.toThrow();
    expect(typeof jcoModule.createRequire("/app/index.js")).toBe("function");
  });

  test.concurrent("has Node's own properties", () => {
    expect(Object.keys(jcoModule.createRequire("/app/index.js")).sort()).toEqual(
      Object.keys(nodeModule.createRequire("/app/index.js")).sort(),
    );
  });

  test.concurrent("main is undefined and cache is empty, as they genuinely are", () => {
    const require = jcoModule.createRequire("/app/index.js");
    expect(require.main).toBe(undefined);
    expect(Object.keys(require.cache)).toEqual([]);
  });

  test.concurrent("calling it refuses and points at static import", () => {
    const require = jcoModule.createRequire("/app/index.js");
    let error: (Error & { code?: string }) | undefined;
    try {
      require("node:path");
    } catch (thrown) {
      error = thrown as Error & { code?: string };
    }
    expect(error?.code).toBe(UNSUPPORTED);
    expect(error?.message).toContain("static `import`");
  });

  describe("resolve answers truthfully rather than refusing", () => {
    const builtins = ["fs", "node:fs", "path", "node:path", "node:test"];

    test.each(builtins)("resolves %s exactly as Node does", (specifier) => {
      const mine = jcoModule.createRequire("/app/index.js");
      const theirs = nodeModule.createRequire("/app/index.js");
      expect(mine.resolve(specifier)).toBe(theirs.resolve(specifier));
    });

    test.concurrent("reports MODULE_NOT_FOUND for a package, which is the truth here", () => {
      const require = jcoModule.createRequire("/app/index.js");
      expect(() => require.resolve("lodash")).toThrowError(
        expect.objectContaining({ code: "MODULE_NOT_FOUND" }),
      );
    });

    test.concurrent("resolve.paths matches Node for a builtin", () => {
      expect(jcoModule.createRequire("/app/index.js").resolve.paths("fs")).toBe(
        nodeModule.createRequire("/app/index.js").resolve.paths("fs"),
      );
    });
  });
});

describe("the loading half refuses", () => {
  const calls: [string, () => unknown][] = [
    ["register", () => jcoModule.register("./hooks.js")],
    ["registerHooks", () => jcoModule.registerHooks({})],
    ["runMain", () => jcoModule.runMain()],
    ["findPackageJSON", () => jcoModule.findPackageJSON("/app/index.js")],
    ["stripTypeScriptTypes", () => jcoModule.stripTypeScriptTypes("const x: number = 1;")],
    ["setSourceMapsSupport", () => jcoModule.setSourceMapsSupport(true)],
    ["_debug", () => jcoModule._debug()],
    ["_findPath", () => jcoModule._findPath("x", [], false)],
    ["_initPaths", () => jcoModule._initPaths()],
    ["_load", () => jcoModule._load("x", null, false)],
    ["_nodeModulePaths", () => jcoModule._nodeModulePaths("/app")],
    ["_preloadModules", () => jcoModule._preloadModules([])],
    ["_readPackage", () => jcoModule._readPackage("/app")],
    ["_resolveFilename", () => jcoModule._resolveFilename("x", null, false)],
    ["_resolveLookupPaths", () => jcoModule._resolveLookupPaths("x", null)],
    ["_stat", () => jcoModule._stat("/app")],
    ["Module.prototype.require", () => new jcoModule.Module("x").require("node:path")],
    ["Module.prototype.load", () => new jcoModule.Module("x").load("/app/index.js")],
    ["Module.prototype._compile", () => new jcoModule.Module("x")._compile("", "/app/index.js")],
  ];

  test.each(calls)("%s throws the unsupported error", (_name, call) => {
    expect(call).toThrowError(expect.objectContaining({ code: UNSUPPORTED }));
  });

  test.concurrent("every refusal explains that there is no loader", () => {
    for (const [, call] of calls) {
      try {
        call();
      } catch (thrown) {
        expect((thrown as Error).message).toContain("no module loader");
      }
    }
  });

  test.concurrent("the refused list plus the implemented list covers the whole surface", () => {
    // Guards against an export being added later and silently doing nothing.
    const refused = new Set(
      calls.map(([name]) => name).filter((name) => !name.startsWith("Module.prototype")),
    );
    const implemented = new Set([
      "Module",
      "SourceMap",
      "builtinModules",
      "constants",
      "createRequire",
      "enableCompileCache",
      "findSourceMap",
      "flushCompileCache",
      "getCompileCacheDir",
      "getSourceMapsSupport",
      "globalPaths",
      "isBuiltin",
      "syncBuiltinESMExports",
      "wrap",
      "wrapper",
      "_cache",
      "_extensions",
      "_pathCache",
    ]);
    const surface = Object.getOwnPropertyNames(jcoModule).filter(
      (key) => !["length", "name", "prototype"].includes(key),
    );
    const uncovered = surface.filter((key) => !refused.has(key) && !implemented.has(key));
    expect(uncovered).toEqual([]);
  });
});
