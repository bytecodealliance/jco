import { describe, expect, test } from "vitest";

import {
  AbortError,
  codedError,
  genericNodeError,
  unsupportedNodeApi,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/errors.js";

describe("Node coded errors", () => {
  test("preserves the base class and stable code contract", () => {
    const error = codedError(new TypeError("wrong"), "ERR_EXAMPLE");
    expect(error).toBeInstanceOf(TypeError);
    expect(error.name).toBe("TypeError");
    expect(error.code).toBe("ERR_EXAMPLE");
    expect(error.toString()).toBe("TypeError [ERR_EXAMPLE]: wrong");
    expect(Object.getOwnPropertyDescriptor(error, "code")).toMatchObject({
      enumerable: true,
      configurable: true,
      writable: true,
    });
    expect(error.stack?.split("\n")[0]).toBe("TypeError [ERR_EXAMPLE]: wrong");
  });

  test("constructs Node's AbortError shape", () => {
    const cause = new Error("cause");
    const error = new AbortError(undefined, { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "AbortError",
      code: "ABORT_ERR",
      message: "The operation was aborted",
      cause,
    });
  });

  test("constructs generic and explicit unsupported failures", () => {
    expect(genericNodeError("failed", { code: "EFAIL", syscall: "open" })).toMatchObject({
      message: "failed",
      code: "EFAIL",
      syscall: "open",
    });
    expect(unsupportedNodeApi("node:test.api()", "the runtime has no hook")).toMatchObject({
      code: "ERR_JCO_UNSUPPORTED_NODE_API",
      message: expect.stringContaining("the runtime has no hook"),
    });
  });
});
