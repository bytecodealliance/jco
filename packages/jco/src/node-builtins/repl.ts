import { starReexportAdapter, type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";

const REPL_SPECIFIER = "node:repl";

/**
 * `node:repl` is entirely guest-side -- evaluation, line editing and completion over the streams
 * the application supplies -- so it reports no WIT requirement. The jco-std module is the only one
 * that bundles acorn; resolving it here, and nowhere else, keeps the parser out of every other
 * component.
 */
export function createReplBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(REPL_SPECIFIER, () => starReexportAdapter(stdModule(options.replModule, "repl"), "repl"));
}
