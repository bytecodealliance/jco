/**
 * Errors for parts of `node:crypto` a component cannot provide.
 *
 * Cryptography in a component comes from two places: WebCrypto, which the engine implements
 * natively and asynchronously, and the small set of synchronous digests jco-std implements
 * because Node-shaped middleware calls them inline. Everything else says so.
 */

/** Error code carried by every unsupported-API failure Jco raises for Node builtins. */
export const UNSUPPORTED_CODE = "ERR_JCO_UNSUPPORTED_NODE_API";

/** An `Error` carrying a Node-style `code` property. */
export type CodedError = Error & { code: string };

function coded(code: string, message: string): CodedError {
  const error = new Error(message) as CodedError;
  error.code = code;
  return error;
}

/**
 * Thrown for `node:crypto` behavior that has no component equivalent.
 *
 * @param api - the public API being used, as a user would write it
 * @param reason - why it cannot work here
 */
export function unsupported(api: string, reason: string): CodedError {
  return coded(UNSUPPORTED_CODE, `${api} is not supported in a WebAssembly component: ${reason}`);
}

/** Thrown when the synchronous API is reached for an algorithm jco-std does not implement. */
export function unsupportedAlgorithm(algorithm: string): CodedError {
  return coded(
    UNSUPPORTED_CODE,
    `digest algorithm [${algorithm}] is not implemented synchronously; jco-std implements sha1 and sha256, and the engine implements the rest asynchronously through \`crypto.subtle.digest()\``,
  );
}

/** Thrown for the key, cipher and certificate APIs, which belong to WebCrypto here. */
export function useWebCrypto(api: string): CodedError {
  return unsupported(api, "use `crypto.subtle`, which the component engine implements natively");
}
