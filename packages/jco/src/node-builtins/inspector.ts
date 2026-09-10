import {
    VIRTUAL_PREFIX,
    type BuiltinContext,
    type BuiltinAdapter,
    composeBuiltins,
    virtualBuiltin,
    stdModule,
    builtin,
} from "./shared.js";
import { INSPECTOR_PROMISES_WIT_REQUIREMENT, INSPECTOR_WIT_REQUIREMENT } from "../node-wit.js";

const INSPECTOR_SPECIFIER = "node:inspector";

const INSPECTOR_PROMISES_SPECIFIER = "node:inspector/promises";

const INSPECTOR_SPECIFIERS = new Set([INSPECTOR_SPECIFIER, INSPECTOR_PROMISES_SPECIFIER]);

/**
 * Virtual specifier the two-pass bundler imports to reach the guest-exported callbacks interface.
 *
 * `node:inspector` is host-backed, but the host also has to call *back* into the component. A
 * component cannot implement a resource on an imported interface, so the callbacks live in a
 * guest-exported interface, and this virtual module re-exports its implementation from the shared
 * jco-std inspector module so the wrapper can add it to the component's top-level exports.
 */
export const INSPECTOR_CALLBACKS_SPECIFIER = "jco:node-inspector-callbacks";

const INSPECTOR_CALLBACKS_MODULE = `${VIRTUAL_PREFIX}inspector-callbacks`;

/**
 * Source of the `node:inspector` adapter.
 *
 * Host-backed like `node:ffi`, but with a second half: the host also calls *back* into the
 * component when a protocol response or notification arrives. That channel is the guest-exported
 * `inspectorCallbacks` interface, added to the component's exports by Jco's two-pass bundling; this
 * adapter only re-exports the module surface.
 */
function inspectorAdapter(inspectorModule: string): string {
    return `
import inspector from ${JSON.stringify(inspectorModule)};
export default inspector;
export {
    close,
    console,
    DOMStorage,
    Network,
    NetworkResources,
    open,
    Session,
    url,
    waitForDebugger,
} from ${JSON.stringify(inspectorModule)};
`;
}

/**
 * Source of the `node:inspector/promises` adapter, sharing one core with `node:inspector`.
 *
 * The promises entry point re-exports the same public surface as `node:inspector`, so the adapter
 * source is identical apart from the module it points at.
 */
function inspectorPromisesAdapter(inspectorPromisesModule: string): string {
    return inspectorAdapter(inspectorPromisesModule);
}

/**
 * Source of the virtual module the two-pass bundler exports to satisfy the guest-exported
 * `jco:node/inspector-callbacks@0.1.0` interface.
 *
 * Always pulls from the base `node:inspector` module (not `/promises`), which owns the one callback
 * registry both entries register into.
 */
function inspectorCallbacksAdapter(inspectorModule: string): string {
    return `export { inspectorCallbacks } from ${JSON.stringify(inspectorModule)};`;
}

export function createInspectorBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return composeBuiltins([
        virtualBuiltin(INSPECTOR_CALLBACKS_SPECIFIER, INSPECTOR_CALLBACKS_MODULE, () =>
            inspectorCallbacksAdapter(stdModule(options.inspectorModule, "inspector")),
        ),
        builtin(
            INSPECTOR_SPECIFIERS,
            (specifier) =>
                specifier === INSPECTOR_PROMISES_SPECIFIER
                    ? inspectorPromisesAdapter(stdModule(options.inspectorPromisesModule, "inspector/promises"))
                    : inspectorAdapter(stdModule(options.inspectorModule, "inspector")),
            (specifier) =>
                options.onWitRequirement?.(
                    specifier === INSPECTOR_PROMISES_SPECIFIER
                        ? INSPECTOR_PROMISES_WIT_REQUIREMENT
                        : INSPECTOR_WIT_REQUIREMENT,
                ),
        ),
    ]);
}
