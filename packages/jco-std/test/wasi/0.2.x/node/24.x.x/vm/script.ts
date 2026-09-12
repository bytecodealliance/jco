import { expect, test } from "vitest";
import native from "node:vm";
import { Script } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import { capture, expectUnsupported, isNode24, poison } from "../helpers/vm.js";

test("compilation checks Script syntax without executing source", () => {
  const key = "__jco_vm_script_test";
  const globals = globalThis as unknown as Record<string, unknown>;
  globals[key] = 0;

  try {
    const script = new Script(`globalThis.${key} += 1`);
    expect(globals[key]).toBe(0);
    expect(script.runInThisContext()).toBe(1);
    expect(script.runInThisContext()).toBe(2);
    expect(() => new Script("return 1")).toThrow(SyntaxError);
    expect(() => new Script("const =")).toThrow(SyntaxError);
    expect(() => new Script(`globalThis.${key} = 99; return`)).toThrow(SyntaxError);
    expect(globals[key]).toBe(2);
  } finally {
    delete globals[key];
  }
});

test.skipIf(!isNode24)("source metadata and source coercion agree with Node 24", () => {
  for (const code of [undefined, null, 42, { toString: () => "42" }]) {
    const actual = Reflect.construct(Script, [code]) as Script;
    const expected = Reflect.construct(native.Script, [code]) as native.Script;
    expect(actual.runInThisContext()).toEqual(expected.runInThisContext());
  }

  for (const code of [
    "42",
    "//# sourceURL=test.js\n42\n//# sourceMappingURL=test.map",
    "/*# sourceMappingURL=ignored */\n42",
    "'//# sourceMappingURL=ignored'",
    "//# sourceMappingURL=first\n//# sourceMappingURL=last",
  ]) {
    const actual = new Script(code);
    const expected = new native.Script(code);
    expect(actual.sourceMapURL).toBe(expected.sourceMapURL);
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    expect(actual.cachedDataRejected).toBeUndefined();
  }
});

test("V8 caches and separate contexts fail before reading their arguments", () => {
  const script = new Script("42");
  expectUnsupported(() => script.createCachedData(), "createCachedData");
  expectUnsupported(() => script.runInContext(poison() as Record<string, unknown>), "runInContext");
  expectUnsupported(
    () => script.runInNewContext(poison() as Record<string, unknown>),
    "runInNewContext",
  );
  expectUnsupported(() => new Script("42", { cachedData: new Uint8Array() }), "cachedData");
});

test("deprecated produceCachedData rejects before source coercion or option getters", () => {
  for (const value of [false, true, undefined]) {
    const options = {
      produceCachedData: value,
      get filename(): string {
        throw new Error("read filename");
      },
    };
    expect(capture(() => Reflect.construct(Script, [poison(), options]))).toMatchObject({
      code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
      message: expect.stringContaining("produceCachedData"),
    });
  }

  expect(
    capture(
      () =>
        new Script("42", {
          get produceCachedData(): boolean {
            throw new Error("read cache getter");
          },
        }),
    ),
  ).toMatchObject({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" });
});
