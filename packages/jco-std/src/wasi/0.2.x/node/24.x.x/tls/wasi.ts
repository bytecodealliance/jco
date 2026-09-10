/** Adapt a WASI TLS provider to the primary jco:node/tls stream capability. */
import denied from "./node-host.js";
import { dispose } from "../internal/wasi-sockets.js";
import type { TlsHost } from "./host-types.js";
import type { WasiTlsHandshake, WasiTlsProvider } from "../http/impl/wasi-sockets/tls.js";

/**
 * WASI TLS currently supplies client upgrades only. Other Node TLS operations
 * retain the explicit denial from the base provider. Pass the result directly
 * as the component's jco:node/tls import.
 */
export function createWasiTlsBridge(provider: WasiTlsProvider): TlsHost {
  return {
    ...denied,
    isAvailable: () => provider.isAvailable(),
    startTls(serverName, input, output) {
      let pending: WasiTlsHandshake | undefined;
      try {
        pending = new provider.ClientHandshake(serverName, input, output);
      } catch (error) {
        dispose(output);
        dispose(input);
        throw error;
      }
      try {
        const future = provider.ClientHandshake.finish(pending);
        pending = undefined;
        return future;
      } finally {
        dispose(pending);
      }
    },
  };
}
