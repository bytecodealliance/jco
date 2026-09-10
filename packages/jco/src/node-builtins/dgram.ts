import {
    type BuiltinContext,
    type BuiltinAdapter,
    builtin,
    composeBuiltins,
    stdModule,
    virtualBuiltin,
    VIRTUAL_PREFIX,
} from "./shared.js";
import { DGRAM_WIT_REQUIREMENT } from "../node-wit.js";

export const DGRAM_CALLBACKS_SPECIFIER = "jco:node-dgram-callbacks";

export function createDgramBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return composeBuiltins([
        builtin(
            "node:dgram",
            () => {
                const module = JSON.stringify(stdModule(options.dgramModule, "dgram"));
                return `export { default, Socket, createSocket, _createSocketHandle } from ${module};`;
            },
            () => options.onWitRequirement?.(DGRAM_WIT_REQUIREMENT),
        ),
        virtualBuiltin(
            DGRAM_CALLBACKS_SPECIFIER,
            `${VIRTUAL_PREFIX}dgram-callbacks`,
            () => `export { dgramCallbacks } from ${JSON.stringify(stdModule(options.dgramModule, "dgram"))};`,
        ),
    ]);
}
