import { afterEach, expect, test } from "vitest";

import * as named from "../../../../../../src/wasi/0.2.x/node/24.x.x/perf-hooks.js";
import { node, p, resetTimelines, shim } from "../helpers/perf-hooks.js";

afterEach(resetTimelines);

test("pins Node 24 oracle and exact exports, aliases and constants", () => {
  expect(process.versions.node.split(".")[0]).toBe("24");
  expect(Object.keys(shim).sort()).toEqual(Object.keys(node).sort());
  expect(
    Object.keys(named)
      .filter((k) => k !== "default")
      .sort(),
  ).toEqual(Object.keys(node).sort());
  for (const key of Object.keys(shim)) {
    expect(Reflect.get(named, key)).toBe(Reflect.get(shim, key));
  }
  expect(shim.constants).toEqual(node.constants);
  expect(Object.getOwnPropertyDescriptor(shim, "constants")).toEqual({
    value: shim.constants,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  expect(p.timerify).toBe(shim.timerify);
  expect(p.eventLoopUtilization).toBe(shim.eventLoopUtilization);
  expect(p).toBeInstanceOf(shim.Performance);
});

test("matches all constant property descriptors, including hidden binding constants", () => {
  expect(Object.getOwnPropertyDescriptors(shim.constants)).toEqual(
    Object.getOwnPropertyDescriptors(node.constants),
  );
});
