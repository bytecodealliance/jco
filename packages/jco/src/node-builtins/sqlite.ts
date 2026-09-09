import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { SQLITE_WIT_REQUIREMENT } from "../node-wit.js";

export function createSqliteBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        "node:sqlite",
        () => {
            const module = JSON.stringify(stdModule(options.sqliteModule, "sqlite"));
            return `export { default } from ${module}; export * from ${module};`;
        },
        () => options.onWitRequirement?.(SQLITE_WIT_REQUIREMENT),
    );
}
