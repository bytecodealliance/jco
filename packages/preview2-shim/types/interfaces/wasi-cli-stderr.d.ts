export namespace WasiCliStderr {
  export function getStderr(): OutputStream;
}
import type { OutputStream } from '../interfaces/wasi-io-streams';
export { OutputStream };
