export namespace WasiFilesystemPreopens {
  /**
   * Return the set of preopened directories, and their paths.
   */
  export function getDirectories(): Array<[Descriptor, string]>;
}
import type { Descriptor } from './wasi-filesystem-types.js';
export { Descriptor };
