export namespace WasiCliBasePreopens {
  /**
   * Return the set of of preopened directories, and their path.
   */
  export function getDirectories(): [Descriptor, string][];
}
import type { Descriptor } from '../imports/wasi-filesystem-filesystem';
export { Descriptor };
import type { InputStream } from '../imports/wasi-io-streams';
export { InputStream };
import type { OutputStream } from '../imports/wasi-io-streams';
export { OutputStream };
