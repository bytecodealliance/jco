export namespace WasiSocketsInstanceNetwork {
  /**
   * Get a handle to the default network.
   */
  export function instanceNetwork(): Network;
}
import type { Network } from '../interfaces/wasi-sockets-network.js';
export { Network };
