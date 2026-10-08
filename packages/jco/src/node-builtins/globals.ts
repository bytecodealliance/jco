import { unenvModule } from "./unenv.js";
import { fileURLToPath } from "node:url";
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
import { CONSOLE_WIT_REQUIREMENT } from "../node-wit.js";

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
        ...(options.webGlobals
            ? Object.fromEntries(
                  [
                      "ReadableStream",
                      "WritableStream",
                      "TransformStream",
                      "Blob",
                      "File",
                      "Headers",
                      "Response",
                      "Request",
                      "fetch",
                  ].map((name) => [name, ["jco:web-globals", name] as [string, string]]),
              )
            : {}),
        ...nodeErrorGlobals(options),
        AbortController: [options.abortGlobalsModule ?? ABORT_GLOBALS_SPECIFIER, "AbortController"],
        AbortSignal: [options.abortGlobalsModule ?? ABORT_GLOBALS_SPECIFIER, "AbortSignal"],
        Buffer: [options.bufferModule ?? "node:buffer", "Buffer"],
        process: [options.processModule ?? "jco:node-process-globals", "default"],
        setImmediate: [options.timersModule ?? "node:timers", "setImmediate"],
        clearImmediate: [options.timersModule ?? "node:timers", "clearImmediate"],
        TextEncoder: ["jco:text-encoding", "TextEncoder"],
        TextDecoder: ["jco:text-encoding", "TextDecoder"],
        console: [options.webGlobals ? "jco:console-host-globals" : "jco:console-globals", "default"],
        queueMicrotask: ["jco:microtask-globals", "queueMicrotask"],
        setTimeout: ["jco:timer-globals", "setTimeout"],
        clearTimeout: ["jco:timer-globals", "clearTimeout"],
        setInterval: ["jco:timer-globals", "setInterval"],
        clearInterval: ["jco:timer-globals", "clearInterval"],
        global: ["jco:global-this", "default"],
    };
}

export function createGlobalsBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return composeBuiltins([
        virtualBuiltin(
            "jco:web-globals",
            `${VIRTUAL_PREFIX}web-globals`,
            () => `export * from ${JSON.stringify(stdModule(undefined, "web-globals"))};`,
        ),
        virtualBuiltin("jco:global-this", `${VIRTUAL_PREFIX}global-this`, () => "export default globalThis;"),
        virtualBuiltin(
            "jco:timer-globals",
            `${VIRTUAL_PREFIX}timer-globals`,
            () => `
import timers from "node:timers";
import { captureAll, withCaptured } from ${JSON.stringify(stdModule(undefined, "async-hooks/context"))};
const scoped = timer => function(callback, ...args) {
    const captured = captureAll();
    return timer(function(...values) { return withCaptured(captured, () => Reflect.apply(callback, this, values)); }, ...args);
};
export const setTimeout = scoped(globalThis.setTimeout?.bind(globalThis) ?? timers.setTimeout);
export const clearTimeout = globalThis.clearTimeout?.bind(globalThis) ?? timers.clearTimeout;
export const setInterval = scoped(globalThis.setInterval?.bind(globalThis) ?? timers.setInterval);
export const clearInterval = globalThis.clearInterval?.bind(globalThis) ?? timers.clearInterval;
`,
        ),
        virtualBuiltin(
            "jco:console-globals",
            `${VIRTUAL_PREFIX}console-globals`,
            () => "export default globalThis.console;",
        ),
        {
            resolveId(id) {
                if (id !== "jco:console-host-globals") {
                    return null;
                }
                options.onWitRequirement?.(CONSOLE_WIT_REQUIREMENT);
                return `${VIRTUAL_PREFIX}console-host-globals`;
            },
            load(id) {
                return id === `${VIRTUAL_PREFIX}console-host-globals`
                    ? `import fallback from ${JSON.stringify(stdModule(options.consoleModule, "console"))}; export default globalThis.console ?? fallback;`
                    : null;
            },
        },
        virtualBuiltin(
            "jco:microtask-globals",
            `${VIRTUAL_PREFIX}microtask-globals`,
            () =>
                `export const queueMicrotask = globalThis.queueMicrotask?.bind(globalThis) ?? (callback => Promise.resolve().then(callback));`,
        ),
        virtualBuiltin(
            "jco:text-encoding",
            `${VIRTUAL_PREFIX}text-encoding`,
            () => `export * from ${JSON.stringify(stdModule(undefined, "text-encoding"))};`,
        ),
        {
            resolveId(id, importer) {
                // unenv's portable process initializes its stdio while the module loads.
                // Keep those streams portable too, rather than opening host TTYs during Wizer.
                // Explicit application imports of node:tty still use the capability adapter.
                if (
                    id === "node:tty" &&
                    importer === fileURLToPath(import.meta.resolve("unenv/node/internal/process/process"))
                ) {
                    return unenvModule("node:tty", options);
                }
                return null;
            },
            load: () => null,
        },
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
