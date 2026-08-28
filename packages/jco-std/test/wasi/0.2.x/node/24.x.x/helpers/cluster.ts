import type {
  ClusterHost,
  HostEvent,
  HostSettings,
  WorkerInfo,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/host.js";

/**
 * In-memory stand-in for the `jco:node/cluster` host adapter.
 *
 * It records calls and lets a test queue events, so the shim's translation of the host contract
 * can be exercised without a process model. It deliberately does not model Node's cluster
 * semantics -- those belong to the host and are covered by the guest-side tests.
 */
export class FakeClusterHost implements ClusterHost {
  primary = true;
  current: WorkerInfo | undefined;
  settings: HostSettings = { silent: false, args: [], cwd: "/", schedulingPolicy: 2 };

  readonly workers = new Map<number, WorkerInfo>();
  readonly calls: string[] = [];
  readonly sent: { id: number; json: string }[] = [];

  #events: HostEvent[] = [];
  #nextId = 1;

  /** Queue events for the shim to drain, as the host would after real cluster activity. */
  queue(...events: HostEvent[]): void {
    this.#events.push(...events);
  }

  isPrimary(): boolean {
    this.calls.push("isPrimary");
    return this.primary;
  }

  currentWorker(): WorkerInfo | undefined {
    this.calls.push("currentWorker");
    return this.current;
  }

  fork(env: [string, string][]): WorkerInfo {
    this.calls.push(`fork(${JSON.stringify(env)})`);
    const info: WorkerInfo = {
      id: this.#nextId++,
      state: "none",
      exitedAfterDisconnect: false,
      connected: true,
      dead: false,
    };
    this.workers.set(info.id, info);
    this.queue({ tag: "fork", val: info.id });
    return info;
  }

  listWorkers(): WorkerInfo[] {
    this.calls.push("listWorkers");
    return [...this.workers.values()];
  }

  getWorker(id: number): WorkerInfo {
    this.calls.push(`getWorker(${id})`);
    const info = this.workers.get(id);
    if (!info) {
      throw new Error(`no such worker: ${id}`);
    }
    return info;
  }

  send(id: number, json: string): void {
    this.calls.push(`send(${id})`);
    this.sent.push({ id, json });
  }

  disconnectWorker(id: number): void {
    this.calls.push(`disconnectWorker(${id})`);
    this.queue({ tag: "disconnect", val: id });
  }

  disconnectAll(): void {
    this.calls.push("disconnectAll");
    for (const id of this.workers.keys()) {
      this.queue({ tag: "disconnect", val: id });
    }
  }

  kill(id: number, signal: string): void {
    this.calls.push(`kill(${id},${signal})`);
  }

  getSettings(): HostSettings {
    this.calls.push("getSettings");
    return { ...this.settings, args: [...this.settings.args] };
  }

  setSettings(value: HostSettings): void {
    this.calls.push("setSettings");
    this.settings = { ...value, args: [...value.args] };
    this.queue({ tag: "setup" });
  }

  drainEvents(): HostEvent[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }
}
