import { Worker as NativeWorker } from "node:worker_threads";
import { isAbsolute } from "node:path";
import { CallbackResource, createCallbackQueue } from "../internal/callback-resource.js";
import { capture, serializeHostError } from "../internal/host-error.js";
import { codedError, invalidArgType } from "../errors/core.js";
import { createMessageCodec, decodeMessage } from "./codec.js";
import type {
  HostWorker,
  Result,
  WorkerCallbacks,
  WorkerEvent,
  WorkerHost,
  WorkerInfo,
  WorkerListener,
  WorkerOptions,
} from "./types.js";

/** Each component gets its own callbacks and workers; importing grants no authority. */
export function createWorkerThreadsHost(getCallbacks: () => WorkerCallbacks): WorkerHost {
  const enqueue = createCallbackQueue();
  const codec = createMessageCodec();

  class Thread implements HostWorker {
    readonly #worker: NativeWorker;
    readonly #listener: CallbackResource<WorkerListener>;
    #disposed = false;
    #exited = false;
    #online = false;
    #earlyMessages: WorkerEvent[] = [];

    constructor(
      filename: string,
      options: WorkerOptions & { filenameIsURL: boolean },
      environment: Map<unknown, unknown>,
      listener: number,
    ) {
      if (options.eval !== undefined && typeof options.eval !== "boolean") {
        throw invalidArgType("options.eval", "boolean", options.eval);
      }
      if (
        !options.eval &&
        !options.filenameIsURL &&
        !isAbsolute(filename) &&
        !/^\.\.?[\\/]/.test(filename)
      ) {
        throw codedError(
          new TypeError(
            "The worker script filename must be an absolute path or a relative path starting with './' or '../'",
          ),
          "ERR_WORKER_PATH",
        );
      }
      if (options.eval && options.filenameIsURL) {
        throw codedError(
          new TypeError("options.eval must be false when filename is a URL"),
          "ERR_INVALID_ARG_VALUE",
        );
      }
      if (
        options.filenameIsURL &&
        !options.eval &&
        !["file:", "data:"].includes(new URL(filename).protocol)
      ) {
        throw codedError(
          new TypeError("Worker URL must use file: or data:"),
          "ERR_INVALID_URL_SCHEME",
        );
      }
      this.#listener = new CallbackResource(
        () => getCallbacks().takeWorkerListener(listener),
        "ERR_JCO_WORKER_THREADS_CALLBACK_REQUIRED",
      );
      this.#worker = new NativeWorker(new URL("./bootstrap.js", import.meta.url), {
        ...options,
        env: typeof options.env === "symbol" ? undefined : options.env,
        eval: false,
        transferList: undefined,
        workerData: {
          filename,
          filenameIsURL: options.filenameIsURL,
          eval: options.eval ?? false,
          data: options.workerData,
          environment,
        },
      });
      this.#worker.once("online", () => {
        this.#online = true;
        this.#deliver({ tag: "online" });
        for (const event of this.#earlyMessages) {
          this.#deliver(event);
        }
        this.#earlyMessages = [];
      });
      this.#worker.on("message", (value: unknown) => {
        let encoded: string;
        try {
          encoded = codec.encode(value);
        } catch (error) {
          this.#deliver({ tag: "messageerror", val: serializeHostError(error) });
          return;
        }
        this.#deliver({ tag: "message", val: encoded });
      });
      this.#worker.on("messageerror", (error: Error) =>
        this.#deliver({ tag: "messageerror", val: serializeHostError(error) }),
      );
      this.#worker.on("error", (error: Error) =>
        this.#deliver({ tag: "error", val: serializeHostError(error) }),
      );
      this.#worker.once("exit", (code) => {
        this.#exited = true;
        this.#deliver({ tag: "exit", val: code });
      });
    }

    #deliver(event: WorkerEvent): void {
      // Node's control port and data port may become readable together. Preserve
      // the startup notification before forwarding an early application message.
      if (!this.#online && (event.tag === "message" || event.tag === "messageerror")) {
        this.#earlyMessages.push(event);
        return;
      }
      void enqueue(async () => {
        if (this.#disposed) {
          return;
        }
        const listener = await this.#listener.get();
        try {
          await listener.event(event);
        } finally {
          if (event.tag === "exit") {
            this.#disposed = true;
            await this.#listener.retire()();
          }
        }
      }).catch((error: unknown) => {
        this[Symbol.dispose]();
        // Callback failures must be visible to the embedding application.
        queueMicrotask(() => {
          throw error;
        });
      });
    }

    postMessage(value: string): Result<void> {
      return capture(() => this.#worker.postMessage(decodeMessage(value)), serializeHostError);
    }

    terminate(): void {
      if (!this.#exited) {
        void this.#worker.terminate();
      }
    }

    setRef(value: boolean): void {
      if (value) {
        this.#worker.ref();
      } else {
        this.#worker.unref();
      }
    }

    info(): WorkerInfo {
      return {
        threadId: this.#worker.threadId,
        threadName: this.#worker.threadName ?? "",
        resourceLimits: this.#worker.resourceLimits ?? {},
      };
    }

    [Symbol.dispose](): void {
      if (this.#disposed) {
        return;
      }
      // Disposal during the guest exit callback must not reenter its destructor.
      this.#disposed = true;
      this.terminate();
      void enqueue(this.#listener.retire());
    }
  }

  return {
    Worker: Thread,
    createWorker(filename, options, environment, listener): Result<HostWorker> {
      return capture(
        () =>
          new Thread(
            filename,
            decodeMessage(options) as WorkerOptions & { filenameIsURL: boolean },
            decodeMessage(environment) as Map<unknown, unknown>,
            listener,
          ),
        serializeHostError,
      );
    },
  };
}
