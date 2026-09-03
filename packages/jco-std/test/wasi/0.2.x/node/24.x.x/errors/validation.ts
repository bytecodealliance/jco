import { AsyncResource as NodeAsyncResource } from "node:async_hooks";
import { describe, expect, test } from "vitest";

import {
  determineSpecificType,
  formatList,
  invalidArgType,
  invalidArgValue,
  invalidReturnValue,
  missingArgs,
  outOfRange,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/errors.js";

describe("Node validation errors", () => {
  test.concurrent("matches Node 24 invalid argument type errors", () => {
    let nodeError: unknown;
    try {
      new NodeAsyncResource(42 as unknown as string);
    } catch (error) {
      nodeError = error;
    }
    const error = invalidArgType("type", "string", 42);
    expect(error).toMatchObject({
      name: (nodeError as Error).name,
      message: (nodeError as Error).message,
      code: "ERR_INVALID_ARG_TYPE",
    });
  });

  test.concurrent("formats common coded validation failures", () => {
    expect(invalidArgValue("encoding", "bad", "is not supported")).toMatchObject({
      code: "ERR_INVALID_ARG_VALUE",
      message: "The argument 'encoding' is not supported. Received 'bad'",
    });
    expect(missingArgs("actual", "expected")).toMatchObject({
      code: "ERR_MISSING_ARGS",
      message: 'The "actual" and "expected" arguments must be specified',
    });
    expect(invalidReturnValue("an instance of Promise", "promiseFn", 42)).toMatchObject({
      code: "ERR_INVALID_RETURN_VALUE",
      message: expect.stringContaining("type number (42)"),
    });
    expect(outOfRange("size", ">= 0 and <= 10", 11)).toMatchObject({
      code: "ERR_OUT_OF_RANGE",
      message: 'The value of "size" is out of range. It must be >= 0 and <= 10. Received 11',
    });
  });

  test.concurrent("describes boundary values without host dependencies", () => {
    expect(determineSpecificType(-0)).toBe("type number (-0)");
    expect(determineSpecificType(Number.NaN)).toBe("type number (NaN)");
    expect(determineSpecificType(1n)).toBe("type bigint (1n)");
    expect(determineSpecificType("abcdefghijklmnopqrstuvwxyz123")).toBe(
      "type string ('abcdefghijklmnopqrstuvwxy...')",
    );
    expect(formatList(["A", "B", "C"], "or")).toBe("A, B, or C");
  });
});
