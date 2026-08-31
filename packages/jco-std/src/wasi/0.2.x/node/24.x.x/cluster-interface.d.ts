import type { HostEvent, HostSettings, WorkerInfo } from "./cluster/types.js";

export function isPrimary(): boolean;
export function currentWorker(): WorkerInfo | undefined;
export function fork(env: [string, string][]): WorkerInfo;
export function listWorkers(): WorkerInfo[];
export function getWorker(id: number): WorkerInfo;
export function send(id: number, json: string): void;
export function disconnectWorker(id: number): void;
export function disconnectAll(): void;
export function kill(id: number, signal: string): void;
export function getSettings(): HostSettings;
export function setSettings(value: HostSettings): void;
export function drainEvents(): HostEvent[];
