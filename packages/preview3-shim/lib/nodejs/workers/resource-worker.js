import {
  Worker,
  parentPort,
  isMainThread,
  MessageChannel,
  receiveMessageOnPort,
} from "worker_threads";

export class ResourceWorker {
  #worker = null;
  #workerUrl = null;
  #pending = new Map();

  constructor(workerUrl) {
    this.#workerUrl = workerUrl;
  }

  #getWorker() {
    if (this.#worker) {
      return this.#worker;
    }

    this.#worker = new Worker(this.#workerUrl);
    this.#worker.unref();
    return this.#worker;
  }

  terminate() {
    if (!this.#worker) {
      return;
    }

    this.#pending.clear();
    this.#worker.removeAllListeners();
    this.#worker.terminate();
    this.#worker = null;
  }

  /** Async IPC */
  run(msg, transferable = []) {
    const worker = this.#getWorker();
    const { port1, port2 } = new MessageChannel();

    return new Promise((resolve, reject) => {
      port1.once("message", ({ result, error }) => {
        port1.close();

        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });

      worker.postMessage({ ...msg, _reply: port2 }, [port2, ...transferable]);
    });
  }

  /** Synchronous IPC */
  runSync(msg, transferable = []) {
    const worker = this.#getWorker();

    const { port1: rx, port2: tx } = new MessageChannel();
    const _condvar = new SharedArrayBuffer(4);
    const lock = new Int32Array(_condvar);

    worker.postMessage({ ...msg, _condvar, _reply: tx }, [tx, ...transferable]);

    Atomics.wait(lock, 0, 0);

    const { message } = receiveMessageOnPort(rx) || {};
    rx.close();

    if (!message) {
      throw new Error("No response from worker");
    }
    const { result, error } = message;

    if (error) {
      throw error;
    }
    return result;
  }
}

export function Router() {
  const _hooks = {
    beforeAll: null,
    ops: new Map(),
  };

  if (isMainThread || !parentPort) {
    throw new Error("Router can only be used in worker threads");
  }

  parentPort.on("message", async (msg) => {
    const { _reply, _condvar, ...rest } = msg;
    let result,
      error,
      transfer = [];

    try {
      if (_hooks.beforeAll) {
        _hooks.beforeAll(rest);
      }

      const handler = _hooks.ops.get(rest.op);
      if (!handler) {
        throw new Error(`Unknown op ${rest.op}`);
      }

      const outcome = await handler(rest);

      if (outcome && Array.isArray(outcome.transferable)) {
        result = outcome.result;
        transfer = outcome.transferable;
      } else {
        result = outcome;
      }
    } catch (err) {
      error = err;
    }

    _reply.postMessage({ result, error }, transfer);
    _reply.close();

    // If this is a synchronous operation, notify the main thread.
    // This will wake up the waiting thread and read the message we
    // posted on reply channel.
    if (_condvar) {
      notify(_condvar);
    }
  });

  return {
    beforeAll(fn) {
      _hooks.beforeAll = fn;
      return this;
    },
    op(name, fn) {
      _hooks.ops.set(name, fn);
      return this;
    },
  };
}

function notify(condvar) {
  const lock = new Int32Array(condvar);
  Atomics.store(lock, 0, 1);
  Atomics.notify(lock, 0, 1);
}
