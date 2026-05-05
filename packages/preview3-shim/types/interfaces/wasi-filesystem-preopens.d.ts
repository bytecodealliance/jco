/** @module Interface wasi:filesystem/preopens@0.3.0-rc-2026-03-15 **/
/**
 * Return the set of preopened directories, and their paths.
 */
export function getDirectories(): Array<[Descriptor, string]>;
export type Descriptor = import('./wasi-filesystem-types.js').Descriptor;
