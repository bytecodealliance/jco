export namespace WasiCliBaseStdout {
  export function getStdout(): OutputStream;
}
import type { OutputStream } from '../imports/wasi-io-streams';
export { OutputStream };
