/**
 * Public contracts adapted from @types/node 24.13.3 (MIT) and Node v24.20.0
 * lib/v8.js, commit 71b8b174857e25106d39b61a9e6f30d927da8b01.
 * Unknown replaces unconstrained values; no Node ambient types are required.
 *
 * MIT License
 *
 * Copyright (c) Microsoft Corporation.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE
 */
import type { HostErrorBase, HostResult } from "../internal/wit-types.js";

export interface V8Buffer extends Uint8Array {
  toString(encoding?: string, start?: number, end?: number): string;
  equals(other: Uint8Array): boolean;
}

export interface HeapSnapshotOptions {
  exposeInternals?: boolean;
  exposeNumericValues?: boolean;
}

export interface HeapInfo {
  total_heap_size: number;
  total_heap_size_executable: number;
  total_physical_size: number;
  total_available_size: number;
  used_heap_size: number;
  heap_size_limit: number;
  malloced_memory: number;
  peak_malloced_memory: number;
  does_zap_garbage: 0 | 1;
  number_of_native_contexts: number;
  number_of_detached_contexts: number;
  total_global_handles_size: number;
  used_global_handles_size: number;
  external_memory: number;
}

export interface HeapSpaceInfo {
  space_name: string;
  space_size: number;
  space_used_size: number;
  space_available_size: number;
  physical_space_size: number;
}

export interface HeapCodeStatistics {
  code_and_metadata_size: number;
  bytecode_and_metadata_size: number;
  external_script_source_size: number;
  cpu_profiler_metadata_size: number;
}

export interface HeapStatistics {
  totalHeapSize: number;
  totalHeapSizeExecutable: number;
  totalPhysicalSize: number;
  totalAvailableSize: number;
  totalGlobalHandlesSize: number;
  usedGlobalHandlesSize: number;
  usedHeapSize: number;
  heapSizeLimit: number;
  mallocedMemory: number;
  externalMemory: number;
  peakMallocedMemory: number;
}

export interface HeapSpaceStatistics {
  spaceName: string;
  spaceSize: number;
  spaceUsedSize: number;
  spaceAvailableSize: number;
  physicalSpaceSize: number;
}

export interface GCProfilerResult {
  version: number;
  startTime: number;
  endTime: number;
  statistics: Array<{
    gcType: string;
    cost: number;
    beforeGC: {
      heapStatistics: HeapStatistics;
      heapSpaceStatistics: HeapSpaceStatistics[];
    };
    afterGC: {
      heapStatistics: HeapStatistics;
      heapSpaceStatistics: HeapSpaceStatistics[];
    };
  }>;
}

export interface SyncCPUProfileHandle {
  stop(): string | undefined;

  [Symbol.dispose](): void;
}

export interface CPUProfileHandle {
  stop(): Promise<string>;

  [Symbol.asyncDispose](): Promise<void>;
}

export type HeapProfileHandle = CPUProfileHandle;

export type Init = (promise: Promise<unknown>, parent: Promise<unknown> | undefined) => void;

export type Before = (promise: Promise<unknown>) => void;

export type After = Before;

export type Settled = Before;

export interface HookCallbacks {
  init?: Init;
  before?: Before;
  after?: After;
  settled?: Settled;
}

export type StartupSnapshotCallbackFn = (data: unknown) => unknown;

export type Result<T> = T | HostResult<T, HostErrorBase>;

export type StatisticsKind = "heap" | "spaces" | "code" | "cpp-brief" | "cpp-detailed";

export interface Writer {
  writeHeader(): Result<void>;

  writeValue(graph: string): Result<boolean>;

  releaseBuffer(): Result<Uint8Array>;

  writeUint32(value: number): Result<void>;

  writeUint64(hi: number, lo: number): Result<void>;

  writeDouble(value: number): Result<void>;

  writeRawBytes(data: Uint8Array): Result<void>;

  setTreatViewsAsHostObjects(flag: boolean): Result<void>;
}

export interface Reader {
  readHeader(): Result<boolean>;

  readValue(): Result<string>;

  getWireFormatVersion(): Result<number>;

  readUint32(): Result<number>;

  readUint64(): Result<[number, number]>;

  readDouble(): Result<number>;

  readRawBytes(length: number): Result<Uint8Array>;
}

export interface Profile {
  stop(): Result<string | undefined>;
}

export interface V8Host {
  cachedDataVersionTag(): Result<number>;

  statistics(kind: StatisticsKind): Result<string>;

  getHeapSnapshot(options: HeapSnapshotOptions): Result<Uint8Array>;

  writeHeapSnapshot(filename: string | undefined, options: HeapSnapshotOptions): Result<string>;

  setFlagsFromString(flags: string): Result<void>;

  takeCoverage(): Result<void>;

  stopCoverage(): Result<void>;

  setHeapSnapshotNearHeapLimit(limit: number): Result<void>;

  openWriter(defaults: boolean): Result<Writer>;

  openReader(data: Uint8Array, defaults: boolean): Result<Reader>;

  startProfile(cpu: boolean): Result<Profile>;

  releaseWriter(writer: Writer): void;

  releaseReader(reader: Reader): void;

  releaseProfile(profile: Profile): void;
}

export interface Serializer {
  writeHeader(): void;

  writeValue(value: unknown): boolean;

  releaseBuffer(): V8Buffer;

  transferArrayBuffer(id: number, arrayBuffer: ArrayBuffer): void;

  writeUint32(value: number): void;

  writeUint64(hi: number, lo: number): void;

  writeDouble(value: number): void;

  writeRawBytes(buffer: ArrayBufferView): void;

  _getDataCloneError: ErrorConstructor;

  _setTreatArrayBufferViewsAsHostObjects(flag: boolean): void;

  [Symbol.dispose](): void;
}

export interface DefaultSerializer extends Serializer {
  _writeHostObject(object: object): void;
}

export interface Deserializer {
  readonly buffer: ArrayBufferView;

  readHeader(): boolean;

  readValue(): unknown;

  transferArrayBuffer(id: number, arrayBuffer: ArrayBuffer): void;

  getWireFormatVersion(): number;

  readUint32(): number;

  readUint64(): [number, number];

  readDouble(): number;

  _readRawBytes(length: number): number;

  readRawBytes(length: number): V8Buffer;

  [Symbol.dispose](): void;
}

export interface DefaultDeserializer extends Deserializer {
  _readHostObject(): unknown;
}

export interface SerializationModule {
  Serializer: new () => Serializer;
  Deserializer: new (buffer: ArrayBufferView) => Deserializer;
  DefaultSerializer: new () => DefaultSerializer;
  DefaultDeserializer: new (buffer: ArrayBufferView) => DefaultDeserializer;

  serialize(value: unknown): V8Buffer;

  deserialize(buffer: ArrayBufferView): unknown;
}

export interface GCProfiler {
  start(): void;

  stop(): GCProfilerResult | undefined;

  [Symbol.dispose](): void;
}

export interface ProfilesModule {
  GCProfiler: new () => GCProfiler;

  startCpuProfile(): SyncCPUProfileHandle;
}

export type QueryConstructor =
  | ((...args: never[]) => unknown)
  | (abstract new (...args: never[]) => object);
