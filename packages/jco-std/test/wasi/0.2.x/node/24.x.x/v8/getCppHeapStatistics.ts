import { expect, test } from "vitest";
import native from "node:v8";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("preserves detailed and brief native schemas and validates detail level", () => {
  for (const detail of [undefined, "brief", "detailed"] as const) {
    expect(Object.keys(v8.getCppHeapStatistics(detail))).toEqual(
      Object.keys(native.getCppHeapStatistics(detail)),
    );
  }

  expect(() => Reflect.apply(v8.getCppHeapStatistics, null, ["invalid"])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
  );
  expect(() => blocked.getCppHeapStatistics()).toThrow(expect.objectContaining(deniedError));
});
