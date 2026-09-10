import { builtin, starReexportAdapter, stdModule, type BuiltinContext, type BuiltinAdapter } from "./shared.js";

export function createUtilBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(["node:util", "node:util/types"], (specifier) =>
        starReexportAdapter(
            specifier === "node:util"
                ? stdModule(options.utilModule, "util")
                : stdModule(options.utilTypesModule, "util/types"),
            "util",
        ),
    );
}
