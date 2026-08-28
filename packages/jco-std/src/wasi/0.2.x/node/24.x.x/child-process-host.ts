import type { ChildProcessHost } from "./child-process/types.js";

/**
 * The default adapter intentionally grants no process-spawning capability.
 * Applications must explicitly provide a host implementation, such as the
 * separately exported Node adapter, when they instantiate or map a component.
 */
export const spawnSync: ChildProcessHost["spawnSync"] = () => {
  const error = new Error("node:child_process requires an application-provided host adapter");
  Object.assign(error, { code: "ERR_JCO_CHILD_PROCESS_ADAPTER_REQUIRED" });
  throw error;
};

export default { spawnSync };
