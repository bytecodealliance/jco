export namespace WasiFilesystemPreopens {
  /**
   * Return the set of preopened directories, and their path.
   */
  export function getDirectories(): [Descriptor, string][];
}
import type { Descriptor } from '../imports/wasi-filesystem-types';
export { Descriptor };
