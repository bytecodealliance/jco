import { expect, test } from "vitest";
import native from "node:vm";
import { runInThisContext, Script } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import { capture, expectUnsupported, isNode24 } from "../helpers/vm.js";

test.skipIf(!isNode24)(
  "completion values, local scopes and exception identity agree with Node 24",
  () => {
    for (const code of [
      "",
      "1 + 2",
      "({ answer: 42 })",
      "[1, 2, 3].map(x => x * 2)",
      "{ let value = 21; value * 2; }",
      "(() => { var value = 6; return value * 7; })()",
      "'use strict'; 42",
      "this === globalThis",
      "if (true) 7; else 9;",
    ]) {
      expect(runInThisContext(code)).toEqual(native.runInThisContext(code));
    }

    const __jco_vm_local_only = 42;
    expect(__jco_vm_local_only).toBe(42);
    expect(runInThisContext("typeof __jco_vm_local_only")).toBe("undefined");
    const result = runInThisContext("(value => value + 1)");
    expect(typeof result).toBe("function");
    expect(Reflect.apply(result as (value: number) => number, null, [41])).toBe(42);
  },
);

test("global declarations are refused before any source side effects", () => {
  for (const declaration of [
    "var x = 1",
    "let x = 1",
    "const x = 1",
    "class X {}",
    "function x() {}",
    "if (true) { var x = 1 }",
    "if (true) { function x() {} }",
  ]) {
    const source = `throw new Error('executed'); ${declaration}`;
    expectUnsupported(() => runInThisContext(source), "global declarations");
  }
});

test("watchdogs and module loaders are never silently ignored", () => {
  const source = "throw new Error('executed')";
  expectUnsupported(() => runInThisContext(source, { timeout: 1 }), "timeout");
  expectUnsupported(() => runInThisContext(source, { breakOnSigint: true }), "breakOnSigint");
  expectUnsupported(() => runInThisContext("import('node:fs')"), "dynamic import");
  expectUnsupported(() => new Script("() => import('later')"), "dynamic import");
  expectUnsupported(
    () =>
      new Script("42", {
        importModuleDynamically: () => {
          throw new Error("callback");
        },
      }),
    "importModuleDynamically",
  );
  expect(runInThisContext("42", { displayErrors: false, breakOnSigint: false })).toBe(42);
});

test.skipIf(!isNode24)("invalid run option errors preserve Node's classes and codes", () => {
  for (const options of [
    null,
    1,
    { timeout: 0 },
    { timeout: -1 },
    { timeout: 1.5 },
    { displayErrors: 1 },
    { breakOnSigint: "yes" },
  ]) {
    const actual = capture(() => Reflect.apply(runInThisContext, undefined, ["42", options]));
    const expected = capture(() =>
      Reflect.apply(native.runInThisContext, undefined, ["42", options]),
    );
    expect({ name: actual.name, code: actual.code }).toEqual({
      name: expected.name,
      code: expected.code,
    });
  }
});

test("filenames cannot introduce executable lines", () => {
  const script = new Script("42", {
    filename: "test.js\nthrow new Error('injected')\r\u2028\u2029",
  });
  expect(script.runInThisContext()).toBe(42);
});
