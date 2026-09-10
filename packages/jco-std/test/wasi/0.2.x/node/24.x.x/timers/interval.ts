import native from "node:timers";
import { afterEach, expect, test, vi } from "vitest";
import shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/timers.js";

afterEach(() => vi.useRealTimers());
for (const [name, timers] of [
  ["Node", native],
  ["shim", shim],
] as const) {
  test(`${name}: intervals repeat, preserve arguments/receiver and cancel inside callback`, async () => {
    let count = 0;
    await new Promise<void>((resolve) => {
      const handle = timers.setInterval(
        function (value: string) {
          expect(this).toBe(handle);
          expect(value).toBe("tick");
          if (++count === 3) {
            timers.clearTimeout(handle);
            resolve();
          }
        },
        1,
        "tick",
      );
    });
    await new Promise((resolve) => native.setTimeout(resolve, 5));
    expect(count).toBe(3);
    expect(() => Reflect.apply(timers.setInterval, null, [null])).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });
}

test("refresh restarts an interval; dispose removes it", () => {
  vi.useFakeTimers();
  const callback = vi.fn();
  const timer = shim.setInterval(callback, 10);
  vi.advanceTimersByTime(8);
  timer.refresh();
  vi.advanceTimersByTime(22);
  expect(callback).toHaveBeenCalledTimes(2);
  timer[Symbol.dispose]();
  vi.advanceTimersByTime(20);
  expect(callback).toHaveBeenCalledTimes(2);
});
