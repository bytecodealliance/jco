import { adapterRequiredMessage, denyThrow } from "./internal/deny-host.js";
import { serializeHostError } from "./internal/host-error.js";
import type { WorkerHost, HostWorker } from "./worker-threads/types.js";

const required = denyThrow(
  "ERR_JCO_WORKER_THREADS_ADAPTER_REQUIRED",
  adapterRequiredMessage("node:worker_threads"),
);
export const createWorker: WorkerHost["createWorker"] = () => {
  try {
    return required();
  } catch (error) {
    return { tag: "err", val: serializeHostError(error) };
  }
};
/** Present the imported resource shape even though no resource can be created. */
export class Worker implements HostWorker {
  constructor() {
    required();
  }

  postMessage(_value: string): never {
    return required();
  }

  terminate(): never {
    return required();
  }

  setRef(_value: boolean): never {
    return required();
  }

  info(): never {
    return required();
  }

  [Symbol.dispose](): never {
    return required();
  }
}
export default { Worker, createWorker };
