import { starReexportAdapter, type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { V8_WIT_REQUIREMENT } from "../node-wit.js";

export function createV8Builtin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        "node:v8",
        () => starReexportAdapter(stdModule(options.v8Module, "v8"), "v8"),
        () => options.onWitRequirement?.(V8_WIT_REQUIREMENT),
    );
}
