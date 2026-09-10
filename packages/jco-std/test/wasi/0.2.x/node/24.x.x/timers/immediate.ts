import native from "node:timers";
import { expect, test, vi } from "vitest";
import shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/timers.js";

for (const [name, timers] of [
  ["Node", native],
  ["shim", shim],
] as const) {
  test(`${name}: immediate ordering, receiver, ref and cancellation`, async () => {
    const order: string[] = [];
    const cancelled = timers.setImmediate(() => order.push("cancelled"));
    expect(cancelled.unref()).toBe(cancelled);
    expect(cancelled.hasRef()).toBe(false);
    expect(cancelled.ref()).toBe(cancelled);
    cancelled[Symbol.dispose]();
    expect(cancelled.hasRef()).toBe(false);
    await new Promise<void>((resolve) => {
      const first = timers.setImmediate(function (arg: string) {
        expect(this).toBe(first);
        order.push(arg);
        timers.setImmediate(() => {
          order.push("nested");
          resolve();
        });
      }, "first");
      timers.setImmediate(() => order.push("second"));
      queueMicrotask(() => order.push("microtask"));
    });
    expect(order).toEqual(["microtask", "first", "second", "nested"]);
    const callback = vi.fn();
    const cleared = timers.setImmediate(callback);
    timers.clearImmediate(cleared);
    await new Promise((resolve) => native.setImmediate(resolve));
    expect(callback).not.toHaveBeenCalled();
    expect(() => Reflect.apply(timers.setImmediate, null, ["bad"])).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });
}
