import {
    type BuiltinContext,
    type BuiltinAdapter,
    builtin,
    stdModule,
    starReexportAdapter,
    composeBuiltins,
    virtualBuiltin,
    VIRTUAL_PREFIX,
} from "./shared.js";
import { TIMERS_WIT_REQUIREMENT } from "../node-wit.js";

/** Both timer specifiers share an engine-backed core and request no additional WIT. */
export function createTimersBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return composeBuiltins([
        virtualBuiltin(
            "jco:node-timer-callbacks",
            `${VIRTUAL_PREFIX}timer-callbacks`,
            () => `export { timersCallbacks } from ${JSON.stringify(stdModule(undefined, "timers/task-runtime"))};`,
        ),
        builtin(
            ["node:timers", "node:timers/promises"],
            (specifier) => {
                const promises = specifier === "node:timers/promises";
                const setup = options.hostTaskTimers
                    ? `
import * as timerHost from "jco:node/timers@0.1.0";
import { createTaskTimerRuntime } from ${JSON.stringify(stdModule(undefined, "timers/task-runtime"))};
import { setFallbackScheduler } from ${JSON.stringify(stdModule(undefined, "timers/runtime"))};
setFallbackScheduler(createTaskTimerRuntime(timerHost));
`
                    : "";
                return (
                    setup +
                    starReexportAdapter(
                        stdModule(
                            promises ? options.timersPromisesModule : options.timersModule,
                            promises ? "timers/promises" : "timers",
                        ),
                        promises ? "timersPromises" : "timers",
                    )
                );
            },
            () => {
                if (options.hostTaskTimers) {
                    options.onWitRequirement?.(TIMERS_WIT_REQUIREMENT);
                }
            },
        ),
    ]);
}
