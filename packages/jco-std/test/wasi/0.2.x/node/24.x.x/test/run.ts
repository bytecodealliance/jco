import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("run throws immediately without reading options or launching a host", () => {
  const h = harness();
  let read = false;
  expect(() =>
    h.test.run({
      get files(): string[] {
        read = true;
        throw new Error("getter");
      },
    }),
  ).toThrow(/node:test run\(\).*not supported/);
  expect(read).toBe(false);
});
