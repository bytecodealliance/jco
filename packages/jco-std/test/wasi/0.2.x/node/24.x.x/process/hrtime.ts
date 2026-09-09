import { expect, test } from "vitest";
import { process, createProcess, denied, errorOf } from "../helpers/process.js";
test("hrtime uses a monotonic nanosecond clock and borrows correctly", () => {
  const p = createProcess({ ...denied, hrtime: () => ({ seconds: 2, nanoseconds: 10 }) });
  expect(p.hrtime()).toEqual([2, 10]);
  expect(p.hrtime([1, 20])).toEqual([0, 999999990]);
  expect(p.hrtime.bigint()).toBe(2000000010n);
  const start = process.hrtime.bigint();
  expect(process.hrtime.bigint()).toBeGreaterThanOrEqual(start);
  expect(errorOf(() => Reflect.apply(p.hrtime, null, [[]])).code).toBe("ERR_OUT_OF_RANGE");
});
