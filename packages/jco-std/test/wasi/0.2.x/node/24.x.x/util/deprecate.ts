import { expect, test, vi } from "vitest";
import util from "../../../../../../src/wasi/0.2.x/node/24.x.x/util/index.js";

test("deprecate preserves calls and constructor prototypes and warns once", () => {
  const warning = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
  try {
    const receiver = { value: 4 };
    const fn = util.deprecate(function (this: typeof receiver, extra: number) {
      return this.value + extra;
    }, "old");
    expect(fn.call(receiver, 2)).toBe(6);
    expect(fn.call(receiver, 3)).toBe(7);
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockClear();
    function Legacy(this: { value: number }, value: number) {
      this.value = value;
    }
    const Wrapped = util.deprecate(Legacy, "old constructor");
    const instance = Reflect.construct(Wrapped, [9]);
    expect(instance).toBeInstanceOf(Legacy);
    expect(instance.value).toBe(9);
    expect(warning).toHaveBeenCalledTimes(1);
  } finally {
    warning.mockRestore();
  }
});
