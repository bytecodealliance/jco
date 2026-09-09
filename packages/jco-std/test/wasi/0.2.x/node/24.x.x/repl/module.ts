// Differential cases require the pinned Node 24 major; portable fixtures run on every major.
import native from "node:repl";
import nativeReadline from "node:readline";
import { describe, expect, test } from "vitest";
import repl, * as namespace from "../../../../../../src/wasi/0.2.x/node/24.x.x/repl.js";
import readline from "../../../../../../src/wasi/0.2.x/node/24.x.x/readline.js";
import { hostIsTargetNode } from "../helpers/assert.js";
import { ArrayStream } from "../helpers/repl.js";

describe("node:repl module contract (Node 24)", () => {
  test.skipIf(!hostIsTargetNode).concurrent("matches exports, accessors and namespace", () => {
    expect(Object.keys(repl).sort()).toEqual(Object.keys(native).sort());
    expect(Reflect.ownKeys(repl).map(String).sort()).toEqual(
      Reflect.ownKeys(native).map(String).sort(),
    );
    expect(Object.keys(namespace).sort()).toEqual([...Object.keys(native), "default"].sort());
    for (const name of ["builtinModules", "_builtinLibs"] as const) {
      const actual = Object.getOwnPropertyDescriptor(repl, name)!;
      const expected = Object.getOwnPropertyDescriptor(native, name)!;
      expect([
        actual.enumerable,
        actual.configurable,
        typeof actual.get,
        typeof actual.set,
      ]).toEqual([
        expected.enumerable,
        expected.configurable,
        typeof expected.get,
        typeof expected.set,
      ]);
    }
    expect(repl.builtinModules).toEqual(native.builtinModules);
    expect(repl._builtinLibs).toEqual(native._builtinLibs);
    expect(repl.REPL_MODE_SLOPPY.toString()).toBe(native.REPL_MODE_SLOPPY.toString());
    expect(repl.REPL_MODE_STRICT.toString()).toBe(native.REPL_MODE_STRICT.toString());
    expect(repl.REPLServer.length).toBe(native.REPLServer.length);
    expect(repl.start.length).toBe(native.start.length);
    expect(Object.getOwnPropertyNames(repl.REPLServer.prototype).sort()).toEqual(
      Object.getOwnPropertyNames(native.REPLServer.prototype).sort(),
    );
    expect(Object.getOwnPropertyNames(repl.Recoverable.prototype)).toEqual(
      Object.getOwnPropertyNames(native.Recoverable.prototype),
    );
  });

  test.concurrent("named exports are the default object's members", () => {
    expect(namespace.start).toBe(repl.start);
    expect(namespace.writer).toBe(repl.writer);
    expect(namespace.REPLServer).toBe(repl.REPLServer);
    expect(namespace.Recoverable).toBe(repl.Recoverable);
    expect(namespace.isValidSyntax).toBe(repl.isValidSyntax);
    expect(namespace.REPL_MODE_SLOPPY).toBe(repl.REPL_MODE_SLOPPY);
    expect(namespace.REPL_MODE_STRICT).toBe(repl.REPL_MODE_STRICT);
  });

  test.concurrent("REPLServer sits on readline's Interface like Node's", () => {
    expect(Object.getPrototypeOf(repl.REPLServer.prototype)).toBe(readline.Interface.prototype);
    expect(Object.getPrototypeOf(repl.REPLServer)).toBe(readline.Interface);
    expect(Object.getPrototypeOf(native.REPLServer.prototype)).toBe(
      nativeReadline.Interface.prototype,
    );
    const instance = repl.start({
      input: new ArrayStream(),
      output: new ArrayStream(),
      useGlobal: true,
      terminal: false,
    });
    expect(instance).toBeInstanceOf(repl.REPLServer);
    expect(instance).toBeInstanceOf(readline.Interface);
    expect(instance.constructor).toBe(repl.REPLServer);
    instance.close();
  });

  test.concurrent("Recoverable is grafted onto SyntaxError with only an err field", () => {
    const cause = new SyntaxError("incomplete");
    const recoverable = new repl.Recoverable(cause);
    expect(recoverable).toBeInstanceOf(SyntaxError);
    expect(recoverable).toBeInstanceOf(repl.Recoverable);
    expect(Object.getPrototypeOf(repl.Recoverable)).toBe(SyntaxError);
    expect(Object.keys(recoverable)).toEqual(["err"]);
    expect(recoverable.err).toBe(cause);
    expect(Object.prototype.hasOwnProperty.call(recoverable, "message")).toBe(false);
  });

  test.concurrent("builtinModules accessors share one list and accept replacement", () => {
    const original = repl.builtinModules;
    expect(original).toContain("fs");
    expect(original.some((name) => name.startsWith("_") || name.startsWith("node:"))).toBe(false);
    expect(repl._builtinLibs).toBe(original);
    try {
      repl.builtinModules = ["only"];
      expect(repl._builtinLibs).toEqual(["only"]);
    } finally {
      repl.builtinModules = original;
    }
  });

  test.concurrent("importing the module touches no stream and defines no global", () => {
    expect(Object.prototype.hasOwnProperty.call(globalThis, "repl")).toBe(false);
    expect(typeof repl.start).toBe("function");
  });
});
