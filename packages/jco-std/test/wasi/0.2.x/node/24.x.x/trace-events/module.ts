import node from "node:trace_events";
import { inspect } from "node:util";
import { expect, test, vi } from "vitest";

import { createTraceEvents } from "../../../../../../src/wasi/0.2.x/node/24.x.x/trace-events/core.js";
import * as denied from "../../../../../../src/wasi/0.2.x/node/24.x.x/trace-events-host.js";

const api = createTraceEvents(denied);

test("matches the Node default export keys and function arities", () => {
  expect(Object.keys(api).sort()).toEqual(Object.keys(node).sort());
  expect(api.createTracing.name).toBe("createTracing");
  expect(api.createTracing.length).toBe(node.createTracing.length);
  expect(api.getEnabledCategories.length).toBe(node.getEnabledCategories.length);
});

test("preserves Tracing's prototype, getters, method descriptors, and inspection hook", () => {
  const actual = api.createTracing({ categories: ["node.perf"] });
  const expected = node.createTracing({ categories: ["node.perf"] });
  const prototype = Object.getPrototypeOf(actual);
  const nodePrototype = Object.getPrototypeOf(expected);

  expect(Object.getOwnPropertyDescriptors(actual)).toEqual({});
  expect(Reflect.ownKeys(prototype)).toEqual(Reflect.ownKeys(nodePrototype));
  expect(prototype.constructor.name).toBe("Tracing");
  expect(() => prototype.constructor([])).toThrow(TypeError);

  for (const key of Reflect.ownKeys(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key)!;
    const oracle = Object.getOwnPropertyDescriptor(nodePrototype, key)!;

    expect(descriptor.enumerable).toBe(oracle.enumerable);
    expect(descriptor.configurable).toBe(oracle.configurable);
    expect(descriptor.writable).toBe(oracle.writable);
    expect(typeof descriptor.get).toBe(typeof oracle.get);
    expect(typeof descriptor.set).toBe(typeof oracle.set);
  }

  expect(inspect(actual)).toBe(inspect(expected));
  expect(inspect(actual)).toBe("Tracing { enabled: false, categories: 'node.perf' }");
  expect(prototype[Symbol.for("nodejs.util.inspect.custom")].call(actual, -1, {})).toBe(actual);
  expect(() => prototype.enable.call({})).toThrow(TypeError);
});

test("importing and constructing do not access the provider", () => {
  const provider = new Proxy(denied, {
    get: vi.fn(() => {
      throw new Error("unexpected host access");
    }),
  });
  const local = createTraceEvents(provider);
  const tracing = local.createTracing({ categories: ["example"] });

  expect(tracing.enabled).toBe(false);
  expect(tracing.categories).toBe("example");
  expect(tracing.disable()).toBeUndefined();
});
