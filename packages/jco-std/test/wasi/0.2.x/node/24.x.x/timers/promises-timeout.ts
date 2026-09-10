import native from "node:timers/promises";
import { expect, test, vi } from "vitest";
import shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/timers-promises.js";

for (const [name, timers] of [
  ["Node", native],
  ["shim", shim],
] as const) {
  test(`${name}: promise timeout resolves values and rejects abort with cause`, async () => {
    const value = {};
    expect(await timers.setTimeout(1, value)).toBe(value);
    expect(await timers.setTimeout()).toBeUndefined();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = timers.setTimeout(1000, value, { signal: controller.signal });
    const reason = { stopped: true };
    controller.abort(reason);
    await expect(pending).rejects.toMatchObject({
      name: "AbortError",
      code: "ABORT_ERR",
      message: "The operation was aborted",
      cause: reason,
    });
    expect(remove).toHaveBeenCalled();
    await expect(timers.setTimeout(1, value, { signal: controller.signal })).rejects.toHaveProperty(
      "cause",
      reason,
    );
  });

  test(`${name}: options and delay errors reject, including validation before abort`, async () => {
    for (const [delay, options] of [
      ["1", {}],
      [1n, {}],
      [1, null],
      [1, []],
      [1, { ref: 0 }],
      [1, { signal: null }],
      [1, { signal: {} }],
    ]) {
      const pending = Reflect.apply(timers.setTimeout, null, [delay, undefined, options]);
      await expect(pending).rejects.toMatchObject({
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
      });
    }
    await expect(
      timers.setTimeout(1, undefined, {
        signal: AbortSignal.abort(),
        ref: "bad" as unknown as boolean,
      }),
    ).rejects.toHaveProperty("code", "ERR_INVALID_ARG_TYPE");
  });
}
