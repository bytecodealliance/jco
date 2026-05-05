/** @module Interface wasi:random/insecure@0.3.0-rc-2026-03-15 **/
/**
 * Return up to `max-len` insecure pseudo-random bytes.
 *
 * This function is not cryptographically secure. Do not use it for
 * anything related to security.
 *
 * There are no requirements on the values of the returned bytes, however
 * implementations are encouraged to return evenly distributed values with
 * a long period.
 *
 * Implementations MAY return fewer bytes than requested (a short read).
 * Callers that require exactly `max-len` bytes MUST call this function in
 * a loop until the desired number of bytes has been accumulated.
 * Implementations MUST return at least 1 byte when `max-len` is greater
 * than zero. When `max-len` is zero, implementations MUST return an empty
 * list without trapping.
 */
export function getInsecureRandomBytes(maxLen: bigint): Uint8Array;
/**
 * Return an insecure pseudo-random `u64` value.
 *
 * This function returns the same type of pseudo-random data as
 * `get-insecure-random-bytes`, represented as a `u64`.
 */
export function getInsecureRandomU64(): bigint;
