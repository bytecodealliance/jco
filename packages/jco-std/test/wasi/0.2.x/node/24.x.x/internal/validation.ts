import { describe, expect, test } from "vitest";
import {
  validateAbortSignal,
  validateArray,
  validateBoolean,
  validateBooleanArray,
  validateFunction,
  validateInteger,
  validateNumber,
  validateObject,
  validateOneOf,
  validateString,
  validateStringArray,
  validateUint32,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/internal/validation.js";
import * as errors from "../../../../../../src/wasi/0.2.x/node/24.x.x/errors.js";
import { validateUint32 as readlineUint32 } from "../../../../../../src/wasi/0.2.x/node/24.x.x/readline/compat.js";
import { validateAbortSignal as streamSignal } from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/shared.js";

interface PrimitiveCase {
  validate: (value: unknown, name: string) => void;
  value: unknown;
  invalid: unknown;
  expected: string;
}

const primitiveCases: PrimitiveCase[] = [
  { validate: validateString, value: "text", invalid: 1, expected: "string" },
  { validate: validateBoolean, value: false, invalid: "false", expected: "boolean" },
  { validate: validateNumber, value: NaN, invalid: "1", expected: "number" },
  { validate: validateFunction, value: () => {}, invalid: {}, expected: "Function" },
  { validate: validateArray, value: [], invalid: {}, expected: "Array" },
];

describe("shared Node validation", () => {
  test("preserves the errors facade's validator exports", () => {
    expect(errors.validateFunction).toBe(validateFunction);
    expect(errors.validateObject).toBe(validateObject);
    expect(errors.validateOneOf).toBe(validateOneOf);
    expect(errors.validateUint32).toBe(validateUint32);
  });

  test.each(primitiveCases)(
    "validates $expected without coercing values",
    ({ validate, value, invalid, expected }) => {
      expect(() => validate(value, "value")).not.toThrow();
      expect(() => validate(invalid, "value")).toThrow(
        errors.invalidArgType("value", expected, invalid),
      );
    },
  );

  test("permits arrays only for callers that opt in", () => {
    expect(() => validateObject([], "options")).toThrow(
      errors.invalidArgType("options", "Object", []),
    );
    expect(() => validateObject([], "options", { allowArray: true })).not.toThrow();
    for (const value of [null, undefined, () => {}]) {
      expect(() => validateObject(value, "options", { allowArray: true })).toThrow(
        errors.invalidArgType("options", "Object", value),
      );
    }
    expect(() => validateObject(Object.create(null), "options")).not.toThrow();
  });

  test("reports array element names and retains sparse-array handling", () => {
    expect(() => validateStringArray(["a", 1], "args")).toThrow(
      errors.invalidArgType("args[1]", "string", 1),
    );
    expect(() => validateBooleanArray([true, "false"], "flags")).toThrow(
      errors.invalidArgType("flags[1]", "boolean", "false"),
    );
    expect(() => validateStringArray([, "a"], "args")).not.toThrow();
    expect(() => validateBooleanArray([, false], "flags")).not.toThrow();
  });

  test("distinguishes integer type, fraction and range errors", () => {
    expect(() => validateInteger("1", "count", 0, 2)).toThrow(
      errors.invalidArgType("count", "number", "1"),
    );
    expect(() => validateInteger(1.5, "count", 0, 2)).toThrow(
      errors.outOfRange("count", "an integer", 1.5),
    );
    expect(() => validateInteger(3, "count", 0, 2)).toThrow(
      errors.outOfRange("count", ">= 0 && <= 2", 3),
    );
    expect(() => validateInteger(0, "count", 0, 2)).not.toThrow();
    expect(() => validateInteger(2, "count", 0, 2)).not.toThrow();
  });

  test("preserves the distinct Uint32 error contracts", () => {
    expect(() => validateUint32("1", "count")).toThrow(
      errors.outOfRange("count", ">= 0 and <= 4294967295", "1"),
    );
    expect(() => readlineUint32("1", "count")).toThrow(
      errors.invalidArgType("count", "number", "1"),
    );
    expect(() => validateUint32(0, "count", true)).toThrow(
      errors.outOfRange("count", ">= 1 and <= 4294967295", 0),
    );
    expect(() => validateUint32(0xffff_ffff, "count")).not.toThrow();
    expect(() => validateUint32(0x1_0000_0000, "count")).toThrow(
      expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
    );
  });

  test("keeps stream signals stricter than Readline's signal contract", () => {
    expect(() => validateAbortSignal({ aborted: false }, "signal")).not.toThrow();
    expect(() => streamSignal({ aborted: false }, "signal")).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    expect(() => validateAbortSignal(undefined, "signal")).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    expect(() => streamSignal(undefined, "signal")).not.toThrow();
    const { signal } = new AbortController();
    expect(() => validateAbortSignal(signal, "signal")).not.toThrow();
    expect(() => streamSignal(signal, "signal")).not.toThrow();
  });
});
