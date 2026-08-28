import { describe, expect, test } from "vitest";
import { CallTracker } from "../../../src/node24.x/assert/index.js";

describe("assert.CallTracker deprecated stub", () => {
  test("throws immediately from construction", () => {
    expect(() => new CallTracker()).toThrowError(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
    );
  });

  test("does not inspect constructor arguments", () => {
    let accessed = false;
    const input = Object.defineProperty({}, "value", { get: () => (accessed = true) });
    expect(() => Reflect.construct(CallTracker, [input])).toThrow();
    expect(accessed).toBe(false);
  });

  test("keeps every prototype entry point as an immediate-error stub", () => {
    const tracker = Object.create(CallTracker.prototype) as CallTracker;
    let invoked = false;
    const fn = () => {
      invoked = true;
    };
    for (const invoke of [
      () => tracker.calls(fn),
      () => tracker.getCalls(fn),
      () => tracker.report(),
      () => tracker.reset(fn),
      () => tracker.verify(),
    ]) {
      expect(invoke).toThrowError(
        expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
      );
    }
    expect(invoked).toBe(false);
  });
});
