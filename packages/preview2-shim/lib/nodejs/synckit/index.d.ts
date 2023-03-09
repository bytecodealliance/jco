/// <reference types="node" />
import { MessagePort } from "node:worker_threads";
export type AnyFn<R = any, T extends any[] = any[]> = (...args: T) => R;
export type AnyPromise<T = any> = Promise<T>;
export type AnyAsyncFn<T = any> = AnyFn<Promise<T>>;
export type Syncify<T extends AnyAsyncFn> = T extends (
  ...args: infer Args
) => Promise<infer R>
  ? (...args: Args) => R
  : never;
export type PromiseType<T extends AnyPromise> = T extends Promise<infer R>
  ? R
  : never;
export interface MainToWorkerMessage<T extends unknown[]> {
  sharedBuffer: SharedArrayBuffer;
  id: number;
  args: T;
}
export interface WorkerData {
  workerPort: MessagePort;
}
export interface DataMessage<T> {
  result?: T;
  error?: unknown;
  properties?: unknown;
}
export interface WorkerToMainMessage<T = unknown> extends DataMessage<T> {
  id: number;
}
export interface SyncifyOptions {
  bufferSize?: number;
  timeout?: number;
  execArgv?: string[];
}
export declare function createSyncFn<T extends AnyAsyncFn>(
  workerPath: string,
  bufferSize?: number,
  timeout?: number
): Syncify<T>;
export declare function createSyncFn<T extends AnyAsyncFn>(
  workerPath: string,
  options?: SyncifyOptions
): Syncify<T>;
export declare function runAsWorker<
  R = unknown,
  T extends AnyAsyncFn<R> = AnyAsyncFn<R>
>(fn: T): void;
