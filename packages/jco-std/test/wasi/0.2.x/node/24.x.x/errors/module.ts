import { describe, expect, test } from "vitest";

import errors, * as errorGlobals from "../../../../../../src/wasi/0.2.x/node/24.x.x/errors.js";

describe("Node Errors global contract", () => {
  test("retains the engine's standard constructor identities", () => {
    expect(errorGlobals.Error).toBe(globalThis.Error);
    expect(errorGlobals.EvalError).toBe(globalThis.EvalError);
    expect(errorGlobals.RangeError).toBe(globalThis.RangeError);
    expect(errorGlobals.ReferenceError).toBe(globalThis.ReferenceError);
    expect(errorGlobals.SyntaxError).toBe(globalThis.SyntaxError);
    expect(errorGlobals.TypeError).toBe(globalThis.TypeError);
    expect(errorGlobals.URIError).toBe(globalThis.URIError);
    expect(errorGlobals.AggregateError).toBe(globalThis.AggregateError);
    expect(errorGlobals.DOMException).toBe(globalThis.DOMException);
    expect(errorGlobals.SuppressedError).toBe(globalThis.SuppressedError);
  });

  test("exposes the constructors from its default compatibility namespace", () => {
    for (const name of [
      "AbortError",
      "AggregateError",
      "DOMException",
      "Error",
      "EvalError",
      "RangeError",
      "ReferenceError",
      "SuppressedError",
      "SyntaxError",
      "TypeError",
      "URIError",
    ] as const) {
      expect(errors[name]).toBe(errorGlobals[name]);
    }
  });

  test("supports cause, aggregate, suppressed, and DOM error fields", () => {
    const cause = new errorGlobals.Error("cause");
    expect(new errorGlobals.Error("outer", { cause }).cause).toBe(cause);
    expect(new errorGlobals.AggregateError([cause], "aggregate").errors).toEqual([cause]);
    const suppressed = new errorGlobals.SuppressedError(cause, "secondary", "suppressed");
    expect(suppressed.error).toBe(cause);
    expect(suppressed.suppressed).toBe("secondary");
    const aborted = new errorGlobals.DOMException("stopped", "AbortError");
    expect({ name: aborted.name, message: aborted.message, code: aborted.code }).toEqual({
      name: "AbortError",
      message: "stopped",
      code: 20,
    });
  });
});
