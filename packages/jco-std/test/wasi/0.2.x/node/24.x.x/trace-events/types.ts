import type * as node from "node:trace_events";
import { expectTypeOf, test } from "vitest";

import type {
  CreateTracingOptions,
  Tracing,
  TraceEvents,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/trace-events.js";
import type { createTraceEvents } from "../../../../../../src/wasi/0.2.x/node/24.x.x/trace-events/core.js";

// These declarations must remain usable without importing node:* at runtime.
test("public declarations preserve the Node options, readonly state and return types", () => {
  expectTypeOf<CreateTracingOptions>().toEqualTypeOf<node.CreateTracingOptions>();
  expectTypeOf<Tracing>().toEqualTypeOf<node.Tracing>();
  expectTypeOf<TraceEvents["createTracing"]>().toEqualTypeOf<typeof node.createTracing>();
  expectTypeOf<TraceEvents["getEnabledCategories"]>().toEqualTypeOf<
    typeof node.getEnabledCategories
  >();
  expectTypeOf<ReturnType<typeof createTraceEvents>>().toEqualTypeOf<TraceEvents>();
});
