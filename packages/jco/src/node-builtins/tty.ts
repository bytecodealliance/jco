import { starReexportAdapter, type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { TTY_WIT_REQUIREMENT } from "../node-wit.js";

const TTY_SPECIFIER = "node:tty";

/**
 * `node:tty` addresses the host process's terminals by descriptor, which no WASI interface
 * expresses, so the jco-std module imports `jco:node/tty@0.1.0` and the world gains that import.
 * The capability is denied until the application maps a provider at transpile time.
 */
export function createTtyBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        TTY_SPECIFIER,
        () => starReexportAdapter(stdModule(options.ttyModule, "tty"), "tty"),
        () => options.onWitRequirement?.(TTY_WIT_REQUIREMENT),
    );
}
