import { EventEmitter } from "../internal/event-emitter.js";

import { unsupported } from "./errors.js";
import type { ClusterHost, WorkerInfo, WorkerState } from "./types.js";

/**
 * Guest-side view of a cluster worker, mirroring Node's `cluster.Worker`.
 *
 * State is not cached: every getter re-reads the host so a worker observed after an event
 * reports what the host actually knows, the way Node's live worker objects do.
 */
export class Worker extends EventEmitter {
  /** Worker id, as assigned by the host's cluster primary. */
  readonly id: number;

  readonly #host: ClusterHost;
  /** Last host snapshot, used only when the worker is gone and the host can no longer report. */
  #lastKnown: WorkerInfo;

  constructor(host: ClusterHost, info: WorkerInfo) {
    super();
    this.#host = host;
    this.id = info.id;
    this.#lastKnown = info;
  }

  /** Refresh from the host, falling back to the last snapshot once the worker is gone. */
  #info(): WorkerInfo {
    try {
      this.#lastKnown = this.#host.getWorker(this.id);
    } catch {
      // A dead worker is no longer known to the host; its final state is still observable.
    }
    return this.#lastKnown;
  }

  /** Record a host snapshot, so post-exit reads report the final state. */
  _update(info: WorkerInfo): void {
    this.#lastKnown = info;
  }

  get state(): WorkerState {
    return this.#info().state;
  }

  get exitedAfterDisconnect(): boolean {
    return this.#info().exitedAfterDisconnect;
  }

  /**
   * Node exposes the worker's `ChildProcess` here.
   *
   * A `ChildProcess` is a live handle with streams, a pid, and its own event surface; none of
   * that can cross the component boundary, and returning a partial stand-in would fail later in
   * ways that look like bugs in user code.
   */
  get process(): never {
    throw unsupported(
      "worker.process",
      "it is a ChildProcess handle, which cannot cross the component boundary",
    );
  }

  isConnected(): boolean {
    return this.#info().connected;
  }

  isDead(): boolean {
    return this.#info().dead;
  }

  /**
   * Send a message to this worker.
   *
   * WIT has no dynamic value type, so messages cross as JSON. Values JSON cannot represent
   * (functions, symbols, cycles, BigInt) are rejected here rather than arriving altered.
   */
  send(message: unknown): boolean {
    let json: string;
    try {
      json = JSON.stringify(message);
    } catch (cause) {
      throw unsupported(
        "worker.send(message)",
        `messages cross the host boundary as JSON and this value cannot be serialized (${String(cause)})`,
      );
    }
    if (json === undefined) {
      throw unsupported(
        "worker.send(message)",
        "messages cross the host boundary as JSON and this value has no JSON representation",
      );
    }
    this.#host.send(this.id, json);
    return true;
  }

  disconnect(): this {
    this.#host.disconnectWorker(this.id);
    return this;
  }

  kill(signal = "SIGTERM"): void {
    this.#host.kill(this.id, signal);
  }

  /** Node's `destroy` is an alias of `kill`. */
  destroy(signal = "SIGTERM"): void {
    this.kill(signal);
  }
}
