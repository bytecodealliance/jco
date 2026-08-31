import { EventEmitter } from "../internal/event-emitter.js";

import { deprecated, unsupported } from "./errors.js";
import type { ClusterHost, HostEvent, HostSettings, WorkerInfo } from "./types.js";
import { Worker } from "./worker.js";

export { EventEmitter } from "../internal/event-emitter.js";
export { Worker } from "./worker.js";
export type { ClusterHost, HostEvent, HostSettings, WorkerInfo, WorkerState } from "./types.js";
export { DEPRECATED_CODE, UNSUPPORTED_CODE } from "./errors.js";

/** Node's scheduling policy constants. */
export const SCHED_NONE = 1;
export const SCHED_RR = 2;

/** Settings Node accepts but that describe the host runner rather than anything the guest owns. */
const HOST_OWNED_SETTINGS = [
  "exec",
  "execArgv",
  "stdio",
  "uid",
  "gid",
  "inspectPort",
  "serialization",
];

export interface ClusterSettings {
  silent?: boolean;
  args?: string[];
  cwd?: string;
  schedulingPolicy?: number;
}

/**
 * Guest-side `node:cluster`.
 *
 * Node's cluster is push-based and the host boundary is pull-based, so host events are drained
 * and re-emitted whenever the guest touches the module. See `pump()`.
 */
export interface Cluster extends EventEmitter {
  readonly SCHED_NONE: number;
  readonly SCHED_RR: number;
  readonly Worker: typeof Worker;
  readonly isPrimary: boolean;
  readonly isWorker: boolean;
  readonly isMaster: never;
  readonly workers: Record<number, Worker>;
  readonly worker: Worker | undefined;
  settings: ClusterSettings;
  schedulingPolicy: number;
  fork(env?: Record<string, string>): Worker;
  disconnect(callback?: () => void): void;
  setupPrimary(settings?: ClusterSettings): void;
  setupMaster(settings?: ClusterSettings): never;
  /** Drain queued host events and emit them. Jco-specific; see the docs on delivery timing. */
  pump(): void;
}

/**
 * Build the `node:cluster` module surface over a host adapter.
 *
 * Nothing touches `host` until an API is called, so a component that imports `node:cluster`
 * without using it never reaches the host.
 *
 * @param host - providers supplied by Jco's generated virtual adapter
 */
export function createCluster(host: ClusterHost): Cluster {
  const cluster = new EventEmitter() as Cluster;
  const workers: Record<number, Worker> = {};

  /** Track a worker from a snapshot the host already gave us. */
  const track = (info: WorkerInfo): Worker => {
    const existing = workers[info.id];
    if (existing) {
      existing._update(info);
      return existing;
    }
    const worker = new Worker(host, info);
    workers[info.id] = worker;
    return worker;
  };

  /**
   * Track a worker known only by id, as events report it.
   *
   * Only the primary can look a worker up: a worker process has no `cluster.workers`, so the host
   * cannot answer there. Fall back to a minimal record rather than failing, which is what lets a
   * worker observe its own events.
   */
  const trackById = (id: number): Worker => {
    const existing = workers[id];
    if (existing) {
      return existing;
    }
    try {
      return track(host.getWorker(id));
    } catch {
      return track({
        id,
        state: "none",
        exitedAfterDisconnect: false,
        connected: false,
        dead: false,
      });
    }
  };

  /**
   * Re-emit host events on both the cluster and the worker they concern.
   *
   * Node delivers these on its event loop. The guest has no way to be called back across the
   * host boundary, so they surface on the next interaction with the module instead. This is a
   * real difference from Node and is documented and tested as such.
   */
  const pump = (): void => {
    for (const event of host.drainEvents()) {
      dispatch(event);
    }
  };

  const dispatch = (event: HostEvent): void => {
    switch (event.tag) {
      case "fork": {
        const worker = trackById(event.val);
        cluster.emit("fork", worker);
        return;
      }
      case "online": {
        const worker = trackById(event.val);
        worker.emit("online");
        cluster.emit("online", worker);
        return;
      }
      case "disconnect": {
        const worker = trackById(event.val);
        worker.emit("disconnect");
        cluster.emit("disconnect", worker);
        return;
      }
      case "exit": {
        const worker = trackById(event.val.id);
        worker._update({
          id: event.val.id,
          state: "dead",
          exitedAfterDisconnect: event.val.signal === "",
          connected: false,
          dead: true,
        });
        delete workers[event.val.id];
        const signal = event.val.signal === "" ? null : event.val.signal;
        worker.emit("exit", event.val.code, signal);
        cluster.emit("exit", worker, event.val.code, signal);
        return;
      }
      case "message": {
        const worker = trackById(event.val.id);
        const message: unknown = event.val.json === "" ? undefined : JSON.parse(event.val.json);
        worker.emit("message", message);
        cluster.emit("message", worker, message);
        return;
      }
      case "setup": {
        cluster.emit("setup", cluster.settings);
        return;
      }
    }
  };

  const toHostSettings = (value: ClusterSettings): HostSettings => {
    const current = host.getSettings();
    return {
      silent: value.silent ?? current.silent,
      args: value.args ?? current.args,
      cwd: value.cwd ?? current.cwd,
      schedulingPolicy: value.schedulingPolicy ?? current.schedulingPolicy,
    };
  };

  Object.defineProperties(cluster, {
    SCHED_NONE: { value: SCHED_NONE, enumerable: true },
    SCHED_RR: { value: SCHED_RR, enumerable: true },
    Worker: { value: Worker, enumerable: true },

    isPrimary: {
      enumerable: true,
      get: () => host.isPrimary(),
    },
    isWorker: {
      enumerable: true,
      get: () => !host.isPrimary(),
    },

    /**
     * Deprecated in Node in favour of `isPrimary`. A throwing getter rather than a value, so
     * reading it fails loudly instead of silently disagreeing with `isPrimary`.
     */
    isMaster: {
      enumerable: true,
      get: (): never => {
        throw deprecated("cluster.isMaster", "cluster.isPrimary");
      },
    },

    workers: {
      enumerable: true,
      get: () => {
        pump();
        return workers;
      },
    },

    worker: {
      enumerable: true,
      get: () => {
        const info = host.currentWorker();
        if (!info) {
          return undefined;
        }
        return track(info);
      },
    },

    settings: {
      enumerable: true,
      get: (): ClusterSettings => {
        const current = host.getSettings();
        return {
          silent: current.silent,
          args: [...current.args],
          cwd: current.cwd,
          schedulingPolicy: current.schedulingPolicy,
        };
      },
      set: (value: ClusterSettings) => {
        host.setSettings(toHostSettings(value));
      },
    },

    schedulingPolicy: {
      enumerable: true,
      get: () => host.getSettings().schedulingPolicy,
      set: (value: number) => {
        host.setSettings({ ...host.getSettings(), schedulingPolicy: value });
      },
    },
  });

  cluster.fork = (env: Record<string, string> = {}): Worker => {
    const info = host.fork(Object.entries(env));
    const worker = track(info);
    pump();
    return worker;
  };

  cluster.disconnect = (callback?: () => void): void => {
    host.disconnectAll();
    pump();
    if (callback) {
      callback();
    }
  };

  cluster.setupPrimary = (settings: ClusterSettings = {}): void => {
    for (const key of HOST_OWNED_SETTINGS) {
      if (key in settings) {
        throw unsupported(
          `cluster.setupPrimary({ ${key} })`,
          "it configures the host runner that executes this component, not a guest file",
        );
      }
    }
    host.setSettings(toHostSettings(settings));
    pump();
  };

  /** Deprecated in Node in favour of `setupPrimary`; throws before touching its argument. */
  cluster.setupMaster = (): never => {
    throw deprecated("cluster.setupMaster()", "cluster.setupPrimary()");
  };

  cluster.pump = pump;

  return cluster;
}
