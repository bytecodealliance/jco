import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("mainModule is a deprecated getter", () => {
  expect(() => process.mainModule).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
  );
});
