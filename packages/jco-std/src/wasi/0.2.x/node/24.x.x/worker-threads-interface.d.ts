declare module "jco:node/worker-threads@0.1.0" {
  export const Worker: import("./worker-threads/types.js").WorkerHost["Worker"];
  export const createWorker: import("./worker-threads/types.js").WorkerHost["createWorker"];
}
