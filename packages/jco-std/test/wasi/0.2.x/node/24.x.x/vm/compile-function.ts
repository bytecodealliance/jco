import { expect, test } from "vitest";
import native from "node:vm";
import { compileFunction } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import { capture, expectUnsupported, isNode24 } from "../helpers/vm.js";

// Cases adapted from Node v24.20.0 test/parallel/test-vm-basic.js (MIT).
test.skipIf(!isNode24)("function bodies, parameters, this and globals agree with Node 24", () => {
  for (const [code, params, args] of [
    ["return p + q + r", ["p", "q", "r"], [1, 2, 3]],
    ["const twice = x => x * 2; return twice(value)", ["value"], [21]],
    ["return this.answer", [], []],
    ["return arguments.length", [], [1, 2]],
    ["return", [], []],
  ] as [string, string[], unknown[]][]) {
    const actual = compileFunction(code, params);
    const expected = native.compileFunction(code, params);
    expect(actual.apply({ answer: 42 }, args)).toEqual(expected.apply({ answer: 42 }, args));
    expect(actual.name).toBe(expected.name);
    expect(actual.length).toBe(expected.length);
  }

  expect(compileFunction("return globalThis")()).toBe(globalThis);
  expect(() => compileFunction("}); throw 1; (function() {")).toThrow(SyntaxError);
  expect(() => compileFunction("return (")).toThrow(SyntaxError);
});

test.skipIf(!isNode24)("invalid argument errors agree with Node 24", () => {
  for (const args of [
    [undefined],
    ["", null],
    ["", [1]],
    ["", [], null],
    ["", [], { filename: 1 }],
    ["", [], { lineOffset: 0.5 }],
    ["", [], { produceCachedData: null }],
    ["", [], { cachedData: null }],
  ]) {
    const actual = capture(() => Reflect.apply(compileFunction, undefined, args));
    const expected = capture(() => Reflect.apply(native.compileFunction, undefined, args));
    expect({ name: actual.name, code: actual.code }).toEqual({
      name: expected.name,
      code: expected.code,
    });
  }
});

test("native-only compilation options fail without executing source", () => {
  for (const options of [
    { parsingContext: {} },
    { contextExtensions: [{}] },
    { produceCachedData: true },
    { cachedData: new Uint8Array() },
    { lineOffset: 1 },
    { columnOffset: 1 },
  ]) {
    expectUnsupported(() => compileFunction("throw new Error('executed')", [], options), "vm");
  }

  expectUnsupported(() => compileFunction("return import('node:fs')"), "dynamic import");
  expect(
    compileFunction("return 42", [], { produceCachedData: false, contextExtensions: [] })(),
  ).toBe(42);
});

test("parameter-list syntax cannot be smuggled through individual names", () => {
  for (const parameter of ["a,b", "a=1", "...args", "{a}", "a) { throw 1 } //"]) {
    expect(() => compileFunction("return 1", [parameter])).toThrow(SyntaxError);
  }
});
