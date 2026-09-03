import type { ChildProcessHost } from "./child-process/types.js";
import { adapterRequiredMessage, denyThrow } from "./internal/deny-host.js";

/**
 * The default adapter intentionally grants no process-spawning capability.
 * Applications must explicitly provide a host implementation, such as the
 * separately exported Node adapter, when they instantiate or map a component.
 */
export const spawnSync: ChildProcessHost["spawnSync"] = denyThrow(
  "ERR_JCO_CHILD_PROCESS_ADAPTER_REQUIRED",
  adapterRequiredMessage("node:child_process"),
);

export default { spawnSync };
