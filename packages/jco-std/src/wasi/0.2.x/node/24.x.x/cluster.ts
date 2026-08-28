import * as host from "jco:node/cluster@0.1.0";

import { createCluster } from "./cluster/core.js";

/**
 * `node:cluster`, backed by the host's own cluster over `jco:node/cluster@0.1.0`.
 *
 * WASI has no process model, so unlike Jco's portable builtins this forwards to the host. A
 * transpiled component is itself a Node process, so a fork re-executes the entry and the worker
 * runs this component again.
 */
const cluster = createCluster(host);

export const SCHED_NONE = cluster.SCHED_NONE;
export const SCHED_RR = cluster.SCHED_RR;
export const Worker = cluster.Worker;
export const fork = (env?: Record<string, string>) => cluster.fork(env);
export const disconnect = (callback?: () => void) => cluster.disconnect(callback);
export const setupPrimary = (settings?: Parameters<typeof cluster.setupPrimary>[0]) =>
    cluster.setupPrimary(settings);
export const setupMaster = () => cluster.setupMaster();
export default cluster;

export { UNSUPPORTED_CODE, DEPRECATED_CODE } from "./cluster/errors.js";
export type { Cluster, ClusterSettings } from "./cluster/core.js";
