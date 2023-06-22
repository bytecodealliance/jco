export namespace ImportsPreopens {
  /**
   * Return the set of of preopened directories, and their path.
   */
  export function getDirectories(): [Descriptor, string][];
}
import type { Descriptor } from '../imports/filesystem';
export { Descriptor };
import type { InputStream } from '../imports/streams';
export { InputStream };
import type { OutputStream } from '../imports/streams';
export { OutputStream };
