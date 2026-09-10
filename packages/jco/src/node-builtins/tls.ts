import {
    type BuiltinContext,
    type BuiltinAdapter,
    builtin,
    virtualBuiltin,
    composeBuiltins,
    stdModule,
    starReexportAdapter,
    VIRTUAL_PREFIX,
} from "./shared.js";
import { TLS_WIT_REQUIREMENT } from "../node-wit.js";

export function createTlsBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    const module = () => stdModule(options.tlsModule, "tls");
    return composeBuiltins([
        builtin(
            "node:tls",
            () => starReexportAdapter(module(), "tls"),
            () => options.onWitRequirement?.(TLS_WIT_REQUIREMENT),
        ),
        virtualBuiltin(
            "jco:node-tls-callbacks",
            `${VIRTUAL_PREFIX}tls-callbacks`,
            () => `export { tlsCallbacks } from ${JSON.stringify(module())};`,
        ),
    ]);
}
