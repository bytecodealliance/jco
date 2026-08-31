/**
 * `node:async_hooks`, limited to synchronous scopes.
 *
 * `AsyncLocalStorage` works within a synchronous scope: `run`, `getStore`, `exit`, `enterWith`,
 * nesting, `snapshot` and `bind` all behave as Node does. What it cannot do is carry a store across
 * an asynchronous boundary, and that limitation is not a shortcut -- it is currently unreachable:
 *
 * - `await` resolves through the engine's internal `PerformPromiseThen`. Patching
 *   `Promise.prototype.then` does not intercept it; measured in a componentized fixture, an
 *   `await` never calls the patched method at all.
 * - StarlingMonkey exposes no TC39 `AsyncContext`, so there is no supported hook to carry the
 *   value instead.
 *
 * TODO(async): this needs `AsyncContext` at the engine level; generated glue cannot substitute for
 * it. Bindgen only wraps the boundaries it emits, so it could carry context across a host call but
 * not across a plain `await` in user code -- and a store has to survive every await in a chain, so
 * one unwrapped await is enough to break it. (As of componentize-js 0.22.0 the question is moot
 * anyway: its splicer panics with `not yet implemented` on an async export.) Until an engine-level
 * hook exists, any callback returning a thenable is refused with `ERR_JCO_UNSUPPORTED_NODE_API`
 * rather than silently producing an empty store later.
 *
 * `createHook`, `executionAsyncId`, `triggerAsyncId` and `executionAsyncResource` describe the async
 * resource graph and always throw: nothing tracks it here.
 */

export {
  AsyncLocalStorage,
  AsyncResource,
  ASYNC_REASON,
  UNSUPPORTED_CODE,
  asyncWrapProviders,
  createHook,
  executionAsyncId,
  executionAsyncResource,
  triggerAsyncId,
} from "./async-hooks/index.js";

import * as asyncHooks from "./async-hooks/index.js";

export default asyncHooks;
