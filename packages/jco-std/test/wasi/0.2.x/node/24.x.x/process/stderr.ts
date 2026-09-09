import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("stderr explicitly rejects native object access", () => {
  expect(() => process.stderr).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
