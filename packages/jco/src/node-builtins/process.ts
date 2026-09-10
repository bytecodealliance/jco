import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { PROCESS_WIT_REQUIREMENT } from "../node-wit.js";

export function createProcessBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        "node:process",
        () => {
            const module = JSON.stringify(stdModule(options.processModule, "process"));
            return `export { default } from ${module}; export * from ${module};`;
        },
        () => options.onWitRequirement?.(PROCESS_WIT_REQUIREMENT),
    );
}
