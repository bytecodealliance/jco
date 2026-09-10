import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("styleText preserves nested close codes, hex colors and explicit streams", () => {
  for (const style of ["red", ["bold", "red"], "none", "#a0f", "#123456", "grey"]) {
    for (const text of ["hello", "a\x1b[39mb", "a\x1b[39m"]) {
      expect(util.styleText(style, text, { validateStream: false })).toBe(
        Reflect.apply(native.styleText, undefined, [style, text, { validateStream: false }]),
      );
    }
  }
  expect(util.styleText("red", "plain", { stream: { write() {}, isTTY: false } })).toBe("plain");
  expect(() => util.styleText("red", "text")).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
  expect(() => util.styleText("#not-hex", "text", { validateStream: false })).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
  );
});

test("styleText accepts all Node color aliases", () => {
  expect(Object.getOwnPropertyNames(util.inspect.colors).sort()).toEqual(
    Object.getOwnPropertyNames(native.inspect.colors).sort(),
  );
  for (const color of Object.getOwnPropertyNames(native.inspect.colors)) {
    expect(util.styleText(color, "x", { validateStream: false })).toBe(
      Reflect.apply(native.styleText, undefined, [color, "x", { validateStream: false }]),
    );
  }
});

test("styleText rejects inherited object names as formats", () => {
  for (const format of ["toString", "constructor", "__proto__"]) {
    expect(() => util.styleText(format, "x", { validateStream: false })).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
    );
  }
});
