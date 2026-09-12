import { EventEmitter } from "node:events";
import { invalidArgType } from "../errors/core.js";
import { callHost } from "../internal/host-error.js";
import { createEnvironmentData } from "./environment.js";
import { createMessageCodec, decodeMessage } from "./codec.js";
import { fromHost } from "./errors.js";
import * as unavailable from "./unsupported.js";
import type {
  HostWorker,
  ResourceLimits,
  WorkerEvent,
  WorkerHost,
  WorkerListener,
  WorkerOptions,
} from "./types.js";

/** Node 24.20's module contract, with native worker handles replaced by WIT resources. */
export function createWorkerThreads(
  host: WorkerHost,
): import("./types.js").WorkerThreadsImplementation {
  const environment = createEnvironmentData();
  const codec = createMessageCodec();
  const listeners = new Map<number, Listener>();
  let nextListener = 1;

  class Listener implements WorkerListener {
    constructor(readonly deliver: (event: WorkerEvent) => void) {}
    event(event: WorkerEvent): void {
      this.deliver(event);
    }

    [Symbol.dispose](): void {}
  }

  const workerThreadsCallbacks = {
    WorkerListener: Listener,
    takeWorkerListener(id: number): Listener | undefined {
      const listener = listeners.get(id);
      listeners.delete(id);
      return listener;
    },
  };

  function noTransfers(transferList: unknown): void {
    if (transferList === undefined) {
      return;
    }
    if (!Array.isArray(transferList)) {
      throw invalidArgType("transferList", "Array", transferList);
    }
    if (transferList.length) {
      unavailable.unsupported("worker_threads transferList");
    }
  }

  // Reuse Jco’s audited events adapter; keep public declarations independent of @types/node.
  const Emitter = EventEmitter as unknown as new () => import("./types.js").WorkerEvents;
  class Worker extends Emitter {
    #handle: HostWorker;
    #exitCode?: number;
    #termination?: Promise<number>;
    #resolveTermination?: (code: number) => void;

    constructor(filename: string | URL, options: WorkerOptions = {}) {
      super();
      const filenameIsURL =
        typeof globalThis.URL === "function" && filename instanceof globalThis.URL;
      if (typeof filename !== "string" && !filenameIsURL) {
        throw invalidArgType("filename", ["string", "URL"], filename);
      }
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw invalidArgType("options", "Object", options);
      }
      noTransfers(options.transferList);
      if (options.stdin || options.stdout || options.stderr) {
        unavailable.unsupported("Worker stdio redirection");
      }
      if (typeof options.env === "symbol") {
        unavailable.unsupported("Worker SHARE_ENV");
      }
      // Serialize completely before registering or creating a host worker.
      const encodedOptions = codec.encode({ ...options, filenameIsURL });
      const encodedEnvironment = codec.encode(environment.values);
      const id = nextListener++;
      listeners.set(id, new Listener((event) => this.#event(event)));
      try {
        this.#handle = callHost(
          () => host.createWorker(String(filename), encodedOptions, encodedEnvironment, id),
          fromHost,
        );
      } catch (error) {
        listeners.delete(id);
        throw error;
      }
    }

    #event(event: WorkerEvent): void {
      switch (event.tag) {
        case "online":
          this.emit("online");
          break;
        case "message":
          this.emit("message", decodeMessage(event.val));
          break;
        case "messageerror":
          this.emit("messageerror", fromHost(event.val));
          break;
        case "error":
          this.emit("error", fromHost(event.val));
          break;
        case "exit":
          this.#exitCode = event.val;
          this.#resolveTermination?.(event.val);
          try {
            this.emit("exit", event.val);
          } finally {
            this.#handle[Symbol.dispose]();
          }
      }
    }

    postMessage(value: unknown, transferList?: readonly object[]): void {
      if (this.#exitCode !== undefined) {
        return;
      }
      noTransfers(transferList);
      const encoded = codec.encode(value);
      callHost(() => this.#handle.postMessage(encoded), fromHost);
    }

    terminate(): Promise<number> {
      if (this.#termination) {
        return this.#termination;
      }
      if (this.#exitCode !== undefined) {
        return Promise.resolve(this.#exitCode);
      }
      this.#termination = new Promise((resolve) => {
        this.#resolveTermination = resolve;
      });
      this.#handle.terminate();
      return this.#termination;
    }

    ref(): this {
      if (this.#exitCode === undefined) {
        this.#handle.setRef(true);
      }
      return this;
    }

    unref(): this {
      if (this.#exitCode === undefined) {
        this.#handle.setRef(false);
      }
      return this;
    }

    get threadId(): number {
      return this.#exitCode === undefined ? this.#handle.info().threadId : -1;
    }

    get threadName(): string | null {
      return this.#exitCode === undefined ? this.#handle.info().threadName : null;
    }

    get resourceLimits(): ResourceLimits {
      return this.#exitCode === undefined ? this.#handle.info().resourceLimits : {};
    }

    get stdin(): never {
      return unavailable.unsupported("Worker.stdin");
    }

    get stdout(): never {
      return unavailable.unsupported("Worker.stdout");
    }

    get stderr(): never {
      return unavailable.unsupported("Worker.stderr");
    }

    get performance(): never {
      return unavailable.unsupported("Worker.performance");
    }

    getHeapSnapshot(_options?: object): never {
      return unavailable.unsupported("Worker.getHeapSnapshot()");
    }

    getHeapStatistics(): never {
      return unavailable.unsupported("Worker.getHeapStatistics()");
    }

    cpuUsage(_previous?: { user: number; system: number }): never {
      return unavailable.unsupported("Worker.cpuUsage()");
    }

    startCpuProfile(_options?: object): never {
      return unavailable.unsupported("Worker.startCpuProfile()");
    }

    startHeapProfile(_options?: object): never {
      return unavailable.unsupported("Worker.startHeapProfile()");
    }
    async [Symbol.asyncDispose](): Promise<void> {
      await this.terminate();
    }
  }

  const workerThreads = {
    isInternalThread: false,
    isMainThread: true,
    MessagePort: unavailable.MessagePort,
    MessageChannel: unavailable.MessageChannel,
    markAsUncloneable: codec.markAsUncloneable,
    markAsUntransferable: codec.markAsUntransferable,
    isMarkedAsUntransferable: codec.isMarkedAsUntransferable,
    moveMessagePortToContext: unavailable.moveMessagePortToContext,
    receiveMessageOnPort: unavailable.receiveMessageOnPort,
    resourceLimits: {} as ResourceLimits,
    postMessageToThread: unavailable.postMessageToThread,
    threadId: 0,
    threadName: "",
    SHARE_ENV: Symbol.for("nodejs.worker_threads.SHARE_ENV"),
    Worker,
    parentPort: null,
    workerData: null,
    BroadcastChannel: unavailable.BroadcastChannel,
    setEnvironmentData: environment.setEnvironmentData,
    getEnvironmentData: environment.getEnvironmentData,
    locks: unavailable.locks,
  };
  return { workerThreads, workerThreadsCallbacks };
}
