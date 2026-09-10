import native from "node:timers/promises";
import { expect, test } from "vitest";
import shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/timers-promises.js";

for (const [name, { scheduler }] of [
  ["Node", native],
  ["shim", shim],
] as const) {
  test(`${name}: scheduler methods, brand checks and illegal constructor`, async () => {
    expect(await scheduler.wait(1)).toBeUndefined();
    expect(await scheduler.yield()).toBeUndefined();
    expect(() => Reflect.apply(scheduler.yield, {}, [])).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_THIS" }),
    );
    expect(() => Reflect.apply(scheduler.wait, undefined, [1])).toThrow(TypeError);
    expect(() => Reflect.construct(scheduler.constructor, [])).toThrow(
      expect.objectContaining({ code: "ERR_ILLEGAL_CONSTRUCTOR" }),
    );
    await expect(scheduler.wait(1, { signal: AbortSignal.abort("stop") })).rejects.toHaveProperty(
      "cause",
      "stop",
    );
  });
}
