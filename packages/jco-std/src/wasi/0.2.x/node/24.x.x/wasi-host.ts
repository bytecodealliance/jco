import { adapterRequiredMessage } from "./internal/deny-host.js";
import type { WasiError, WasiProvider } from "./wasi/types.js";

/**
 * JS bindings lower thrown records into the `err` case of WIT `result<T, error>`.
 * The guest reconstructs the same structured error used by the explicit Node host.
 */
const denied = (): never => {
  throw {
    name: "Error",
    message: adapterRequiredMessage("node:wasi"),
    code: "ERR_JCO_WASI_ADAPTER_REQUIRED",
  } satisfies WasiError;
};

/**
 * The default adapter intentionally initialises nothing: `new WASI()` is refused until the
 * application maps a provider. Note that a provider only makes construction behave as Node's;
 * see `wasi/core.ts` for why no provider can run a module.
 */
export const init: WasiProvider["init"] = denied;

const host: WasiProvider = { init };

export default host;
