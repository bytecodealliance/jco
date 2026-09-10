import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";

const ASYNC_HOOKS_SPECIFIER = "node:async_hooks";

/**
 * Source of the `node:async_hooks` adapter.
 *
 * Capability-free: synchronous context tracking with no host involvement, so it resolves for a
 * world with no imports at all.
 */
function asyncHooksAdapter(asyncHooksModule: string): string {
    return `
import asyncHooks from ${JSON.stringify(asyncHooksModule)};
export default asyncHooks;
export {
    AsyncLocalStorage,
    AsyncResource,
    asyncWrapProviders,
    createHook,
    executionAsyncId,
    executionAsyncResource,
    triggerAsyncId,
} from ${JSON.stringify(asyncHooksModule)};
`;
}

export function createAsyncHooksBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(ASYNC_HOOKS_SPECIFIER, () => asyncHooksAdapter(stdModule(options.asyncHooksModule, "async-hooks")));
}
