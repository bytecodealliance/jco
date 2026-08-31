import { unsupported } from "./errors.js";

export { AsyncLocalStorage } from "./async-local-storage.js";
export { AsyncResource } from "./async-resource.js";
export { ASYNC_REASON, UNSUPPORTED_CODE } from "./errors.js";

/**
 * The async id graph does not exist in a component.
 *
 * These APIs describe resources the engine would have to track for us. Nothing does, and reporting
 * a constant would quietly misdescribe the program, so each says so instead.
 */
const NO_GRAPH =
  "it reports the async resource graph, which requires runtime hooks this engine does not expose";

export function createHook(): never {
  throw unsupported("async_hooks.createHook(callbacks)", NO_GRAPH);
}

export function executionAsyncId(): never {
  throw unsupported("async_hooks.executionAsyncId()", NO_GRAPH);
}

export function triggerAsyncId(): never {
  throw unsupported("async_hooks.triggerAsyncId()", NO_GRAPH);
}

export function executionAsyncResource(): never {
  throw unsupported("async_hooks.executionAsyncResource()", NO_GRAPH);
}

/** Node's internal provider table; empty here, since no providers are tracked. */
export const asyncWrapProviders: Readonly<Record<string, number>> = Object.freeze({});
