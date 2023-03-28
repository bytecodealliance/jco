export namespace Preopens {
  export function getStdio(): StdioPreopens;
  export function getDirectories(): [Descriptor, string][];
}
import type { InputStream } from '../imports/streams';
export { InputStream };
import type { OutputStream } from '../imports/streams';
export { OutputStream };
export interface StdioPreopens {
  stdin: InputStream,
  stdout: OutputStream,
  stderr: OutputStream,
}
import type { Descriptor } from '../imports/filesystem';
export { Descriptor };
