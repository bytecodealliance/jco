import { type BuiltinContext, type BuiltinAdapter, builtin, starReexportAdapter, stdModule } from "./shared.js";

/** The component test runner and reporters require no additional WIT capabilities. */
export function createTestBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(["node:test", "node:test/reporters"], (specifier) =>
        specifier === "node:test"
            ? starReexportAdapter(stdModule(options.testModule, "test"), "test")
            : starReexportAdapter(stdModule(options.testReportersModule, "test/reporters"), "reporters"),
    );
}
