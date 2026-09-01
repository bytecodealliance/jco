import nodeModule from "node:module";

import { describe, expect, test } from "vitest";

import jcoModule from "../../../../../../src/wasi/0.2.x/node/24.x.x/module.js";

/**
 * The module surface, compared against the host's real `node:module`.
 *
 * `node:module` exists in Node 24, so unlike `node:ffi` this can be diffed live rather than from a
 * recording -- the strongest form the template asks for.
 */

/** `length`, `name` and `prototype` come from being a class, not from the module surface. */
const CLASS_INTRINSICS = new Set(["length", "name", "prototype"]);

function surfaceOf(value: object): string[] {
  return Object.getOwnPropertyNames(value)
    .filter((key) => !CLASS_INTRINSICS.has(key))
    .sort();
}

describe("node:module matches Node's shape", () => {
  test("exports exactly what Node exports", () => {
    expect(surfaceOf(jcoModule)).toEqual(surfaceOf(nodeModule));
  });

  test("the module object is the Module class, as Node's is", () => {
    expect(typeof jcoModule).toBe("function");
    expect(jcoModule).toBe(jcoModule.Module);
    expect(typeof nodeModule).toBe(typeof jcoModule);
  });

  test("Module.prototype has exactly Node's members", () => {
    expect(Object.getOwnPropertyNames(jcoModule.Module.prototype).sort()).toEqual(
      Object.getOwnPropertyNames(nodeModule.prototype).sort(),
    );
  });
});

describe("classification matches Node exactly", () => {
  test("builtinModules is Node's list", () => {
    expect(jcoModule.builtinModules).toEqual(nodeModule.builtinModules);
  });

  test("constants match", () => {
    expect(jcoModule.constants).toEqual(nodeModule.constants);
  });

  test("isBuiltin agrees on every builtin, bare and prefixed", () => {
    // The interesting case is prefix-only modules: `node:test` is a builtin, plain `test` is not.
    const probes = new Set<string>();
    for (const name of nodeModule.builtinModules) {
      probes.add(name);
      probes.add(`node:${name}`);
      probes.add(name.replace(/^node:/, ""));
    }
    for (const extra of ["lodash", "node:lodash", "", "node:"]) {
      probes.add(extra);
    }
    const mismatches = [...probes].filter(
      (name) => jcoModule.isBuiltin(name) !== nodeModule.isBuiltin(name),
    );
    expect(mismatches).toEqual([]);
  });
});

describe("state reporting is accurate rather than stubbed", () => {
  const cases: [string, (m: typeof nodeModule) => unknown][] = [
    ["findSourceMap for an unknown path", (m) => m.findSourceMap("/nope.js")],
    ["getSourceMapsSupport", (m) => m.getSourceMapsSupport()],
    ["getCompileCacheDir", (m) => m.getCompileCacheDir()],
    ["flushCompileCache", (m) => m.flushCompileCache()],
    ["syncBuiltinESMExports", (m) => m.syncBuiltinESMExports()],
    ["globalPaths is an array", (m) => Array.isArray(m.globalPaths)],
  ];

  test.each(cases)("%s matches Node", (_name, read) => {
    expect(read(jcoModule as unknown as typeof nodeModule)).toEqual(read(nodeModule));
  });

  test("wrap and wrapper are real, not refused", () => {
    // Both are deprecated upstream but pure string work, so they behave exactly as Node's do.
    expect(jcoModule.wrapper).toEqual(nodeModule.wrapper);
    expect(jcoModule.wrap("const a = 1;")).toBe(nodeModule.wrap("const a = 1;"));
  });

  test("wrap reads wrapper live, as Node's does", () => {
    const original = [...jcoModule.wrapper];
    try {
      jcoModule.wrapper[0] = "(function (exports) { ";
      expect(jcoModule.wrap("X")).toBe("(function (exports) { X\n});");
    } finally {
      jcoModule.wrapper[0] = original[0];
      jcoModule.wrapper[1] = original[1];
    }
  });

  test("null-prototype returns match Node's", () => {
    // `toEqual` ignores prototypes, so this is checked explicitly: `assert.deepStrictEqual` in a
    // consumer's test would notice, and a plain object literal here would look identical until then.
    const prototypeOf = (value: object) => Object.getPrototypeOf(value);
    expect(prototypeOf(jcoModule.getSourceMapsSupport())).toBe(
      prototypeOf(nodeModule.getSourceMapsSupport()),
    );
    expect(prototypeOf(jcoModule.constants)).toBe(prototypeOf(nodeModule.constants));
    expect(prototypeOf(jcoModule.constants.compileCacheStatus)).toBe(
      prototypeOf(nodeModule.constants.compileCacheStatus),
    );
    const mine = jcoModule.createRequire("/app/index.js");
    const theirs = nodeModule.createRequire("/app/index.js");
    expect(prototypeOf(mine.cache)).toBe(prototypeOf(theirs.cache));
    expect(prototypeOf(mine.extensions)).toBe(prototypeOf(theirs.extensions));
  });

  test("enableCompileCache reports failure through Node's status protocol", () => {
    // Not a throw: callers branch on `status`, and Node itself returns FAILED rather than throwing
    // when it cannot enable the cache.
    const result = jcoModule.enableCompileCache();
    expect(result.status).toBe(jcoModule.constants.compileCacheStatus.FAILED);
    expect(typeof result.message).toBe("string");
  });
});

describe("Module instances match Node", () => {
  test("a fresh module has Node's own properties and values", () => {
    const mine = new jcoModule.Module("my-id");
    const theirs = new nodeModule.Module("my-id");
    expect(Object.keys(mine).sort()).toEqual(Object.keys(theirs).sort());
    expect({ ...mine }).toEqual({ ...theirs });
  });

  test("parent is undefined, not null, as Node reports", () => {
    expect(new jcoModule.Module("x").parent).toBe(new nodeModule.Module("x").parent);
  });

  test("isPreloading matches", () => {
    expect(new jcoModule.Module("x").isPreloading).toBe(new nodeModule.Module("x").isPreloading);
  });
});
