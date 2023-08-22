export namespace WasiCliBaseStderr {
  export function getStderr(): OutputStream;
}
import type { OutputStream } from '../exports/wasi-io-streams';
export { OutputStream };
