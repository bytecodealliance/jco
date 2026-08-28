/**
 * Errors for parts of `node:cluster` that cannot be represented in a component.
 *
 * Each one names what was attempted and why it cannot work, rather than failing as a missing
 * property would. Nothing here is a silent omission: every case has a test.
 */

/** Error code carried by every unsupported-API failure Jco raises for Node builtins. */
export const UNSUPPORTED_CODE = "ERR_JCO_UNSUPPORTED_NODE_API";

/** Error code for APIs Node itself has deprecated, which Jco declines to implement. */
export const DEPRECATED_CODE = "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API";

interface CodedErrorInit {
  code: string;
  message: string;
}

function codedError({ code, message }: CodedErrorInit): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

/**
 * Thrown for cluster behavior that has no component equivalent.
 *
 * @param api - the public API being used, as a user would write it
 * @param reason - why it cannot work here
 */
export function unsupported(api: string, reason: string): Error & { code: string } {
  return codedError({
    code: UNSUPPORTED_CODE,
    message: `${api} is not supported in a WebAssembly component: ${reason}`,
  });
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
  return codedError({
    code: DEPRECATED_CODE,
    message: `${api} is deprecated in Node.js and not implemented by Jco; use ${replacement} instead`,
  });
}
