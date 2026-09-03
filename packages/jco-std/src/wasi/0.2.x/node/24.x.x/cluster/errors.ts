/**
 * Errors for parts of `node:cluster` that cannot be represented in a component.
 *
 * Each one names what was attempted and why it cannot work, rather than failing as a missing
 * property would. Nothing here is a silent omission: every case has a test.
 *
 * The coded-error factory, codes, and message templates are the shared ones in
 * `../errors/core.js`, so cluster errors carry the same identity, stack header, and `toString`
 * as every other jco-std builtin.
 */

import { deprecatedNodeApi, unsupportedNodeApi } from "../errors/core.js";

export { DEPRECATED_CODE, UNSUPPORTED_CODE } from "../errors/core.js";

/**
 * Thrown for cluster behavior that has no component equivalent.
 *
 * @param api - the public API being used, as a user would write it
 * @param reason - why it cannot work here
 */
export function unsupported(api: string, reason: string): Error & { code: string } {
  return unsupportedNodeApi(api, reason);
}

/**
 * Thrown for APIs Node has deprecated.
 *
 * Callers must throw this before touching arguments, providers, or state.
 *
 * @param api - the deprecated API
 * @param replacement - the API Node's documentation directs users to instead
 */
export function deprecated(api: string, replacement: string): Error & { code: string } {
  return deprecatedNodeApi(api, replacement);
}
