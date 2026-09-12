import { expect, test } from "vitest";
import { v8, unsupportedError } from "../helpers/v8.js";

test("never installs inert hooks or reads callback getters", () => {
  for (const name of ["onInit", "onBefore", "onAfter", "onSettled"] as const) {
    expect(() => v8.promiseHooks[name](() => {})).toThrow(
      expect.objectContaining(unsupportedError),
    );
  }

  let accessed = false;
  expect(() =>
    v8.promiseHooks.createHook({
      get init() {
        accessed = true;
        return () => {};
      },
    }),
  ).toThrow(expect.objectContaining(unsupportedError));
  expect(accessed).toBe(false);
});
