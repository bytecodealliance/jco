export namespace WasiCliStderr {
  export function getStderr(): OutputStream;
}
import type { OutputStream } from '../imports/wasi-io-streams';
export { OutputStream };
