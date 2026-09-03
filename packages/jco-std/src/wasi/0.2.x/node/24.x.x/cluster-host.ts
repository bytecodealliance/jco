import type { ClusterHost } from "./cluster/types.js";
import { adapterRequiredMessage, denyThrow } from "./internal/deny-host.js";

/**
 * The default adapter intentionally grants no process-control capability.
 *
 * Declaring or generating the WIT import does not grant host access: an application must
 * explicitly provide a host implementation, such as the separately exported Node adapter, when it
 * maps or instantiates a component.
 */
const required = denyThrow(
  "ERR_JCO_CLUSTER_ADAPTER_REQUIRED",
  adapterRequiredMessage("node:cluster"),
);

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
