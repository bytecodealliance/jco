import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { CONSOLE_WIT_REQUIREMENT } from "../node-wit.js";

const CONSOLE_SPECIFIER = "node:console";

/** Source of the `node:console` ESM facade. */
function consoleAdapter(consoleModule: string): string {
    return `
import console from ${JSON.stringify(consoleModule)};
export default console;
export {
    Console,
    assert,
    clear,
    count,
    countReset,
    debug,
    dir,
    dirxml,
    error,
    group,
    groupCollapsed,
    groupEnd,
    info,
    log,
    profile,
    profileEnd,
    table,
    time,
    timeEnd,
    timeLog,
    timeStamp,
    trace,
    warn,
} from ${JSON.stringify(consoleModule)};
`;
}

export function createConsoleBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        CONSOLE_SPECIFIER,
        () => consoleAdapter(stdModule(options.consoleModule, "console")),
        () => options.onWitRequirement?.(CONSOLE_WIT_REQUIREMENT),
    );
}
