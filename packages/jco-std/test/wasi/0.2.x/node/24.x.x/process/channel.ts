import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("channel explicitly rejects native object access", () => {
  expect(() => process.channel).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
