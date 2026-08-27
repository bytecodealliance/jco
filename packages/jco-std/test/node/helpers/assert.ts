import nodeAssert from "node:assert";
import { expect } from "vitest";
import { AssertionError } from "../../../src/node/assert/index.js";

export interface CapturedResult {
  passed: boolean;
  name?: string;
  code?: unknown;
  actual?: unknown;
  expected?: unknown;
  operator?: unknown;
  generatedMessage?: unknown;
}

function property(value: object, key: PropertyKey): unknown {
  return Reflect.get(value, key);
}

export function capture(run: () => unknown): CapturedResult {
  try {
    run();
    return { passed: true };
  } catch (error: unknown) {
    if (error === null || (typeof error !== "object" && typeof error !== "function")) {
      return { passed: false, name: typeof error };
    }
    return {
      passed: false,
      name: error instanceof Error ? error.name : Object.prototype.toString.call(error),
      code: property(error, "code"),
      actual: property(error, "actual"),
      expected: property(error, "expected"),
      operator: property(error, "operator"),
      generatedMessage: property(error, "generatedMessage"),
    };
  }
}

export function compareOutcome(portable: () => unknown, native: () => unknown): void {
  const actual = capture(portable);
  const expected = capture(native);
  expect(actual.passed).toBe(expected.passed);
  if (!actual.passed && expected.code === "ERR_ASSERTION") {
    expect(actual).toMatchObject({
      code: "ERR_ASSERTION",
      actual: expected.actual,
      expected: expected.expected,
      operator: expected.operator,
      generatedMessage: expected.generatedMessage,
    });
  }
}

export function expectAssertion(
  run: () => unknown,
  fields: Partial<AssertionError> = {},
): AssertionError {
  try {
    run();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AssertionError);
    expect(error).toMatchObject(fields);
    return error as AssertionError;
  }
  throw new Error("Expected an AssertionError");
}

export { nodeAssert };
