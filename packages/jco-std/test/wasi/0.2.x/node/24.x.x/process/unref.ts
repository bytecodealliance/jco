import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("unref uses the guest refable protocol with the original receiver", () => {
  const calls: unknown[] = [];
  const value = {
    [Symbol.for("nodejs.unref")]() {
      calls.push(this);
    },
  };
  process.unref(value);
  expect(calls).toEqual([value]);
  process.unref(null);
  process.unref({});
});

test("unref falls back to a legacy unref method when the symbol is missing", () => {
  let calls = 0;
  process.unref({
    unref() {
      calls++;
    },
  });
  expect(calls).toBe(1);
});
