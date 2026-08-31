import type { ClusterHost } from "./cluster/host.js";

/**
 * The default adapter intentionally grants no process-control capability.
 *
 * Declaring or generating the WIT import does not grant host access: an application must
 * explicitly provide a host implementation, such as the separately exported Node adapter, when it
 * maps or instantiates a component.
 */
function required(): never {
  const error = new Error("node:cluster requires an application-provided host adapter");
  Object.assign(error, { code: "ERR_JCO_CLUSTER_ADAPTER_REQUIRED" });
  throw error;
}

export const isPrimary: ClusterHost["isPrimary"] = () => required();
export const currentWorker: ClusterHost["currentWorker"] = () => required();
export const fork: ClusterHost["fork"] = () => required();
export const listWorkers: ClusterHost["listWorkers"] = () => required();
export const getWorker: ClusterHost["getWorker"] = () => required();
export const send: ClusterHost["send"] = () => required();
export const disconnectWorker: ClusterHost["disconnectWorker"] = () => required();
export const disconnectAll: ClusterHost["disconnectAll"] = () => required();
export const kill: ClusterHost["kill"] = () => required();
export const getSettings: ClusterHost["getSettings"] = () => required();
export const setSettings: ClusterHost["setSettings"] = () => required();
export const drainEvents: ClusterHost["drainEvents"] = () => required();

export default {
  isPrimary,
  currentWorker,
  fork,
  listWorkers,
  getWorker,
  send,
  disconnectWorker,
  disconnectAll,
  kill,
  getSettings,
  setSettings,
  drainEvents,
};
