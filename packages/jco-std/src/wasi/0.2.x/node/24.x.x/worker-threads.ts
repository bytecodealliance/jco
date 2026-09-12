import * as host from "jco:node/worker-threads@0.1.0";
import { createWorkerThreads } from "./worker-threads/core.js";

const { workerThreads, workerThreadsCallbacks } = createWorkerThreads(host);
export const {
  isInternalThread,
  isMainThread,
  MessagePort,
  MessageChannel,
  markAsUncloneable,
  markAsUntransferable,
  isMarkedAsUntransferable,
  moveMessagePortToContext,
  receiveMessageOnPort,
  resourceLimits,
  postMessageToThread,
  threadId,
  threadName,
  SHARE_ENV,
  Worker,
  parentPort,
  workerData,
  BroadcastChannel,
  setEnvironmentData,
  getEnvironmentData,
  locks,
} = workerThreads;
export type Worker = InstanceType<typeof Worker>;
export type MessagePort = InstanceType<typeof MessagePort>;
export type MessageChannel = InstanceType<typeof MessageChannel>;
export type BroadcastChannel = InstanceType<typeof BroadcastChannel>;
export { workerThreadsCallbacks };
export type { WorkerOptions, ResourceLimits } from "./worker-threads/types.js";
export type {
  Lock,
  LockOptions,
  LockInfo,
  LockManagerSnapshot,
} from "./worker-threads/unsupported.js";
export default workerThreads;
