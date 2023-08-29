export namespace WasiCliStdout {
  export function getStdout(): OutputStream;
}
import type { OutputStream } from '../exports/wasi-io-streams';
export { OutputStream };
