import { unenvModule } from "./unenv.js";
import {
    VIRTUAL_PREFIX,
    type BuiltinContext,
    type BuiltinAdapter,
    composeBuiltins,
    virtualBuiltin,
    stdModule,
    starReexportAdapter,
} from "./shared.js";
import { type NodeErrorGlobalsOptions, type NodeGlobalsOptions } from "./types.js";

const ABORT_GLOBALS_SPECIFIER = "jco:node-abort-globals";

const ABORT_GLOBALS_MODULE = `${VIRTUAL_PREFIX}abort-globals`;

const ERROR_GLOBALS_SPECIFIER = "jco:node-error-globals";

const ERROR_GLOBALS_MODULE = `${VIRTUAL_PREFIX}error-globals`;

const NODE_ERROR_GLOBAL_NAMES = [
    "AggregateError",
    "DOMException",
    "Error",
    "EvalError",
    "RangeError",
    "ReferenceError",
    "SuppressedError",
    "SyntaxError",
    "TypeError",
    "URIError",
] as const;

/**
 * Rolldown injection map for Node's global error constructors.
 *
 * Injection is demand-driven: if source never references one of these globals,
 * Rolldown does not include the errors module in the generated bundle.
 */
export function nodeErrorGlobals(
    options: NodeErrorGlobalsOptions = {},
): Record<string, [module: string, exportName: string]> {
    const errorsModule = options.errorsModule ?? ERROR_GLOBALS_SPECIFIER;
    return Object.fromEntries(NODE_ERROR_GLOBAL_NAMES.map((name) => [name, [errorsModule, name]]));
}

/**
 * Rolldown injection map for Node globals backed by Jco implementations.
 *
 * Web globals are supplied by the engine; Abort globals have a compatibility adapter
 * for engines with the legacy variadic AbortSignal.any implementation.
 * Rolldown includes these adapters only when their free identifiers survive bundling.
 */
export function nodeGlobals(options: NodeGlobalsOptions = {}): Record<string, [module: string, exportName: string]> {
    return {
        ...nodeErrorGlobals(options),
        AbortController: [options.abortGlobalsModule ?? ABORT_GLOBALS_SPECIFIER, "AbortController"],
        AbortSignal: [options.abortGlobalsModule ?? ABORT_GLOBALS_SPECIFIER, "AbortSignal"],
        Buffer: [options.bufferModule ?? "node:buffer", "Buffer"],
        process: [options.processModule ?? "jco:node-process-globals", "default"],
        setImmediate: [options.timersModule ?? "node:timers", "setImmediate"],
        clearImmediate: [options.timersModule ?? "node:timers", "clearImmediate"],
    };
}

export function createGlobalsBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return composeBuiltins([
        // Dependency initialization cannot call host-backed node:process during Wizer.
        // Keep this portable global distinct from explicit imports of that API.
        virtualBuiltin("jco:node-process-globals", `${VIRTUAL_PREFIX}process-globals`, () =>
            starReexportAdapter(unenvModule("node:process", options), "process"),
        ),
        virtualBuiltin(
            ABORT_GLOBALS_SPECIFIER,
            ABORT_GLOBALS_MODULE,
            () => `export * from ${JSON.stringify(stdModule(options.abortGlobalsModule, "abort-globals"))};`,
        ),
        virtualBuiltin(
            ERROR_GLOBALS_SPECIFIER,
            ERROR_GLOBALS_MODULE,
            () => `export * from ${JSON.stringify(stdModule(options.errorsModule, "errors"))};`,
        ),
    ]);
}
