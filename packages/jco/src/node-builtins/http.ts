import {
    VIRTUAL_PREFIX,
    type BuiltinContext,
    type BuiltinAdapter,
    composeBuiltins,
    virtualBuiltin,
    stdModule,
} from "./shared.js";
import { createProtocolBuiltin } from "./http-common.js";

export const HTTP_CALLBACKS_SPECIFIER = "jco:node-http-callbacks";

const HTTP_CALLBACKS_MODULE = `${VIRTUAL_PREFIX}http-callbacks`;

/** Source for the guest-exported HTTP callback interface used by the component entry wrapper. */
function httpCallbacksAdapter(httpModule: string): string {
    return `export { httpCallbacks } from ${JSON.stringify(httpModule)};`;
}

export function createHttpBuiltin(context: BuiltinContext): BuiltinAdapter {
    return composeBuiltins([
        virtualBuiltin(HTTP_CALLBACKS_SPECIFIER, HTTP_CALLBACKS_MODULE, () =>
            httpCallbacksAdapter(stdModule(context.options.httpModule, "http")),
        ),
        createProtocolBuiltin(context, "http"),
    ]);
}
