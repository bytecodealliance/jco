import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { TRACE_EVENTS_WIT_REQUIREMENT } from "../node-wit.js";

export function createTraceEventsBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        "node:trace_events",
        () => {
            const module = JSON.stringify(stdModule(options.traceEventsModule, "trace-events"));

            return `export { default, createTracing, getEnabledCategories } from ${module};`;
        },
        () => options.onWitRequirement?.(TRACE_EVENTS_WIT_REQUIREMENT),
    );
}
