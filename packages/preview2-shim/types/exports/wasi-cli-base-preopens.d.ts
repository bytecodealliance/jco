export namespace WasiCliBasePreopens {
  /**
   * Return the set of of preopened directories, and their path.
   */
  export function getDirectories(): [Descriptor, string][];
}
import type { Descriptor } from '../exports/wasi-filesystem-filesystem';
export { Descriptor };
import type { InputStream } from '../exports/wasi-io-streams';
export { InputStream };
import type { OutputStream } from '../exports/wasi-io-streams';
export { OutputStream };
