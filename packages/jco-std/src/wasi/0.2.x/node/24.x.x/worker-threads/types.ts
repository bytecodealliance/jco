import type { EventEmitter } from "../internal/event-emitter.js";
import type { HostErrorBase, HostResult } from "../internal/wit-types.js";

export interface ResourceLimits {
  maxYoungGenerationSizeMb?: number;
  maxOldGenerationSizeMb?: number;
  codeRangeSizeMb?: number;
  stackSizeMb?: number;
}

export interface WorkerOptions {
  argv?: unknown[];
  env?: Record<string, string | undefined> | symbol;
  eval?: boolean;
  workerData?: unknown;
  stdin?: boolean;
  stdout?: boolean;
  stderr?: boolean;
  execArgv?: string[];
  resourceLimits?: ResourceLimits;
  transferList?: readonly object[];
  trackUnmanagedFds?: boolean;
  name?: string;
}

export interface WorkerInfo {
  threadId: number;
  threadName: string;
  resourceLimits: ResourceLimits;
}

export type WorkerEvent =
  | { tag: "online" }
  | { tag: "message"; val: string }
  | { tag: "messageerror"; val: HostErrorBase }
  | { tag: "error"; val: HostErrorBase }
  | { tag: "exit"; val: number };

export interface WorkerListener extends Disposable {
  event(event: WorkerEvent): void | Promise<void>;
}

export interface WorkerCallbacks {
  takeWorkerListener(id: number): WorkerListener | undefined | Promise<WorkerListener | undefined>;
}

export type Result<T> = HostResult<T, HostErrorBase>;

/** Resource handles and serialized values, never Node Worker or stream objects. */
export interface HostWorker {
  postMessage(value: string): Result<void> | void;
  terminate(): void;
  setRef(value: boolean): void;
  info(): WorkerInfo;
  [Symbol.dispose](): void;
}

export interface WorkerHost {
  Worker: { prototype: HostWorker };
  createWorker(
    filename: string,
    options: string,
    environment: string,
    listener: number,
  ): Result<HostWorker> | HostWorker;
}

export type WorkerEvents = Pick<EventEmitter, keyof EventEmitter>;

export interface Worker extends WorkerEvents {
  postMessage(value: unknown, transferList?: readonly object[]): void;
  terminate(): Promise<number>;
  ref(): this;
  unref(): this;
  readonly threadId: number;
  readonly threadName: string | null;
  readonly resourceLimits: ResourceLimits;
  readonly stdin: never;
  readonly stdout: never;
  readonly stderr: never;
  readonly performance: never;
  getHeapSnapshot(options?: object): never;
  getHeapStatistics(): never;
  cpuUsage(previous?: { user: number; system: number }): never;
  startCpuProfile(options?: object): never;
  startHeapProfile(options?: object): never;
  [Symbol.asyncDispose](): Promise<void>;
}

export interface WorkerThreads {
  isInternalThread: boolean;
  isMainThread: boolean;
  MessagePort: typeof import("./unsupported.js").MessagePort;
  MessageChannel: typeof import("./unsupported.js").MessageChannel;
  BroadcastChannel: typeof import("./unsupported.js").BroadcastChannel;
  markAsUncloneable(value: unknown): void;
  markAsUntransferable(value: unknown): void;
  isMarkedAsUntransferable(value: unknown): boolean;
  moveMessagePortToContext: typeof import("./unsupported.js").moveMessagePortToContext;
  receiveMessageOnPort: typeof import("./unsupported.js").receiveMessageOnPort;
  postMessageToThread: typeof import("./unsupported.js").postMessageToThread;
  resourceLimits: ResourceLimits;
  threadId: number;
  threadName: string;
  SHARE_ENV: symbol;
  Worker: new (filename: string | URL, options?: WorkerOptions) => Worker;
  parentPort: null;
  workerData: null;
  setEnvironmentData(key: unknown, value?: unknown): void;
  getEnvironmentData(key: unknown): unknown;
  locks: typeof import("./unsupported.js").locks;
}

export interface WorkerThreadsImplementation {
  workerThreads: WorkerThreads;
  workerThreadsCallbacks: WorkerCallbacks & {
    WorkerListener: new (deliver: (event: WorkerEvent) => void) => WorkerListener;
  };
}
