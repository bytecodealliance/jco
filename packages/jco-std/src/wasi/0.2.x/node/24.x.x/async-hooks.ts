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
 * TODO(async): revisit once componentize-js gains async support -- and note this likely also needs
 * bindgen support in Jco, so a guest's async continuations are threaded through something the
 * runtime can track. Until then, any callback returning a thenable is refused with
 * `ERR_JCO_UNSUPPORTED_NODE_API` rather than silently producing an empty store later.
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
