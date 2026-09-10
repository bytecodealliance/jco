import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("inspect supports descriptors, custom hooks, limits and circular references", () => {
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  const custom = {
    [util.inspect.custom]() {
      return { custom: true };
    },
  };
  const values: unknown[] = [
    undefined,
    null,
    {},
    [],
    [1, , 3],
    { x: 1, s: "a" },
    cycle,
    custom,
    new Map([["a", 1]]),
    new Set([1, 2]),
    {
      get safe() {
        throw Error("not evaluated");
      },
    },
    Object(1),
    Object("ab"),
  ];
  for (const value of values) {
    expect(util.inspect(value)).toBe(native.inspect(value));
  }
  for (const options of [
    { sorted: true },
    { showHidden: true },
    { depth: 0 },
    { compact: false },
    { colors: true },
    { maxArrayLength: 1 },
  ]) {
    expect(util.inspect({ z: 1, a: [1, 2] }, options)).toBe(
      native.inspect({ z: 1, a: [1, 2] }, options),
    );
  }
  expect(() => util.inspect({}, { showProxy: true })).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});

test("inspect.defaultOptions merges updates and affects subsequent calls", () => {
  const before = { ...util.inspect.defaultOptions };
  try {
    util.inspect.defaultOptions = { depth: 0 };
    expect(util.inspect({ a: { b: 1 } })).toBe("{ a: [Object] }");
  } finally {
    util.inspect.defaultOptions = before;
  }
});

test("inspect renders buffers, views and numeric separators", () => {
  for (const value of [
    new ArrayBuffer(0),
    new ArrayBuffer(2),
    new DataView(new ArrayBuffer(2)),
    Object(false),
    Object(1n),
    Object(Symbol("x")),
    12345.12345,
    -0,
    1e30,
    1e-9,
    123456789n,
  ]) {
    for (const options of [
      {},
      { depth: 0 },
      { maxArrayLength: 1 },
      { colors: true },
      { numericSeparator: true },
    ]) {
      expect(util.inspect(value, options)).toBe(native.inspect(value, options));
    }
  }
});
