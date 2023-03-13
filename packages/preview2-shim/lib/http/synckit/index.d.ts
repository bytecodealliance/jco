/*
MIT License

Copyright (c) 2021 UnTS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

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
