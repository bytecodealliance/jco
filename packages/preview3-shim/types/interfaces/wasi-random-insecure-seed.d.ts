/** @module Interface wasi:random/insecure-seed@0.3.0 **/
/**
 * Return a 128-bit value that may contain a pseudo-random value.
 * 
 * The returned value is not required to be computed from a CSPRNG, and may
 * even be entirely deterministic. Host implementations are encouraged to
 * provide pseudo-random values to any program exposed to
 * attacker-controlled content, to enable DoS protection built into many
 * languages' hash-map implementations.
 * 
 * This function is intended to only be called once, by a source language
 * to initialize Denial Of Service (DoS) protection in its hash-map
 * implementation.
 * 
 * # Expected future evolution
 * 
 * This will likely be changed to a value import, to prevent it from being
 * called multiple times and potentially used for purposes other than DoS
 * protection.
 */
export function insecureSeed(): [bigint, bigint];
