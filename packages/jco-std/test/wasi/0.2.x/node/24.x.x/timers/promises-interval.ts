import native from "node:timers/promises";
import { afterEach, expect, test, vi } from "vitest";
import shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/timers-promises.js";

afterEach(() => vi.useRealTimers());
for (const [name, timers] of [
  ["Node", native],
  ["shim", shim],
] as const) {
  test(`${name}: promise interval repeats, aborts pending next and closes on break`, async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const iterator = timers.setInterval(1, "tick", { signal: controller.signal });
    expect(await iterator.next()).toMatchObject({ done: false, value: "tick" });
    expect(await iterator.next()).toMatchObject({ done: false, value: "tick" });
    const pending = iterator.next();
    controller.abort("stop");
    await expect(pending).rejects.toMatchObject({ code: "ABORT_ERR", cause: "stop" });
    expect(remove).toHaveBeenCalled();
    expect(await iterator.next()).toMatchObject({ done: true });
    for await (const value of timers.setInterval(1, 7)) {
      expect(value).toBe(7);
      break;
    }
    const invalid = Reflect.apply(timers.setInterval, null, ["bad"]);
    await expect(invalid.next()).rejects.toHaveProperty("code", "ERR_INVALID_ARG_TYPE");
  });
}

test("slow consumers retain every tick and return clears the timer", async () => {
  vi.useFakeTimers();
  const iterator = shim.setInterval(10, 5);
  const first = iterator.next();
  await vi.advanceTimersByTimeAsync(30);
  expect(await first).toEqual({ value: 5, done: false });
  expect(await iterator.next()).toEqual({ value: 5, done: false });
  expect(await iterator.next()).toEqual({ value: 5, done: false });
  await iterator.return();
  expect(vi.getTimerCount()).toBe(0);
});
