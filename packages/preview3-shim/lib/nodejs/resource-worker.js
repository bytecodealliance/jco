import { Worker } from "worker_threads";
import { randomUUID } from "crypto";

export class ResourceWorker {
  #worker = null;
  #workerUrl = null;
  #pending = new Map();

  constructor(workerUrl) {
    this.#workerUrl = workerUrl;
  }

  #getWorker() {
    // TODO(tandr): Use a pool of workers instead of a single one.
    if (this.#worker) {
      return this.#worker;
    }

    this.#worker = new Worker(this.#workerUrl);
    this.#worker.unref();

    this.#worker.on("message", (res) => {
      const { id, result, error } = res;
      const entry = this.#pending.get(id);
      if (!entry) return;

      const { resolve, reject } = entry;
      this.#pending.delete(id);

      if (error) {
        reject(error);
      } else {
        resolve(result);
      }

      if (this.#pending.size === 0) {
        this.#terminate();
      }
    });

    this.#worker.on("error", (err) => {
      for (const { reject } of this.#pending.values()) {
        reject(err);
      }
      this.#terminate();
    });

    return this.#worker;
  }

  #terminate() {
    if (!this.#worker) return;

    this.#pending.clear();
    this.#worker.removeAllListeners();
    this.#worker.terminate();
    this.#worker = null;
  }

  runOp(msg, transferable = []) {
    const worker = this.#getWorker();

    return new Promise((resolve, reject) => {
      const id = randomUUID();
      this.#pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id }, transferable);
    });
  }

  terminate() {
    this.#terminate();
  }
}
