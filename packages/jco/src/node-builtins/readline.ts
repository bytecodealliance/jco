import { starReexportAdapter, type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";

const READLINE_SPECIFIERS = new Set(["node:readline", "node:readline/promises"]);

export function createReadlineBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(READLINE_SPECIFIERS, (specifier) => {
        const module =
            specifier === "node:readline"
                ? stdModule(options.readlineModule, "readline")
                : stdModule(options.readlinePromisesModule, "readline/promises");
        return starReexportAdapter(module, "readline");
    });
}
