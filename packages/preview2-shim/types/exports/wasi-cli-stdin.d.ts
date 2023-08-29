export namespace WasiCliStdin {
  export function getStdin(): InputStream;
}
import type { InputStream } from '../exports/wasi-io-streams';
export { InputStream };
