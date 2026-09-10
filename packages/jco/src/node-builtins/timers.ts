import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule, starReexportAdapter } from "./shared.js";

/** Both timer specifiers share an engine-backed core and request no additional WIT. */
export function createTimersBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(["node:timers", "node:timers/promises"], (specifier) => {
        const promises = specifier === "node:timers/promises";
        return starReexportAdapter(
            stdModule(
                promises ? options.timersPromisesModule : options.timersModule,
                promises ? "timers/promises" : "timers",
            ),
            promises ? "timersPromises" : "timers",
        );
    });
}
