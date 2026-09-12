import * as node from "node:trace_events";
import { describe, expect, test } from "vitest";

import { createTraceEvents } from "../../../../../../src/wasi/0.2.x/node/24.x.x/trace-events/core.js";
import * as denied from "../../../../../../src/wasi/0.2.x/node/24.x.x/trace-events-host.js";
import type { CreateTracingOptions } from "../../../../../../src/wasi/0.2.x/node/24.x.x/trace-events/types.js";

const api = createTraceEvents(denied);

function failure(operation: () => unknown): object {
  try {
    operation();
  } catch (error) {
    if (error instanceof Error) {
      return {
        name: error.name,
        code: "code" in error ? error.code : undefined,
        message: error.message,
      };
    }

    throw error;
  }

  throw new Error("Expected validation to fail");
}

// The runtime, not rolling documentation, defines strict string validation.
// Keep this oracle on the target major rather than silently accepting later API changes.
describe.skipIf(process.versions.node.split(".")[0] !== "24")("Node 24 validation oracle", () => {
  const invalid: unknown[] = [
    undefined,
    null,
    false,
    1,
    "options",
    [],
    () => {},
    {},
    { categories: undefined },
    { categories: null },
    { categories: "node" },
    { categories: new Set(["node"]) },
    { categories: [] },
    { categories: [1] },
    { categories: [null] },
    { categories: [Symbol("category")] },
    { categories: ["node", false] },
    { categories: Array(1) },
  ];

  test.each(invalid.map((value, index) => ({ value, index })))(
    "rejects invalid input $index like Node",
    ({ value }) => {
      // Deliberately cross the typed public boundary to exercise runtime validation.
      const options = value as CreateTracingOptions;

      expect(failure(() => api.createTracing(options))).toEqual(
        failure(() => node.createTracing(options)),
      );
    },
  );
});

test("empty categories use Node's stable error", () => {
  expect(failure(() => api.createTracing({ categories: [] }))).toEqual({
    name: "TypeError",
    code: "ERR_TRACE_EVENTS_CATEGORY_REQUIRED",
    message: "At least one category is required",
  });
});

test.each([[""], ["b", "a", "a"], ["a,b", " a "], ["é", "𝄞"]])(
  "accepts category list %j",
  (...categories) => {
    expect(api.createTracing({ categories }).categories).toBe(categories.join(","));
  },
);

test("does not coerce invalid values or swallow getter exceptions", () => {
  let coerced = false;
  const bad = {
    toString() {
      coerced = true;
      return "node";
    },
  };

  expect(() => api.createTracing({ categories: [bad] } as unknown as CreateTracingOptions)).toThrow(
    TypeError,
  );
  expect(coerced).toBe(false);

  const error = new Error("category getter");
  const options = {
    get categories(): string[] {
      throw error;
    },
  };

  expect(() => api.createTracing(options)).toThrow(error);
});
