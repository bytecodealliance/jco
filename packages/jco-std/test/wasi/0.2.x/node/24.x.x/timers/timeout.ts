import native from "node:timers";
import { expect, test, vi, afterEach } from "vitest";
import shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/timers.js";

afterEach(() => vi.useRealTimers());

for (const [name, timers] of [
  ["Node", native],
  ["shim", shim],
] as const) {
  test(`${name}: timeout callback arguments, receiver, ref and close`, async () => {
    await new Promise<void>((resolve) => {
      const timer = timers.setTimeout(
        function (a: number, b: string) {
          expect(this).toBe(timer);
          expect([a, b]).toEqual([7, "ok"]);
          resolve();
        },
        1,
        7,
        "ok",
      );
      expect(timer.hasRef()).toBe(true);
      expect(timer.unref()).toBe(timer);
      expect(timer.hasRef()).toBe(false);
      expect(timer.ref()).toBe(timer);
    });
    const callback = vi.fn();
    const timer = timers.setTimeout(callback, 1);
    expect(timer.close()).toBe(timer);
    timer.refresh();
    await new Promise((resolve) => native.setTimeout(resolve, 10));
    expect(callback).not.toHaveBeenCalled();
    expect(timer.hasRef()).toBe(true);
  });

  test(`${name}: numeric and string IDs cancel interchangeably`, async () => {
    const callback = vi.fn();
    const a = timers.setTimeout(callback, 1);
    const b = timers.setInterval(callback, 1);
    expect(+a).toBe(+a);
    timers.clearInterval(String(+a));
    timers.clearTimeout(+b);
    await new Promise((resolve) => native.setTimeout(resolve, 10));
    expect(callback).not.toHaveBeenCalled();
  });

  test(`${name}: validation precedes delay coercion`, () => {
    const coerce = vi.fn();
    for (const callback of [undefined, null, false, 1, "fn", {}, Symbol()]) {
      expect(() => Reflect.apply(timers.setTimeout, null, [callback, { valueOf: coerce }])).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
      );
    }
    expect(coerce).not.toHaveBeenCalled();
    expect(() => Reflect.apply(timers.setTimeout, null, [() => {}, 1n])).toThrow(
      "Cannot mix BigInt and other types, use explicit conversions",
    );
  });
}

test("refresh resets the deadline and reactivates fired timeouts", () => {
  vi.useFakeTimers();
  const callback = vi.fn();
  const timer = shim.setTimeout(callback, 10);
  vi.advanceTimersByTime(8);
  expect(timer.refresh()).toBe(timer);
  vi.advanceTimersByTime(8);
  expect(callback).not.toHaveBeenCalled();
  vi.advanceTimersByTime(2);
  expect(callback).toHaveBeenCalledTimes(1);
  timer.refresh();
  vi.advanceTimersByTime(10);
  expect(callback).toHaveBeenCalledTimes(2);
  timer[Symbol.dispose]();
});
