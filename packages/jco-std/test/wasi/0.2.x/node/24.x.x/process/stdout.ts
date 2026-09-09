import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("stdout explicitly rejects native object access", () => {
  expect(() => process.stdout).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
