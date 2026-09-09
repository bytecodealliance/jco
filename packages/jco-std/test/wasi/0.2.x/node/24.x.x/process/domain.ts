import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("domain is a deprecated getter", () => {
  expect(() => process.domain).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
  );
});
