import { adapterRequiredMessage } from "./internal/deny-host.js";
import type { DgramHost } from "./dgram/types.js";
/** Typed denial is catchable inside the guest; a throwing WIT constructor would trap. */
export const createSocket: DgramHost["createSocket"] = () => ({
  tag: "err",
  val: {
    name: "Error",
    code: "ERR_JCO_DGRAM_ADAPTER_REQUIRED",
    message: adapterRequiredMessage("node:dgram"),
  },
});
// Bindings require the resource prototype even though denial never creates one.
export const Socket: DgramHost["Socket"] = class Socket {
  constructor() {
    throw new Error(adapterRequiredMessage("node:dgram"));
  }
} as unknown as DgramHost["Socket"];
export default { createSocket, Socket };
