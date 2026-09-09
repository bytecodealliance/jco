import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("finalization rejects callback hooks immediately", () => {
  for (const method of ["register", "registerBeforeExit", "unregister"] as const) {
    expect(() => Reflect.apply(process.finalization[method], null, [null])).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  }
});
