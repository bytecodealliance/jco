import * as host from "jco:node/trace-events@0.1.0";

import { createTraceEvents } from "./trace-events/core.js";

export type { CreateTracingOptions, Tracing, TraceEvents } from "./trace-events/types.js";

const traceEvents = createTraceEvents(host);

export const createTracing = traceEvents.createTracing;

export const getEnabledCategories = traceEvents.getEnabledCategories;

export default traceEvents;
