export namespace WasiCliStderr {
  export function getStderr(): OutputStream;
}
import type { OutputStream } from '../exports/wasi-io-streams';
export { OutputStream };
