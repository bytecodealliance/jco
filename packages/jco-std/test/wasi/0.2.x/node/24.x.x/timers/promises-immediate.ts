import native from "node:timers/promises";
import { expect, test, vi } from "vitest";
import shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/timers-promises.js";

for (const [name, timers] of [
  ["Node", native],
  ["shim", shim],
] as const) {
  test(`${name}: promise immediate is a task and cleans up abort listeners`, async () => {
    const order: string[] = [];
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = timers.setImmediate("value", { signal: controller.signal });
    pending.then(() => order.push("task"));
    await Promise.resolve();
    expect(order).toEqual([]);
    expect(await pending).toBe("value");
    expect(remove).toHaveBeenCalled();
    const aborted = timers.setImmediate(undefined, { signal: controller.signal });
    controller.abort("stop");
    await expect(aborted).rejects.toMatchObject({ code: "ABORT_ERR", cause: "stop" });
    await expect(
      Reflect.apply(timers.setImmediate, null, [undefined, { ref: "no" }]),
    ).rejects.toHaveProperty("code", "ERR_INVALID_ARG_TYPE");
  });
}
