import { afterEach, expect, test, vi } from "vitest";
import timers from "../../../../../../src/wasi/0.2.x/node/24.x.x/timers.js";

// Deterministic browser-style scheduler: real numeric handles and no ref methods.
function browserTimers(): {
  tasks: Map<number, { callback: () => void; delay: number }>;
  tick(): void;
} {
  const tasks = new Map<number, { callback: () => void; delay: number }>();
  let nextId = 1;
  const start = (callback: () => void, delay: number): number => {
    const id = nextId++;
    tasks.set(id, { callback, delay });
    return id;
  };
  vi.stubGlobal("setTimeout", start);
  vi.stubGlobal("setInterval", start);
  vi.stubGlobal("clearTimeout", (id: number) => tasks.delete(id));
  vi.stubGlobal("clearInterval", (id: number) => tasks.delete(id));
  vi.stubGlobal("setImmediate", undefined);
  vi.stubGlobal("clearImmediate", undefined);
  return {
    tasks,
    tick(): void {
      const ready = [...tasks.keys()];
      for (const id of ready) {
        const task = tasks.get(id);
        tasks.delete(id);
        task?.callback();
      }
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("normalizes callback delays before passing them to Web timers", () => {
  const { tasks } = browserTimers();
  for (const [value, expected] of [
    [undefined, 1],
    [0, 1],
    [-1, 1],
    [NaN, 1],
    [Infinity, 1],
    [2 ** 31, 1],
    [2.9, 2],
    ["4", 4],
    [null, 1],
  ] as const) {
    const timer = Reflect.apply(timers.setTimeout, null, [() => {}, value]);
    expect([...tasks.values()][0].delay).toBe(expected);
    timer[Symbol.dispose]();
    expect(tasks.size).toBe(0);
  }
});

test("numeric handles support cancellation, refresh and honest liveness errors", async () => {
  const { tasks, tick } = browserTimers();
  const callback = vi.fn();
  const timer = timers.setTimeout(callback, 5);
  expect(timer.ref()).toBe(timer);
  expect(timer.hasRef()).toBe(true);
  expect(() => timer.unref()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
  expect(timer.hasRef()).toBe(true);
  timer.refresh();
  expect(tasks.size).toBe(1);
  tick();
  expect(callback).toHaveBeenCalledTimes(1);
  timer.refresh();
  timers.clearTimeout(String(+timer));
  expect(tasks.size).toBe(0);
  for (const pending of [
    timers.promises.setTimeout(5, 1, { ref: false }),
    timers.promises.setImmediate(1, { ref: false }),
    timers.promises.setInterval(5, 1, { ref: false }).next(),
  ]) {
    await expect(pending).rejects.toHaveProperty("code", "ERR_JCO_UNSUPPORTED_NODE_API");
  }
  expect(tasks.size).toBe(0);
});

test("immediate fallback uses task turns with cancellation and nested ordering", () => {
  const { tick } = browserTimers();
  const order: number[] = [];
  timers.setImmediate(() => {
    order.push(1);
    timers.setImmediate(() => order.push(3));
  });
  timers.setImmediate(() => order.push(2));
  timers.clearImmediate(timers.setImmediate(() => order.push(99)));
  expect(order).toEqual([]);
  tick();
  expect(order).toEqual([1, 2]);
  tick();
  expect(order).toEqual([1, 2, 3]);
});

test("no engine timers: fail lazily, preserve validation and pre-abort", async () => {
  vi.stubGlobal("setTimeout", undefined);
  vi.stubGlobal("setInterval", undefined);
  vi.stubGlobal("setImmediate", undefined);
  expect(Object.keys(timers)).toHaveLength(7);
  for (const name of ["setTimeout", "setInterval", "setImmediate"] as const) {
    expect(() => timers[name](() => {})).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(() => Reflect.apply(timers[name], null, [null])).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  }
  await expect(timers.promises.setTimeout()).rejects.toHaveProperty(
    "code",
    "ERR_JCO_UNSUPPORTED_NODE_API",
  );
  await expect(timers.promises.setImmediate()).rejects.toHaveProperty(
    "code",
    "ERR_JCO_UNSUPPORTED_NODE_API",
  );
  await expect(timers.promises.setInterval().next()).rejects.toHaveProperty(
    "code",
    "ERR_JCO_UNSUPPORTED_NODE_API",
  );
  await expect(
    timers.promises.setTimeout(1, undefined, { signal: AbortSignal.abort("stop") }),
  ).rejects.toMatchObject({ code: "ABORT_ERR", cause: "stop" });
});

test("abort after a timer fired cannot change its fulfilled value", async () => {
  const { tick, tasks } = browserTimers();
  const controller = new AbortController();
  const pending = timers.promises.setTimeout(1, "done", { signal: controller.signal });
  tick();
  controller.abort("late");
  expect(await pending).toBe("done");
  expect(tasks.size).toBe(0);
});
