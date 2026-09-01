/**
 * Iterable-stream protocols and public TypeScript contracts.
 *
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/internal/streams/iter/types.js and doc/api/stream_iter.md (MIT license).
 * Local changes replace Node's internal symbols and Web IDL bindings with
 * self-contained TypeScript types over standard ECMAScript values.
 */

export const toStreamable: unique symbol = Symbol.for("Stream.toStreamable");
export const toAsyncStreamable: unique symbol = Symbol.for("Stream.toAsyncStreamable");
export const broadcastProtocol: unique symbol = Symbol.for("Stream.broadcastProtocol");
export const shareProtocol: unique symbol = Symbol.for("Stream.shareProtocol");
export const shareSyncProtocol: unique symbol = Symbol.for("Stream.shareSyncProtocol");
export const drainableProtocol: unique symbol = Symbol.for("Stream.drainableProtocol");

export type ByteBatch = Uint8Array[];
export type ByteReadableStream = AsyncIterable<ByteBatch>;
export type SyncByteReadableStream = Iterable<ByteBatch>;

export interface Streamable {
  [toStreamable](): SyncSource;
}

export interface AsyncStreamable {
  [toAsyncStreamable](): Source | PromiseLike<unknown>;
}

export type SyncSource =
  | string
  | ArrayBufferLike
  | ArrayBufferView
  | Iterable<SyncSource>
  | Streamable;

export type Source = SyncSource | AsyncIterable<unknown> | AsyncStreamable;

export interface TransformCallbackOptions {
  signal: AbortSignal;
}

export type SyncTransformResult = SyncSource | null;
export type TransformResult = Source | null;

export type SyncStatelessTransform = (chunks: ByteBatch | null) => SyncTransformResult;
export type StatelessTransform = (
  chunks: ByteBatch | null,
  options: TransformCallbackOptions,
) => TransformResult | PromiseLike<TransformResult>;

export interface SyncStatefulTransform {
  transform(source: Iterable<ByteBatch | null>): Iterable<SyncTransformResult>;
}

export interface StatefulTransform {
  transform(
    source: AsyncIterable<ByteBatch | null>,
    options: TransformCallbackOptions,
  ): AsyncIterable<TransformResult>;
}

export type SyncTransform = SyncStatelessTransform | SyncStatefulTransform;
export type Transform = StatelessTransform | StatefulTransform;

export type BackpressurePolicy = "strict" | "unbounded" | "drop-oldest" | "drop-newest";

export interface WriteOptions {
  signal?: AbortSignal;
}

export interface Writer extends Disposable, AsyncDisposable {
  readonly desiredSize: number | null;
  write(chunk: Uint8Array | string, options?: WriteOptions): Promise<void>;
  writev(chunks: Array<Uint8Array | string>, options?: WriteOptions): Promise<void>;
  writeSync(chunk: Uint8Array | string): boolean;
  writevSync(chunks: Array<Uint8Array | string>): boolean;
  end(options?: WriteOptions): Promise<number>;
  endSync(): number;
  fail(reason?: unknown): void;
}

export interface PartialWriter extends Partial<Writer> {
  write(chunk: Uint8Array | string, options?: WriteOptions): Promise<void>;
}

export interface SyncWriter extends Disposable {
  readonly desiredSize: number | null;
  writeSync(chunk: Uint8Array | string): number | boolean;
  writevSync(chunks: Array<Uint8Array | string>): number | boolean;
  endSync(): number;
  fail(reason?: unknown): void;
}

export interface PartialSyncWriter extends Partial<SyncWriter> {
  writeSync(chunk: Uint8Array | string): number | boolean;
}

export interface PushOptions {
  budget?: number;
  backpressure?: BackpressurePolicy;
  signal?: AbortSignal;
}

export interface PullOptions {
  signal?: AbortSignal;
}

export interface PipeToOptions extends PullOptions {
  preventClose?: boolean;
  preventFail?: boolean;
}

export interface PipeToSyncOptions {
  preventClose?: boolean;
  preventFail?: boolean;
}

export interface ConsumeOptions {
  signal?: AbortSignal;
  limit?: number;
}

export interface TextConsumeOptions extends ConsumeOptions {
  encoding?: string;
}

export interface ConsumeSyncOptions {
  limit?: number;
}

export interface TextConsumeSyncOptions extends ConsumeSyncOptions {
  encoding?: string;
}

export interface MergeOptions {
  signal?: AbortSignal;
}

export type MulticastOptions = PushOptions;

export interface DuplexDirectionOptions {
  budget?: number;
  backpressure?: BackpressurePolicy;
}

export interface DuplexOptions extends DuplexDirectionOptions {
  a?: DuplexDirectionOptions;
  b?: DuplexDirectionOptions;
  signal?: AbortSignal;
}

export interface Drainable {
  [drainableProtocol](): Promise<boolean> | null;
}

export interface PushWriter extends Writer, Drainable {}

export interface PushResult {
  writer: PushWriter;
  readable: ByteReadableStream;
}

export interface BroadcastWriter extends Writer, Drainable {}

export interface BroadcastResult {
  writer: BroadcastWriter;
  broadcast: Broadcast;
}

export interface Broadcast extends Disposable {
  readonly consumerCount: number;
  readonly bufferSize: number;
  push(...args: Array<Transform | PushOptions>): ByteReadableStream;
  cancel(reason?: unknown): void;
}

export interface Share extends Disposable {
  readonly consumerCount: number;
  readonly bufferSize: number;
  pull(...args: Array<Transform | PullOptions>): ByteReadableStream;
  cancel(reason?: unknown): void;
}

export interface SyncShare extends Disposable {
  readonly consumerCount: number;
  readonly bufferSize: number;
  pull(...transforms: SyncTransform[]): SyncByteReadableStream;
  cancel(reason?: unknown): void;
}

export interface DuplexChannel extends AsyncDisposable {
  readonly writer: Writer;
  readonly readable: ByteReadableStream;
  close(): Promise<void>;
}

export interface ClassicReadable {
  read(size?: number): unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
  pause?(): unknown;
  resume?(): unknown;
  destroy?(error?: Error): unknown;
  readableEnded?: boolean;
  readableObjectMode?: boolean;
  readableEncoding?: string | null;
  [toAsyncStreamable]?(): Source | PromiseLike<unknown>;
}

export interface ClassicWritable {
  write(chunk: Uint8Array, callback?: (error?: Error | null) => void): boolean;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
  once?(event: string, listener: (...args: unknown[]) => void): unknown;
  end(callback?: (error?: Error | null) => void): unknown;
  destroy?(error?: Error): unknown;
  cork?(): void;
  uncork?(): void;
  writableEnded?: boolean;
  writableObjectMode?: boolean;
  writableHighWaterMark?: number;
  writableLength?: number;
}

export interface FromWritableOptions {
  backpressure?: BackpressurePolicy;
}
