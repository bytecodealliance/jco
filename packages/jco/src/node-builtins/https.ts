import { type BuiltinContext, type BuiltinAdapter } from "./shared.js";
import { createProtocolBuiltin } from "./http-common.js";

export function createHttpsBuiltin(context: BuiltinContext): BuiltinAdapter {
    return createProtocolBuiltin(context, "https");
}
