import type { ConsoleHost } from "./console/types.js";
import { adapterRequiredMessage, denyThrow } from "./internal/deny-host.js";

/**
 * The default adapter intentionally grants no console capability. Applications
 * must explicitly select a host implementation, such as the Node adapter.
 */
const denied = denyThrow(
  "ERR_JCO_CONSOLE_ADAPTER_REQUIRED",
  adapterRequiredMessage("node:console"),
);

export const write: ConsoleHost["write"] = denied;
export const isTerminal: ConsoleHost["isTerminal"] = denied;
export const colorDepth: ConsoleHost["colorDepth"] = denied;

export default { colorDepth, isTerminal, write };
