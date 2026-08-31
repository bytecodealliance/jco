/**
 * Shape of the `jco:node/cluster` host adapter, as generated from
 * `packages/jco-std/wit/node-cluster/cluster.wit`.
 *
 * Declared locally rather than imported so the emitted declarations stay self-contained and this
 * module carries no build-time dependency on generated bindings.
 */

export type WorkerState = "none" | "online" | "listening" | "disconnected" | "dead";

export interface WorkerInfo {
  id: number;
  state: WorkerState;
  exitedAfterDisconnect: boolean;
  connected: boolean;
  dead: boolean;
}

export interface ExitInfo {
  id: number;
  code: number;
  signal: string;
}

export interface MessageInfo {
  id: number;
  json: string;
}

export interface HostSettings {
  silent: boolean;
  args: string[];
  cwd: string;
  schedulingPolicy: number;
}

export type HostEvent =
  | { tag: "fork"; val: number }
  | { tag: "online"; val: number }
  | { tag: "disconnect"; val: number }
  | { tag: "exit"; val: ExitInfo }
  | { tag: "message"; val: MessageInfo }
  | { tag: "setup" };

/**
 * Providers injected by the virtual adapter Jco generates at componentization time.
 *
 * Every member is a function: nothing here may be read at module scope, because componentize-js
 * snapshots the module graph before host imports are callable.
 */
export interface ClusterHost {
  isPrimary(): boolean;
  currentWorker(): WorkerInfo | undefined;
  fork(env: [string, string][]): WorkerInfo;
  listWorkers(): WorkerInfo[];
  getWorker(id: number): WorkerInfo;
  send(id: number, json: string): void;
  disconnectWorker(id: number): void;
  disconnectAll(): void;
  kill(id: number, signal: string): void;
  getSettings(): HostSettings;
  setSettings(value: HostSettings): void;
  drainEvents(): HostEvent[];
}
