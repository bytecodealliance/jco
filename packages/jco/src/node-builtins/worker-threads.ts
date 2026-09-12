import {
    type BuiltinContext,
    type BuiltinAdapter,
    builtin,
    composeBuiltins,
    stdModule,
    virtualBuiltin,
    VIRTUAL_PREFIX,
} from "./shared.js";
import { WORKER_THREADS_WIT_REQUIREMENT } from "../node-wit.js";

export function createWorkerThreadsBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    const module = () => JSON.stringify(stdModule(options.workerThreadsModule, "worker-threads"));
    return composeBuiltins([
        builtin(
            "node:worker_threads",
            () => `
export { default, isInternalThread, isMainThread, MessagePort, MessageChannel,
    markAsUncloneable, markAsUntransferable, isMarkedAsUntransferable,
    moveMessagePortToContext, receiveMessageOnPort, resourceLimits,
    postMessageToThread, threadId, threadName, SHARE_ENV, Worker, parentPort,
    workerData, BroadcastChannel, setEnvironmentData, getEnvironmentData, locks } from ${module()};
`,
            () => options.onWitRequirement?.(WORKER_THREADS_WIT_REQUIREMENT),
        ),
        virtualBuiltin(
            "jco:node-worker-threads-callbacks",
            `${VIRTUAL_PREFIX}worker-threads-callbacks`,
            () => `export { workerThreadsCallbacks } from ${module()};`,
        ),
    ]);
}
