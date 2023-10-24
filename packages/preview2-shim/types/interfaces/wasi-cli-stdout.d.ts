export namespace WasiCliStdout {
  export function getStdout(): OutputStream;
}
import type { OutputStream } from '../interfaces/wasi-io-streams.js';
export { OutputStream };
