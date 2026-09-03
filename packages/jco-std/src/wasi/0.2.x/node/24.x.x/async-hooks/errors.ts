import { UNSUPPORTED_CODE, unsupportedNodeApi } from "../errors/core.js";

export { UNSUPPORTED_CODE };

/**
 * Thrown for `node:async_hooks` behavior that cannot work in a component.
 *
 * @param api - the public API being used, as a user would write it
 * @param reason - why it cannot work here
 */
export function unsupported(
  api: string,
  reason: string,
): Error & { code: typeof UNSUPPORTED_CODE } {
  return unsupportedNodeApi(api, reason);
}

/**
 * Why asynchronous context propagation is refused, quoted into the errors users see.
 *
 * Kept in one place because it is the single reason this module is limited, and every affected API
 * should say the same thing.
 */
export const ASYNC_REASON =
  "the store cannot survive an await. `await` resolves through the engine's internal " +
  "PerformPromiseThen, which JavaScript cannot intercept, and this engine exposes no AsyncContext " +
  "to carry the value instead. Rather than return an empty store later, Jco refuses here";
