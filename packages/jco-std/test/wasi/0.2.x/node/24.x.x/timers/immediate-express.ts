import { describe, expect, test } from "vitest";

import {
  clearImmediate,
  setImmediate,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/timers/index.js";

describe("setImmediate", () => {
  test("runs the callback after the current stack unwinds", async () => {
    const order: string[] = [];
    const ran = new Promise<void>((resolve) => {
      setImmediate(() => {
        order.push("immediate");
        resolve();
      });
      order.push("sync");
    });
    await ran;
    expect(order).toEqual(["sync", "immediate"]);
  });

  test("passes arguments through, as node does", async () => {
    const seen = await new Promise<unknown[]>((resolve) => {
      setImmediate((...args: unknown[]) => resolve(args), 1, "two", { three: true });
    });
    expect(seen).toEqual([1, "two", { three: true }]);
  });

  test("can be cancelled before it runs", async () => {
    let ran = false;
    const handle = setImmediate(() => {
      ran = true;
    });
    clearImmediate(handle);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(ran).toBe(false);
  });

  test("tolerates clearing nothing", () => {
    expect(() => clearImmediate(undefined)).not.toThrow();
  });

  test("returns a handle carrying node's ref surface", () => {
    const handle = setImmediate(() => {});
    expect(handle.hasRef()).toBe(true);
    expect(handle.unref().hasRef()).toBe(false);
    expect(handle.ref().hasRef()).toBe(true);
    clearImmediate(handle);
  });

  test("rejects a non-function callback, as node does", () => {
    expect(() => setImmediate(undefined as unknown as () => void)).toThrowError(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });
});
