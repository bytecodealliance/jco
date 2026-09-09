import { afterEach, expect, test } from "vitest";

import { node, p, resetTimelines, resource } from "../helpers/perf-hooks.js";

afterEach(resetTimelines);

type Timeline = typeof p | typeof node.performance;
type Query = (perf: Timeline) => Array<{ toJSON(): unknown }>;

test.each<[string, Query]>([
  ["getEntries", (perf) => perf.getEntries()],
  ["getEntriesByName", (perf) => perf.getEntriesByName("a")],
  ["getEntriesByName with a type", (perf) => perf.getEntriesByName("a", "mark")],
  ["getEntriesByType", (perf) => perf.getEntriesByType("mark")],
])("%s returns a sorted independent list", (_, query) => {
  for (const perf of [p, node.performance]) {
    perf.mark("a", { startTime: 8 });
    perf.mark("b", { startTime: 0 });
    perf.mark("a", { startTime: 2 });
  }
  const entries = query(p);
  expect(entries.map((e) => e.toJSON())).toEqual(query(node.performance).map((e) => e.toJSON()));
  entries.pop();
  expect(p.getEntries()).toHaveLength(3);
});

test.each([
  ["clearMarks", "mark"],
  ["clearMeasures", "measure"],
  ["clearResourceTimings", "resource"],
] as const)("%s clears only matching type and name", (method, type) => {
  p.mark("", { startTime: 0 });
  p.mark("keep", { startTime: 1 });
  p.measure("", { start: 0, end: 2 });
  resource("");
  p[method]("");
  expect(p.getEntriesByName("").map((e) => e.entryType)).toEqual(
    ["mark", "measure", "resource"].filter((t) => t !== type),
  );
  expect(p.getEntriesByName("keep")).toHaveLength(1);
  p[method]();
  expect(p.getEntriesByType(type)).toEqual([]);
  expect(p.getEntries()).toHaveLength(type === "mark" ? 2 : 3);
});
