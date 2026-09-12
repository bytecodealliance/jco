import { starReexportAdapter, type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { ZLIB_WIT_REQUIREMENT } from "../node-wit.js";

export function createZlibBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        "node:zlib",
        () => starReexportAdapter(stdModule(options.zlibModule, "zlib"), "zlib"),
        () => options.onWitRequirement?.(ZLIB_WIT_REQUIREMENT),
    );
}
