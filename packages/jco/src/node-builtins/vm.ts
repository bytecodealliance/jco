import { builtin, starReexportAdapter, stdModule, type BuiltinAdapter, type BuiltinContext } from "./shared.js";

/** Evaluation operates on actual guest values and requests no host capability. */
export function createVmBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin("node:vm", () => starReexportAdapter(stdModule(options.vmModule, "vm"), "vm"));
}
