import { afterEach, expect, test } from "vitest";

import { matchesNode, p, resetTimelines, shim } from "../helpers/perf-hooks.js";

afterEach(resetTimelines);

test("buffers synchronously, drains and disconnects", () => {
  const observer = new shim.PerformanceObserver(() => {});
  observer.observe({ entryTypes: ["mark", "measure"] });
  p.mark("x", { startTime: 3 });
  p.measure("x", { start: 0, end: 5 });
  expect(observer.takeRecords().map((e) => e.entryType)).toEqual(["mark", "measure"]);
  expect(observer.takeRecords()).toEqual([]);
  observer.disconnect();
  p.mark("y", { startTime: 4 });
  expect(observer.takeRecords()).toEqual([]);
});

test("delivers sorted asynchronous entries and buffered records", async () => {
  p.mark("old", { startTime: 1 });
  await new Promise<void>((resolve) => {
    const observer = new shim.PerformanceObserver((list, self) => {
      expect(self).toBe(observer);
      expect(list.getEntriesByType("mark").map((e) => e.name)).toEqual(["old", "new"]);
      expect(list.getEntriesByName("old")).toHaveLength(1);
      self.disconnect();
      resolve();
    });
    observer.observe({ type: "mark", buffered: true });
    p.mark("new", { startTime: 2 });
  });
});

test("enforces observation mode until disconnect", () => {
  const observer = new shim.PerformanceObserver(() => {});
  observer.observe({ type: "mark" });
  expect(() => observer.observe({ entryTypes: ["measure"] })).toThrow(
    expect.objectContaining({ name: "InvalidModificationError" }),
  );
  observer.disconnect();
  observer.observe({ entryTypes: ["measure"] });
  observer.disconnect();
  expect(() => observer.observe()).toThrow(expect.objectContaining({ code: "ERR_MISSING_ARGS" }));
});

test("matches Node's validation errors, including their presentation", () => {
  matchesNode((m) => new m.PerformanceObserver(5 as never));
  matchesNode((m) => new m.PerformanceObserver(() => {}).observe(5 as never));
  matchesNode((m) => new m.PerformanceObserver(() => {}).observe([] as never));
  matchesNode((m) => new m.PerformanceObserver(() => {}).observe({} as never));
  matchesNode((m) => new m.PerformanceObserver(() => {}).observe({ entryTypes: "mark" } as never));
  expect(
    thrownCode(() =>
      new shim.PerformanceObserver(() => {}).observe({ entryTypes: ["mark"], type: "mark" }),
    ),
  ).toBe("ERR_INVALID_ARG_VALUE");
});

function thrownCode(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return undefined;
}

test("locks the observation mode exactly as Node does", () => {
  const locked = (first: object, second: object) =>
    matchesNode((m) => {
      const observer = new m.PerformanceObserver(() => {});
      observer.observe(first as never);
      try {
        observer.observe(second as never);
      } finally {
        observer.disconnect();
      }
    });
  locked({ type: "mark" }, { entryTypes: ["mark"] });
  locked({ entryTypes: ["mark"] }, { type: "mark" });
  // An unsupported single type is ignored but still locks the mode.
  locked({ type: "bogus" }, { entryTypes: ["mark"] });
  // Entry types with nothing supported disconnect, which unlocks it.
  locked({ entryTypes: ["bogus"] }, { type: "mark" });
});

test("ignores unsupported types without recording anything", () => {
  const observer = new shim.PerformanceObserver(() => {});
  observer.observe({ type: "bogus" });
  p.mark("x", { startTime: 1 });
  expect(observer.takeRecords()).toEqual([]);
  observer.disconnect();
  observer.observe({ entryTypes: ["bogus", "mark"] });
  p.mark("y", { startTime: 2 });
  expect(observer.takeRecords().map((e) => e.name)).toEqual(["y"]);
  observer.disconnect();
});

test("entry lists filter by name and type and hand out copies", async () => {
  const list = await new Promise<InstanceType<typeof shim.PerformanceObserverEntryList>>(
    (resolve) => {
      const observer = new shim.PerformanceObserver((entries, self) => {
        self.disconnect();
        resolve(entries);
      });
      observer.observe({ entryTypes: ["mark", "measure"] });
      p.mark("a", { startTime: 1 });
      p.measure("a", { start: 0, end: 2 });
      p.mark("b", { startTime: 3 });
    },
  );
  expect(list.getEntries().map((e) => e.name)).toEqual(["a", "a", "b"]);
  expect(list.getEntriesByName("a").map((e) => e.entryType)).toEqual(["measure", "mark"]);
  expect(list.getEntriesByName("a", "mark")).toHaveLength(1);
  expect(list.getEntriesByType("measure")).toHaveLength(1);
  list.getEntries().pop();
  expect(list.getEntries()).toHaveLength(3);
  for (const method of [list.getEntriesByName, list.getEntriesByType]) {
    expect(() => Reflect.apply(method, list, [])).toThrow(
      expect.objectContaining({ code: "ERR_MISSING_ARGS" }),
    );
  }
});
