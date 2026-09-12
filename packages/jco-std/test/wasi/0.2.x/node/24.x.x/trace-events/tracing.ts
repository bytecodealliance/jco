import { expect, test, vi } from "vitest";

import { createTraceEvents } from "../../../../../../src/wasi/0.2.x/node/24.x.x/trace-events/core.js";
import * as denied from "../../../../../../src/wasi/0.2.x/node/24.x.x/trace-events-host.js";

function setup() {
  const stop = vi.fn();
  const dispose = vi.fn();
  const start = vi.fn(() => ({ stop }));
  const api = createTraceEvents({
    TraceSession: { start },
    release: dispose,
    getEnabledCategories: vi.fn(),
  });

  return { api, start, stop, dispose };
}

test("starts once, stops once, releases resources and can be enabled again", () => {
  const { api, start, stop, dispose } = setup();
  const tracing = api.createTracing({ categories: ["example"] });

  expect(tracing.disable()).toBeUndefined();
  expect(stop).not.toHaveBeenCalled();
  expect(tracing.enable()).toBeUndefined();
  tracing.enable();

  expect(tracing.enabled).toBe(true);
  expect(start).toHaveBeenCalledExactlyOnceWith(["example"]);

  tracing.disable();
  tracing.disable();

  expect(tracing.enabled).toBe(false);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);

  tracing.enable();
  expect(start).toHaveBeenCalledTimes(2);
  tracing.disable();
});

test("category display follows the original array while capture uses its construction snapshot", () => {
  const { api, start } = setup();
  const categories = ["b", "a", "a"];
  const tracing = api.createTracing({ categories });

  categories.splice(0, 3, "changed");
  expect(tracing.categories).toBe("changed");

  tracing.enable();
  expect(start).toHaveBeenCalledExactlyOnceWith(["b", "a", "a"]);
  tracing.disable();
});

test("denied operations are catchable and never claim tracing is enabled", () => {
  const api = createTraceEvents(denied);
  const tracing = api.createTracing({ categories: ["example"] });
  const expected = { code: "ERR_JCO_TRACE_EVENTS_ADAPTER_REQUIRED" };

  expect(() => tracing.enable()).toThrow(expect.objectContaining(expected));
  expect(tracing.enabled).toBe(false);
  expect(tracing.disable()).toBeUndefined();
  expect(() => api.getEnabledCategories()).toThrow(expect.objectContaining(expected));
});

test("failed start and stop preserve state and reconstruct host errors", () => {
  const { api, start, stop, dispose } = setup();
  const tracing = api.createTracing({ categories: ["example"] });
  const failure = { name: "TypeError", code: "ERR_TEST", message: "host failure" };

  start.mockImplementationOnce(() => {
    throw failure;
  });
  expect(() => tracing.enable()).toThrow(
    expect.objectContaining({ name: "TypeError", code: "ERR_TEST", message: "host failure" }),
  );
  expect(tracing.enabled).toBe(false);

  tracing.enable();
  stop.mockImplementationOnce(() => {
    throw failure;
  });
  expect(() => tracing.disable()).toThrow(TypeError);
  expect(tracing.enabled).toBe(true);
  expect(dispose).not.toHaveBeenCalled();

  tracing.disable();
  expect(tracing.enabled).toBe(false);
});
