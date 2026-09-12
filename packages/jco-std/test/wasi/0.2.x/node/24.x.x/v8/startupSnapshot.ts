import { expect, test } from "vitest";
import native from "node:v8";
import { v8 } from "../helpers/v8.js";

test("matches ordinary Node outside a startup snapshot build", () => {
  expect(v8.startupSnapshot.isBuildingSnapshot()).toBe(false);
  for (const name of [
    "addDeserializeCallback",
    "addSerializeCallback",
    "setDeserializeMainFunction",
  ] as const) {
    const fn = () => {
      throw new Error("must not execute");
    };
    expect(() => native.startupSnapshot[name](fn)).toThrow(
      expect.objectContaining({ code: "ERR_NOT_BUILDING_SNAPSHOT" }),
    );
    expect(() => v8.startupSnapshot[name](fn)).toThrow(
      expect.objectContaining({ code: "ERR_NOT_BUILDING_SNAPSHOT" }),
    );
  }
});
