import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("ref uses the guest refable protocol with the original receiver", () => {
  const calls: unknown[] = [];
  const value = {
    [Symbol.for("nodejs.ref")]() {
      calls.push(this);
    },
  };
  process.ref(value);
  expect(calls).toEqual([value]);
  process.ref(null);
  process.ref({});
});

test("ref falls back to a legacy ref method when the symbol is missing", () => {
  let calls = 0;
  process.ref({
    ref() {
      calls++;
    },
  });
  expect(calls).toBe(1);
});
