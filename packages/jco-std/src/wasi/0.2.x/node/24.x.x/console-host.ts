import type { ConsoleHost } from "./console/types.js";

/**
 * The default adapter intentionally grants no console capability. Applications
 * must explicitly select a host implementation, such as the Node adapter.
 */
function denied(): never {
  const error = new Error("node:console requires an application-provided host adapter");
  Object.assign(error, { code: "ERR_JCO_CONSOLE_ADAPTER_REQUIRED" });
  throw error;
}

export const write: ConsoleHost["write"] = denied;
export const isTerminal: ConsoleHost["isTerminal"] = denied;
export const colorDepth: ConsoleHost["colorDepth"] = denied;

export default { colorDepth, isTerminal, write };
