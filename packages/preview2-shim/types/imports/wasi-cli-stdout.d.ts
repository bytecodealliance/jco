export namespace WasiCliStdout {
  export function getStdout(): OutputStream;
}
import type { OutputStream } from '../imports/wasi-io-streams';
export { OutputStream };
