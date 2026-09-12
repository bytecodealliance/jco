import { starReexportAdapter, type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { WASI_WIT_REQUIREMENT } from "../node-wit.js";

const WASI_SPECIFIER = "node:wasi";

/**
 * `node:wasi` initialises a uvwasi context in its constructor, which no WASI interface expresses,
 * so the jco-std module imports `jco:node/wasi@0.1.0` and the world gains that import. The
 * capability is denied until the application maps a provider at transpile time -- and even then
 * only construction is honoured, since a component cannot instantiate the nested module the rest
 * of the API drives; the module itself explains that when `start()` or `initialize()` is called.
 */
export function createWasiBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        WASI_SPECIFIER,
        () => starReexportAdapter(stdModule(options.wasiModule, "wasi"), "wasi"),
        () => options.onWitRequirement?.(WASI_WIT_REQUIREMENT),
    );
}
