/** Error code carried by every unsupported-API failure Jco raises for Node builtins. */
export const UNSUPPORTED_CODE = "ERR_JCO_UNSUPPORTED_NODE_API";

/**
 * Thrown for `node:async_hooks` behavior that cannot work in a component.
 *
 * @param api - the public API being used, as a user would write it
 * @param reason - why it cannot work here
 */
export function unsupported(api: string, reason: string): Error & { code: string } {
  const error = new Error(
    `${api} is not supported in a WebAssembly component: ${reason}`,
  ) as Error & {
    code: string;
  };
  error.code = UNSUPPORTED_CODE;
  return error;
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
